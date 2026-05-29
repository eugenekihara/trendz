import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyAuth, verifyPassword, hashPassword } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function PUT(request: Request) {
  try {
    const auth = await verifyAuth()
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
    }

    const { currentPassword, newPassword } = await request.json()

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: 'Current and new password are required' }, { status: 400, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ error: 'New password must be at least 6 characters' }, { status: 400, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
    }

    // Get user with password hash
    const user = await db.user.findUnique({ where: { id: auth.user!.id } })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
    }

    // Verify current password (supports both hashed and legacy plain text)
    const isValid = await verifyPassword(currentPassword, user.password)
    if (!isValid) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
    }

    // Hash and save new password
    const hashedNewPassword = await hashPassword(newPassword)
    await db.user.update({
      where: { id: auth.user!.id },
      data: { password: hashedNewPassword },
    })

    return NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
  } catch (error) {
    console.error('Password change error:', error)
    return NextResponse.json({ error: 'Failed to change password' }, { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
  }
}
