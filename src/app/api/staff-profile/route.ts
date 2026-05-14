import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyAuth } from '@/lib/auth'

export async function GET() {
  try {
    const auth = await verifyAuth()
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const user = await db.user.findUnique({
      where: { id: auth.user!.id },
      select: {
        id: true, email: true, name: true, role: true, avatar: true, phone: true,
        theme: true, language: true, notifySales: true, notifyInventory: true,
        notifyTasks: true, createdAt: true,
      },
    })

    return NextResponse.json(user)
  } catch (error) {
    console.error('Staff profile GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await verifyAuth()
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const data = await request.json()
    const allowedFields = ['name', 'phone', 'email', 'avatar', 'theme', 'language', 'notifySales', 'notifyInventory', 'notifyTasks']

    const updateData: any = {}
    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        updateData[field] = data[field]
      }
    }

    // Check email uniqueness if changing email
    if (data.email && data.email !== auth.user!.email) {
      const existing = await db.user.findUnique({ where: { email: data.email } })
      if (existing) {
        return NextResponse.json({ error: 'Email already in use' }, { status: 400 })
      }
    }

    const user = await db.user.update({
      where: { id: auth.user!.id },
      data: updateData,
      select: {
        id: true, email: true, name: true, role: true, avatar: true, phone: true,
        theme: true, language: true, notifySales: true, notifyInventory: true,
        notifyTasks: true,
      },
    })

    return NextResponse.json(user)
  } catch (error: any) {
    console.error('Staff profile PUT error:', error)
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'Email already in use' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 })
  }
}
