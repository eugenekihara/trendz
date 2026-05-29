import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyAuth } from '@/lib/auth'
import { hashPassword } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const auth = await verifyAuth('admin')
    if (!auth.authenticated || auth.error) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
    }

    const users = await db.user.findMany({
      select: {
        id: true, email: true, name: true, role: true, avatar: true, phone: true,
        active: true, approvalStatus: true, theme: true, language: true, createdAt: true,
      },
      orderBy: { name: 'asc' },
    })
    return NextResponse.json(users, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
  } catch (error) {
    console.error('Users GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await verifyAuth('admin')
    if (!auth.authenticated || auth.error) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
    }

    const data = await request.json()
    const existing = await db.user.findUnique({ where: { email: data.email?.toLowerCase().trim() } })
    if (existing) {
      return NextResponse.json({ error: 'Email already exists' }, { status: 400, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
    }

    // Hash password before storing
    const plainPassword = data.password || 'changeme'
    const hashedPassword = await hashPassword(plainPassword)

    const user = await db.user.create({
      data: {
        email: data.email?.toLowerCase().trim(),
        name: data.name,
        password: hashedPassword,
        role: data.role || 'staff',
        phone: data.phone || null,
        active: true,
        approvalStatus: 'approved', // Admin-created users are auto-approved
      },
      select: { id: true, email: true, name: true, role: true, active: true, approvalStatus: true },
    })

    await db.auditLog.create({
      data: {
        userId: auth.user!.id,
        userName: auth.user!.name,
        action: 'CREATE',
        entity: 'User',
        entityId: user.id,
        details: `Created user: ${user.name} (${user.role})`,
      },
    })

    return NextResponse.json(user, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
  } catch (error: any) {
    console.error('Users POST error:', error)
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'Email already exists' }, { status: 400, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
    }
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
  }
}
