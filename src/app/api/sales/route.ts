import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyAuth } from '@/lib/auth'

export async function GET(request: Request) {
  try {
    const auth = await verifyAuth()
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const userId = searchParams.get('userId')

    const where: any = {}
    if (userId) where.userId = userId

    const [sales, total] = await Promise.all([
      db.sale.findMany({
        where,
        include: {
          items: { include: { product: true } },
          user: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.sale.count({ where }),
    ])

    return NextResponse.json({ sales, total, page, limit })
  } catch (error) {
    console.error('Sales GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch sales' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await verifyAuth()
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const data = await request.json()

    // Generate invoice number
    const settings = await db.setting.findUnique({ where: { key: 'receiptPrefix' } })
    const prefix = settings?.value || 'INV'
    const count = await db.sale.count()
    const invoiceNumber = `${prefix}-${String(count + 1).padStart(4, '0')}`

    const subtotal = data.items.reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0)
    const discount = data.discount || 0
    const total = subtotal - discount

    const sale = await db.sale.create({
      data: {
        invoiceNumber,
        customerName: data.customerName || null,
        customerPhone: data.customerPhone || null,
        userId: auth.user!.id,
        subtotal,
        discount,
        total,
        paymentMethod: data.paymentMethod || 'cash',
        paymentStatus: 'paid',
        notes: data.notes || null,
        items: {
          create: data.items.map((item: any) => ({
            productId: item.productId,
            quantity: item.quantity,
            price: item.price,
            total: item.price * item.quantity,
          })),
        },
      },
      include: { items: { include: { product: true } }, user: true },
    })

    // Update stock
    for (const item of data.items) {
      await db.product.update({
        where: { id: item.productId },
        data: { quantity: { decrement: item.quantity } },
      })
      await db.stockMove.create({
        data: {
          productId: item.productId,
          type: 'out',
          quantity: item.quantity,
          reason: `Sale ${invoiceNumber}`,
          reference: sale.id,
        },
      })
    }

    // Create sales entry
    await db.salesEntry.create({
      data: {
        productName: data.items.map((i: any) => i.productName || i.productId).join(', '),
        quantity: data.items.reduce((sum: number, i: any) => sum + i.quantity, 0),
        amount: total,
        date: new Date(),
        userId: auth.user!.id,
        source: 'pos',
        saleId: sale.id,
      },
    })

    // Check for low stock notifications
    for (const item of data.items) {
      const product = await db.product.findUnique({ where: { id: item.productId } })
      if (product && product.quantity - item.quantity <= product.minStock) {
        await db.notification.create({
          data: {
            type: 'low_stock',
            title: 'Low Stock Alert',
            message: `${product.name} is running low (${product.quantity - item.quantity} remaining)`,
            productId: product.id,
          },
        })
      }
    }

    return NextResponse.json(sale)
  } catch (error) {
    console.error('Sales POST error:', error)
    return NextResponse.json({ error: 'Failed to create sale' }, { status: 500 })
  }
}
