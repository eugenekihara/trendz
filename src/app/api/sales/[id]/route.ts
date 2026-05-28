import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyAuth } from '@/lib/auth'

// Force dynamic rendering — never cache this route
export const dynamic = 'force-dynamic'

/**
 * DELETE /api/sales/[id]
 *
 * Deletes a sale and fully reverses its effects:
 *  1. Restores product quantities (increment stock)
 *  2. Creates StockMove records for audit trail
 *  3. Deletes associated SalesEntry mirror records (source='pos' with matching saleId)
 *  4. Deletes the sale itself (SaleItems cascade)
 *  5. Creates an AuditLog entry
 *
 * This ensures Dashboard, Sales Tracking, Inventory, and Reports
 * all return to their pre-sale state immediately.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await verifyAuth('admin')
    if (!auth.authenticated || auth.error) {
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 403 })
    }

    const { id } = await params

    // Find the sale with its items
    const sale = await db.sale.findUnique({
      where: { id },
      include: { items: true },
    })

    if (!sale) {
      return NextResponse.json({ error: 'Sale not found' }, { status: 404 })
    }

    // Wrap everything in a transaction for atomicity
    await db.$transaction(async (tx) => {
      // 1. Restore product quantities and create stock moves
      for (const item of sale.items) {
        // Restore stock
        await tx.product.update({
          where: { id: item.productId },
          data: { quantity: { increment: item.quantity } },
        })

        // Create stock move for audit trail
        await tx.stockMove.create({
          data: {
            productId: item.productId,
            type: 'in',
            quantity: item.quantity,
            reason: `Sale reversal (${sale.invoiceNumber})`,
            reference: sale.id,
          },
        })
      }

      // 2. Delete associated SalesEntry mirror records (POS entries linked to this sale)
      await tx.salesEntry.deleteMany({
        where: { saleId: sale.id, source: 'pos' },
      })

      // 3. Delete the sale (SaleItems are cascade-deleted by Prisma)
      await tx.sale.delete({ where: { id: sale.id } })

      // 4. Create audit log
      await tx.auditLog.create({
        data: {
          userId: auth.user!.id,
          userName: auth.user!.name,
          action: 'DELETE',
          entity: 'Sale',
          entityId: sale.id,
          details: `Deleted sale ${sale.invoiceNumber} (KES ${sale.total.toLocaleString()}) — stock restored`,
        },
      })
    })

    return NextResponse.json(
      { success: true, message: `Sale ${sale.invoiceNumber} deleted and stock restored` },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    )
  } catch (error) {
    console.error('Sale DELETE error:', error)
    return NextResponse.json({ error: 'Failed to delete sale' }, { status: 500 })
  }
}
