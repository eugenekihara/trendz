import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyAuth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/users/approvals
 * List all users with pending approval status (admin only).
 * Also supports ?status=pending|approved|rejected to filter.
 */
export async function GET(request: Request) {
  try {
    const auth = await verifyAuth('admin')
    if (!auth.authenticated || auth.error) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
    }

    const { searchParams } = new URL(request.url)
    const statusFilter = searchParams.get('status') // pending, approved, rejected, or null for all

    const where: any = {}
    if (statusFilter && ['pending', 'approved', 'rejected'].includes(statusFilter)) {
      where.approvalStatus = statusFilter
    }

    const users = await db.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        phone: true,
        active: true,
        approvalStatus: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    // Summary counts
    const [pending, approved, rejected] = await Promise.all([
      db.user.count({ where: { approvalStatus: 'pending' } }),
      db.user.count({ where: { approvalStatus: 'approved' } }),
      db.user.count({ where: { approvalStatus: 'rejected' } }),
    ])

    return NextResponse.json(
      { users, summary: { pending, approved, rejected } },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    )
  } catch (error) {
    console.error('Approvals GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch approval data' }, { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
  }
}

/**
 * PUT /api/users/approvals
 * Approve or reject a user registration (admin only).
 * Body: { userId: string, action: 'approve' | 'reject' }
 */
export async function PUT(request: Request) {
  try {
    const auth = await verifyAuth('admin')
    if (!auth.authenticated || auth.error) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
    }

    const { userId, action } = await request.json()

    if (!userId || !action) {
      return NextResponse.json({ error: 'userId and action are required' }, { status: 400, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
    }

    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Action must be "approve" or "reject"' }, { status: 400, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
    }

    const targetUser = await db.user.findUnique({ where: { id: userId } })
    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
    }

    // Prevent modifying own approval status
    if (userId === auth.user!.id) {
      return NextResponse.json({ error: 'Cannot modify your own approval status' }, { status: 400, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected'

    const updatedUser = await db.user.update({
      where: { id: userId },
      data: {
        approvalStatus: newStatus,
        // When approving, also ensure active is true
        ...(action === 'approve' ? { active: true } : {}),
        // When rejecting, deactivate the account
        ...(action === 'reject' ? { active: false } : {}),
      },
      select: { id: true, email: true, name: true, role: true, approvalStatus: true, active: true },
    })

    // Create audit log entry
    await db.auditLog.create({
      data: {
        userId: auth.user!.id,
        userName: auth.user!.name,
        action: action === 'approve' ? 'APPROVE' : 'REJECT',
        entity: 'User',
        entityId: userId,
        details: `${action === 'approve' ? 'Approved' : 'Rejected'} user: ${targetUser.name} (${targetUser.email})`,
      },
    })

    return NextResponse.json(
      { user: updatedUser, message: `User ${action === 'approve' ? 'approved' : 'rejected'} successfully` },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    )
  } catch (error) {
    console.error('Approvals PUT error:', error)
    return NextResponse.json({ error: 'Failed to update approval status' }, { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
  }
}
