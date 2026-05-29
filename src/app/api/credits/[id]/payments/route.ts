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

    // Wrap payment creation and order update in a transaction for data integrity
    const payment = await db.$transaction(async (tx) => {
      const creditOrder = await tx.creditOrder.findUnique({ where: { id } })
      if (!creditOrder) {
        throw new Error('NOT_FOUND')
      }

      // Staff can only add payments to their own credit orders
      if (auth.user?.role === 'staff' && creditOrder.userId !== auth.user.id) {
        throw new Error('ACCESS_DENIED')
      }

      if (amount > creditOrder.remainingBalance) {
        throw new Error(`Payment amount (KES ${amount.toLocaleString()}) exceeds remaining balance (KES ${creditOrder.remainingBalance.toLocaleString()})`)
      }

      const newRemainingBalance = creditOrder.remainingBalance - amount

      // Determine new payment status
      let newPaymentStatus = creditOrder.paymentStatus
      if (newRemainingBalance <= 0) {
        newPaymentStatus = 'fully_paid'
      } else if (newRemainingBalance < creditOrder.totalAmount) {
        // Any amount paid (deposit or payments) means at least partially paid
        newPaymentStatus = creditOrder.depositAmount > 0 ? 'partially_paid' : 'partially_paid'
      }

      // Check if overdue (due date passed and not fully paid)
      if (creditOrder.dueDate && new Date() > creditOrder.dueDate && newPaymentStatus !== 'fully_paid') {
        newPaymentStatus = 'overdue'
      }

      // Create payment record
      const newPayment = await tx.creditPayment.create({
        data: {
          creditOrderId: id,
          amount,
          paymentMethod: data.paymentMethod || 'cash',
          notes: data.notes?.trim() || null,
          userId: auth.user!.id,
        },
        include: { user: { select: { id: true, name: true } } },
      })

      // Update credit order balance and status
      // NOTE: depositAmount stays as the original deposit — do NOT overwrite it with totalPaidSoFar
      // Total paid can be calculated as: totalAmount - remainingBalance
      await tx.creditOrder.update({
        where: { id },
        data: {
          remainingBalance: Math.max(0, newRemainingBalance),
          paymentStatus: newPaymentStatus,
        },
      })

      return newPayment
    })

    return NextResponse.json(payment, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    })
  } catch (error: any) {
    console.error('Credit payment POST error:', error)
    if (error.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Credit order not found' }, { status: 404 })
    }
    if (error.message === 'ACCESS_DENIED') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }
    if (error.message?.includes('exceeds remaining balance')) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 })
  }
}
