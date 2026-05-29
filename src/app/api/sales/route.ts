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

    // ─── Pre-check stock availability before creating the sale ───
    const productIds = data.items.map((item: any) => item.productId)
    const products = await db.product.findMany({
      where: { id: { in: productIds }, active: true },
      select: { id: true, name: true, quantity: true },
    })

    // Check each item has sufficient stock
    for (const item of data.items) {
      const product = products.find((p: any) => p.id === item.productId)
      if (!product) {
        return NextResponse.json({ error: `Product not found or inactive: ${item.productName || item.productId}` }, { status: 400 })
      }
      // Aggregate total quantity for this product across all cart items
      const totalQtyForProduct = data.items
        .filter((i: any) => i.productId === item.productId)
        .reduce((sum: number, i: any) => sum + i.quantity, 0)
      if (totalQtyForProduct > product.quantity) {
        return NextResponse.json({
          error: `Insufficient stock for "${product.name}". Available: ${product.quantity}, Requested: ${totalQtyForProduct}`,
        }, { status: 400 })
      }
    }

    // Generate invoice number
    const settings = await db.setting.findUnique({ where: { key: 'receiptPrefix' } })
    const prefix = settings?.value || 'INV'
    const count = await db.sale.count()
    const invoiceNumber = `${prefix}-${String(count + 1).padStart(4, '0')}`

    const subtotal = data.items.reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0)
    const discount = parseFloat(data.discount) || 0

    // Validate discount: must be non-negative and cannot exceed subtotal
    if (discount < 0) {
      return NextResponse.json({ error: 'Discount cannot be negative' }, { status: 400 })
    }
    if (discount > subtotal) {
      return NextResponse.json({ error: `Discount (KES ${discount.toLocaleString()}) cannot exceed subtotal (KES ${subtotal.toLocaleString()})` }, { status: 400 })
    }

    const total = subtotal - discount

    // Wrap entire sale creation in a transaction for atomicity
    const sale = await db.$transaction(async (tx) => {
      // ─── Re-check stock inside transaction to prevent race conditions ───
      for (const item of data.items) {
        const currentProduct = await tx.product.findUnique({
          where: { id: item.productId },
          select: { quantity: true, name: true },
        })
        if (!currentProduct || currentProduct.quantity < item.quantity) {
          throw new Error(`Insufficient stock for "${currentProduct?.name || item.productId}". Available: ${currentProduct?.quantity || 0}`)
        }
      }

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

      // Create individual sales entries per item (mirror for Sales Tracking)
      // Each item gets its own SalesEntry with proportionally distributed discount
      // This ensures: sum of all POS SalesEntry amounts = Sale.total (after discount)
      const discountRatio = subtotal > 0 ? total / subtotal : 1 // proportion after discount
      for (const item of data.items) {
        const itemTotal = item.price * item.quantity
        const discountedAmount = Math.round(itemTotal * discountRatio * 100) / 100 // proportional after discount
        await tx.salesEntry.create({
          data: {
            productName: item.productName || item.productId,
            quantity: item.quantity,
            amount: discountedAmount,
            date: new Date(),
            userId: auth.user!.id,
            source: 'pos',
            saleId: newSale.id,
          },
        })
      }

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

    return NextResponse.json(sale, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    })
  } catch (error: any) {
    console.error('Sales POST error:', error)
    // If the error is from our stock check inside the transaction
    if (error.message?.startsWith('Insufficient stock')) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ error: 'Failed to create sale' }, { status: 500 })
  }
}
