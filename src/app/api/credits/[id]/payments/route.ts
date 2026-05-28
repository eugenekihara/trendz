import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyAuth } from '@/lib/auth'

// Force dynamic rendering — never cache this route
export const dynamic = 'force-dynamic'

/**
 * POST /api/credits/[id]/payments - Add a payment to a credit order
 * Body: { amount, paymentMethod, notes }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await verifyAuth()
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { id } = await params
    const data = await request.json()

    const amount = parseFloat(data.amount)
    if (isNaN(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Valid payment amount is required' }, { status: 400 })
    }

    const creditOrder = await db.creditOrder.findUnique({ where: { id } })
    if (!creditOrder) {
      return NextResponse.json({ error: 'Credit order not found' }, { status: 404 })
    }

    // Staff can only add payments to their own credit orders
    if (auth.user?.role === 'staff' && creditOrder.userId !== auth.user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    if (amount > creditOrder.remainingBalance) {
      return NextResponse.json({
        error: `Payment amount (KES ${amount.toLocaleString()}) exceeds remaining balance (KES ${creditOrder.remainingBalance.toLocaleString()})`,
      }, { status: 400 })
    }

    // Calculate new values outside the transaction for simplicity
    const newRemainingBalance = creditOrder.remainingBalance - amount
    const totalPaidSoFar = creditOrder.totalAmount - newRemainingBalance

    // Determine new payment status
    let newPaymentStatus = creditOrder.paymentStatus
    if (newRemainingBalance <= 0) {
      newPaymentStatus = 'fully_paid'
    } else if (totalPaidSoFar > 0 && newRemainingBalance < creditOrder.totalAmount) {
      newPaymentStatus = 'partially_paid'
    }

    // Check if overdue (due date passed and not fully paid)
    if (creditOrder.dueDate && new Date() > creditOrder.dueDate && newPaymentStatus !== 'fully_paid') {
      newPaymentStatus = 'overdue'
    }

    // Create payment and update order
    const payment = await db.creditPayment.create({
      data: {
        creditOrderId: id,
        amount,
        paymentMethod: data.paymentMethod || 'cash',
        notes: data.notes?.trim() || null,
        userId: auth.user!.id,
      },
      include: { user: { select: { id: true, name: true } } },
    })

    await db.creditOrder.update({
      where: { id },
      data: {
        remainingBalance: Math.max(0, newRemainingBalance),
        depositAmount: totalPaidSoFar,
        paymentStatus: newPaymentStatus,
      },
    })

    return NextResponse.json(payment, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    })
  } catch (error) {
    console.error('Credit payment POST error:', error)
    return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 })
  }
}
