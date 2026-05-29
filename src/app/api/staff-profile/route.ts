import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyAuth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // Step 1: Verify authentication
    const auth = await verifyAuth()
    if (!auth.authenticated) {
      return NextResponse.json(
        { error: 'Not authenticated', code: 'AUTH_FAILED', detail: auth.error },
        { status: 401, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
      )
    }

    // Step 2: Fetch user profile from database
    const userId = auth.user!.id
    let user
    try {
      user = await db.user.findUnique({
        where: { id: userId },
        select: {
          id: true, email: true, name: true, role: true, avatar: true, phone: true,
          theme: true, language: true, notifySales: true, notifyInventory: true,
          notifyTasks: true, approvalStatus: true, createdAt: true,
        },
      })
    } catch (dbError: any) {
      console.error('Staff profile DB query error for user', userId, dbError)
      return NextResponse.json(
        { error: 'Failed to fetch profile', code: 'DB_ERROR', detail: dbError.message },
        { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
      )
    }

    // Step 3: Guard against null user
    if (!user) {
      return NextResponse.json(
        { error: 'User account not found', code: 'USER_NOT_FOUND' },
        { status: 404, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
      )
    }

    // Step 4: Return profile data
    return NextResponse.json(user, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
  } catch (error: any) {
    console.error('Staff profile GET unexpected error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch profile', code: 'UNEXPECTED', detail: error?.message || String(error) },
      { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    )
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await verifyAuth()
    if (!auth.authenticated) {
      return NextResponse.json(
        { error: 'Not authenticated', code: 'AUTH_FAILED' },
        { status: 401, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
      )
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
        return NextResponse.json({ error: 'Email already in use', code: 'DUPLICATE_EMAIL' }, { status: 400, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
      }
    }

    const user = await db.user.update({
      where: { id: auth.user!.id },
      data: updateData,
      select: {
        id: true, email: true, name: true, role: true, avatar: true, phone: true,
        theme: true, language: true, notifySales: true, notifyInventory: true,
        notifyTasks: true, approvalStatus: true,
      },
    })

    return NextResponse.json(user, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
  } catch (error: any) {
    console.error('Staff profile PUT error:', error)
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'Email already in use', code: 'DUPLICATE_EMAIL' }, { status: 400, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
    }
    return NextResponse.json(
      { error: 'Failed to update profile', code: 'UNEXPECTED', detail: error?.message || String(error) },
      { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    )
  }
}
