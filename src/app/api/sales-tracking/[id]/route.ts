import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyAuth } from '@/lib/auth'

// Force dynamic rendering — never cache this route
export const dynamic = 'force-dynamic'

/**
 * DELETE /api/sales-tracking/[id]
 *
 * Deletes a manual sales entry.
 * - Only manual entries (source='manual') can be deleted individually.
 * - POS mirror entries (source='pos') are managed through the Sale deletion API.
 * - Admin only.
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

    // Find the entry
    const entry = await db.salesEntry.findUnique({ where: { id } })

    if (!entry) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
    }

    // Only allow deletion of manual entries through this endpoint
    if (entry.source === 'pos') {
      return NextResponse.json(
        { error: 'POS entries must be deleted through the Sales module (delete the sale)' },
        { status: 400 }
      )
    }

    // Delete the entry
    await db.salesEntry.delete({ where: { id } })

    // Create audit log
    await db.auditLog.create({
      data: {
        userId: auth.user!.id,
        userName: auth.user!.name,
        action: 'DELETE',
        entity: 'SalesEntry',
        entityId: id,
        details: `Deleted manual entry: ${entry.productName} (KES ${entry.amount})`,
      },
    })

    return NextResponse.json(
      { success: true },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    )
  } catch (error) {
    console.error('Sales tracking DELETE error:', error)
    return NextResponse.json({ error: 'Failed to delete entry' }, { status: 500 })
  }
}
