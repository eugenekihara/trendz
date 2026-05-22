import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyAuth } from '@/lib/auth'

// Force dynamic rendering — never cache this route
export const dynamic = 'force-dynamic'

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

    return NextResponse.json(
      { sales, total, page, limit },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    )
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

    if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
      return NextResponse.json({ error: 'Sale must have at least one item' }, { status: 400 })
    }

    // Validate items
    for (const item of data.items) {
      if (!item.productId || !item.quantity || item.quantity <= 0) {
        return NextResponse.json({ error: 'Each item must have a valid product and quantity' }, { status: 400 })
      }
      const price = parseFloat(item.price)
      if (isNaN(price) || price < 0) {
        return NextResponse.json({ error: 'Each item must have a valid price' }, { status: 400 })
      }
    }

    // Generate invoice number
    const settings = await db.setting.findUnique({ where: { key: 'receiptPrefix' } })
    const prefix = settings?.value || 'INV'
    const count = await db.sale.count()
    const invoiceNumber = `${prefix}-${String(count + 1).padStart(4, '0')}`

    const subtotal = data.items.reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0)
    const discount = parseFloat(data.discount) || 0
    const total = subtotal - discount

    // Wrap entire sale creation in a transaction for atomicity
    const sale = await db.$transaction(async (tx) => {
      const newSale = await tx.sale.create({
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

      // Update stock and create stock moves
      for (const item of data.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { quantity: { decrement: item.quantity } },
        })
        await tx.stockMove.create({
          data: {
            productId: item.productId,
            type: 'out',
            quantity: item.quantity,
            reason: `Sale ${invoiceNumber}`,
            reference: newSale.id,
          },
        })
      }

      // Create sales entry
      await tx.salesEntry.create({
        data: {
          productName: data.items.map((i: any) => i.productName || i.productId).join(', '),
          quantity: data.items.reduce((sum: number, i: any) => sum + i.quantity, 0),
          amount: total,
          date: new Date(),
          userId: auth.user!.id,
          source: 'pos',
          saleId: newSale.id,
        },
      })

      // Check for low stock notifications (quantity is already decremented at this point)
      for (const item of data.items) {
        const product = await tx.product.findUnique({ where: { id: item.productId } })
        if (product && product.quantity <= product.minStock) {
          await tx.notification.create({
            data: {
              type: 'low_stock',
              title: 'Low Stock Alert',
              message: `${product.name} is running low (${product.quantity} remaining)`,
              productId: product.id,
            },
          })
        }
      }

      return newSale
    })

    return NextResponse.json(sale)
  } catch (error) {
    console.error('Sales POST error:', error)
    return NextResponse.json({ error: 'Failed to create sale' }, { status: 500 })
  }
}
