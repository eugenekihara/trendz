import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyAuth } from '@/lib/auth'

// Force dynamic rendering — never cache this route
export const dynamic = 'force-dynamic'

/**
 * GET /api/credits/[id] - Get a single credit order with full details
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await verifyAuth()
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { id } = await params

    const creditOrder = await db.creditOrder.findUnique({
      where: { id },
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
    })

    if (!creditOrder) {
      return NextResponse.json({ error: 'Credit order not found' }, { status: 404 })
    }

    // Staff can only see their own credit orders
    if (auth.user?.role === 'staff' && creditOrder.userId !== auth.user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    return NextResponse.json(creditOrder, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    })
  } catch (error) {
    console.error('Credit GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch credit order' }, { status: 500 })
  }
}

/**
 * PUT /api/credits/[id] - Update a credit order (admin only)
 * Used for editing customer info, notes, due date
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await verifyAuth('admin')
    if (!auth.authenticated || auth.error) {
      return NextResponse.json({ error: 'Unauthorized — admin only' }, { status: 403 })
    }

    const { id } = await params
    const data = await request.json()

    const existing = await db.creditOrder.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Credit order not found' }, { status: 404 })
    }

    const updated = await db.creditOrder.update({
      where: { id },
      data: {
        customerName: data.customerName?.trim() || existing.customerName,
        customerPhone: data.customerPhone?.trim() ?? existing.customerPhone,
        dueDate: data.dueDate ? new Date(data.dueDate) : existing.dueDate,
        notes: data.notes?.trim() ?? existing.notes,
      },
      include: {
        user: { select: { id: true, name: true } },
        items: { include: { product: { select: { name: true } } } },
        payments: { include: { user: { select: { name: true } } } },
      },
    })

    return NextResponse.json(updated, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    })
  } catch (error) {
    console.error('Credit PUT error:', error)
    return NextResponse.json({ error: 'Failed to update credit order' }, { status: 500 })
  }
}

/**
 * DELETE /api/credits/[id] - Delete a credit order (admin only)
 * Restores inventory and removes SalesEntry mirrors
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await verifyAuth('admin')
    if (!auth.authenticated || auth.error) {
      return NextResponse.json({ error: 'Unauthorized — admin only' }, { status: 403 })
    }

    const { id } = await params

    const existing = await db.creditOrder.findUnique({
      where: { id },
      include: { items: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Credit order not found' }, { status: 404 })
    }

    // Wrap in transaction: restore stock, remove SalesEntry mirrors, delete credit order
    await db.$transaction(async (tx) => {
      // Restore stock for each item
      for (const item of existing.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { quantity: { increment: item.quantity } },
        })
        await tx.stockMove.create({
          data: {
            productId: item.productId,
            type: 'in',
            quantity: item.quantity,
            reason: `Credit order deleted — stock restored`,
            reference: existing.id,
          },
        })
      }

      // Delete SalesEntry mirrors for this credit order
      await tx.salesEntry.deleteMany({
        where: { creditOrderId: existing.id },
      })

      // Delete credit order (cascade will delete items and payments)
      await tx.creditOrder.delete({
        where: { id: existing.id },
      })
    })

    return NextResponse.json({ success: true }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    })
  } catch (error) {
    console.error('Credit DELETE error:', error)
    return NextResponse.json({ error: 'Failed to delete credit order' }, { status: 500 })
  }
}
