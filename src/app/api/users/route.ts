import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyAuth } from '@/lib/auth'

export async function GET() {
  try {
    const auth = await verifyAuth('admin')
    if (!auth.authenticated || auth.error) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const users = await db.user.findMany({
      select: {
        id: true, email: true, name: true, role: true, avatar: true, phone: true,
        active: true, theme: true, language: true, createdAt: true,
      },
      orderBy: { name: 'asc' },
    })
    return NextResponse.json(users)
  } catch (error) {
    console.error('Users GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await verifyAuth('admin')
    if (!auth.authenticated || auth.error) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const data = await request.json()
    const existing = await db.user.findUnique({ where: { email: data.email } })
    if (existing) {
      return NextResponse.json({ error: 'Email already exists' }, { status: 400 })
    }

    const user = await db.user.create({
      data: {
        email: data.email,
        name: data.name,
        password: data.password || 'changeme',
        role: data.role || 'staff',
        phone: data.phone || null,
        active: true,
      },
      select: { id: true, email: true, name: true, role: true, active: true },
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

    return NextResponse.json(user)
  } catch (error: any) {
    console.error('Users POST error:', error)
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'Email already exists' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
  }
}
