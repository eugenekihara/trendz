import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyAuth } from '@/lib/auth'

// Force dynamic rendering — never cache this route
export const dynamic = 'force-dynamic'

/**
 * GET /api/credits - List credit orders
 * Query params:
 *   status: filter by payment status
 *   search: search customer name or phone
 *   userId: filter by staff user
 */
export async function GET(request: Request) {
  try {
    const auth = await verifyAuth()
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const search = searchParams.get('search')
    const userIdFilter = searchParams.get('userId')

    const where: any = {}

    // Staff can only see their own credit orders
    if (auth.user?.role === 'staff') {
      where.userId = auth.user.id
    } else if (userIdFilter) {
      where.userId = userIdFilter
    }

    if (status && status !== 'all') {
      where.paymentStatus = status
    }

    // Search by customer name or phone (post-filter for SQLite)
    if (search) {
      // We'll filter after fetching since SQLite text search is limited
    }

    const creditOrders = await db.creditOrder.findMany({
      where,
      include: {
        user: { select: { id: true, name: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, category: { select: { name: true } } } },
          },
        },
        payments: {
          include: { user: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Post-filter by search term (customer name or phone)
    let filtered = creditOrders
    if (search) {
      const term = search.toLowerCase()
      filtered = creditOrders.filter(
        (order) =>
          order.customerName.toLowerCase().includes(term) ||
          (order.customerPhone && order.customerPhone.toLowerCase().includes(term))
      )
    }

    // Compute summary stats
    const totalOutstanding = filtered.reduce((sum, o) => sum + o.remainingBalance, 0)
    const totalCreditAmount = filtered.reduce((sum, o) => sum + o.totalAmount, 0)
    const totalDepositPaid = filtered.reduce((sum, o) => sum + o.depositAmount, 0)
    const totalPayments = filtered.reduce((sum, o) => sum + o.payments.reduce((s, p) => s + p.amount, 0), 0)
    const fullyPaidCount = filtered.filter((o) => o.paymentStatus === 'fully_paid').length
    const depositPaidCount = filtered.filter((o) => o.paymentStatus === 'deposit_paid').length
    const partiallyPaidCount = filtered.filter((o) => o.paymentStatus === 'partially_paid').length
    const overdueCount = filtered.filter((o) => o.paymentStatus === 'overdue').length

    return NextResponse.json(
      {
        creditOrders: filtered,
        summary: {
          totalOutstanding,
          totalCreditAmount,
          totalDepositPaid,
          totalPayments,
          fullyPaidCount,
          depositPaidCount,
          partiallyPaidCount,
          overdueCount,
          totalOrders: filtered.length,
        },
      },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    )
  } catch (error) {
    console.error('Credits GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch credit orders' }, { status: 500 })
  }
}

/**
 * POST /api/credits - Create a new credit order
 * Body: { customerName, customerPhone, items, depositAmount, dueDate, notes }
 */
export async function POST(request: Request) {
  try {
    const auth = await verifyAuth()
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const data = await request.json()

    // Validate required fields
    if (!data.customerName?.trim()) {
      return NextResponse.json({ error: 'Customer name is required' }, { status: 400 })
    }

    if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
      return NextResponse.json({ error: 'Credit order must have at least one item' }, { status: 400 })
    }

    // Validate items and check stock
    for (const item of data.items) {
      if (!item.productId || !item.quantity || item.quantity <= 0) {
        return NextResponse.json({ error: 'Each item must have a valid product and quantity' }, { status: 400 })
      }
      const price = parseFloat(item.price)
      if (isNaN(price) || price < 0) {
        return NextResponse.json({ error: 'Each item must have a valid price' }, { status: 400 })
      }
    }

    const depositAmount = parseFloat(data.depositAmount) || 0

    // Pre-check stock availability
    const productIds = data.items.map((item: any) => item.productId)
    const products = await db.product.findMany({
      where: { id: { in: productIds }, active: true },
      select: { id: true, name: true, quantity: true },
    })

    for (const item of data.items) {
      const product = products.find((p: any) => p.id === item.productId)
      if (!product) {
        return NextResponse.json({ error: `Product not found or inactive: ${item.productName || item.productId}` }, { status: 400 })
      }
      const totalQtyForProduct = data.items
        .filter((i: any) => i.productId === item.productId)
        .reduce((sum: number, i: any) => sum + i.quantity, 0)
      if (totalQtyForProduct > product.quantity) {
        return NextResponse.json({
          error: `Insufficient stock for "${product.name}". Available: ${product.quantity}, Requested: ${totalQtyForProduct}`,
        }, { status: 400 })
      }
    }

    const totalAmount = data.items.reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0)
    const remainingBalance = totalAmount - depositAmount

    if (depositAmount > totalAmount) {
      return NextResponse.json({ error: 'Deposit cannot exceed total amount' }, { status: 400 })
    }

    // Determine initial payment status
    let paymentStatus = 'deposit_paid'
    if (depositAmount >= totalAmount) {
      paymentStatus = 'fully_paid'
    } else if (depositAmount === 0) {
      paymentStatus = 'partially_paid' // no deposit yet
    }

    // Wrap in transaction for atomicity
    const creditOrder = await db.$transaction(async (tx) => {
      // Re-check stock inside transaction
      for (const item of data.items) {
        const currentProduct = await tx.product.findUnique({
          where: { id: item.productId },
          select: { quantity: true, name: true },
        })
        if (!currentProduct || currentProduct.quantity < item.quantity) {
          throw new Error(`Insufficient stock for "${currentProduct?.name || item.productId}". Available: ${currentProduct?.quantity || 0}`)
        }
      }

      // Create the credit order
      const newOrder = await tx.creditOrder.create({
        data: {
          customerName: data.customerName.trim(),
          customerPhone: data.customerPhone?.trim() || null,
          totalAmount,
          depositAmount,
          remainingBalance,
          paymentStatus,
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
          notes: data.notes?.trim() || null,
          userId: auth.user!.id,
          items: {
            create: data.items.map((item: any) => ({
              productId: item.productId,
              quantity: item.quantity,
              price: item.price,
              total: item.price * item.quantity,
            })),
          },
        },
        include: {
          user: { select: { id: true, name: true } },
          items: { include: { product: { select: { name: true } } } },
        },
      })

      // Reduce inventory for each item (same as POS sale)
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
            reason: `Credit order for ${data.customerName.trim()}`,
            reference: newOrder.id,
          },
        })
      }

      // Create a deposit payment record if deposit > 0
      if (depositAmount > 0) {
        await tx.creditPayment.create({
          data: {
            creditOrderId: newOrder.id,
            amount: depositAmount,
            paymentMethod: data.paymentMethod || 'cash',
            notes: 'Initial deposit',
            userId: auth.user!.id,
          },
        })
      }

      // Create SalesEntry mirrors for Sales Tracking integration
      for (const item of data.items) {
        await tx.salesEntry.create({
          data: {
            productName: item.productName || item.productId,
            quantity: item.quantity,
            amount: item.price * item.quantity,
            date: new Date(),
            userId: auth.user!.id,
            source: 'credit',
            creditOrderId: newOrder.id,
          },
        })
      }

      // Check for low stock notifications
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

      return newOrder
    })

    return NextResponse.json(creditOrder, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    })
  } catch (error: any) {
    console.error('Credits POST error:', error)
    if (error.message?.startsWith('Insufficient stock')) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ error: 'Failed to create credit order' }, { status: 500 })
  }
}
