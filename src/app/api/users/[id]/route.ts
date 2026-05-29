import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyAuth, hashPassword } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await verifyAuth('admin')
    if (!auth.authenticated || auth.error) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
    }

    const { id } = await params
    const user = await db.user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true, role: true, avatar: true, phone: true, active: true, approvalStatus: true, createdAt: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
    }

    return NextResponse.json(user, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
  } catch (error) {
    console.error('User GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch user' }, { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await verifyAuth('admin')
    if (!auth.authenticated || auth.error) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
    }

    const { id } = await params
    const data = await request.json()

    // Build update data
    const updateData: any = {
      name: data.name,
      email: data.email?.toLowerCase().trim(),
      role: data.role,
      phone: data.phone || null,
      avatar: data.avatar || null,
      active: data.active !== undefined ? data.active : undefined,
      approvalStatus: data.approvalStatus !== undefined ? data.approvalStatus : undefined,
    }

    // Hash password if provided
    if (data.password && data.password.trim()) {
      updateData.password = await hashPassword(data.password)
    }

    const user = await db.user.update({
      where: { id },
      data: updateData,
      select: { id: true, email: true, name: true, role: true, active: true, approvalStatus: true },
    })

    await db.auditLog.create({
      data: {
        userId: auth.user!.id,
        userName: auth.user!.name,
        action: 'UPDATE',
        entity: 'User',
        entityId: id,
        details: `Updated user: ${user.name}`,
      },
    })

    return NextResponse.json(user, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
  } catch (error: any) {
    console.error('User PUT error:', error)
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'Email already exists' }, { status: 400, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
    }
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await verifyAuth('admin')
    if (!auth.authenticated || auth.error) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
    }

    const { id } = await params
    if (id === auth.user!.id) {
      return NextResponse.json({ error: 'Cannot delete yourself' }, { status: 400, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
    }

    await db.user.delete({ where: { id } })

    await db.auditLog.create({
      data: {
        userId: auth.user!.id,
        userName: auth.user!.name,
        action: 'DELETE',
        entity: 'User',
        entityId: id,
      },
    })

    return NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
  } catch (error) {
    console.error('User DELETE error:', error)
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
  }
}
