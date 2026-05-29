import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyPassword, isPasswordHashed, hashPassword, createSessionToken, getSessionCookieName, getSessionMaxAge } from '@/lib/auth'

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    const user = await db.user.findUnique({ where: { email: email.toLowerCase().trim() } })
    if (!user) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    if (!user.active) {
      return NextResponse.json({ error: 'Account is deactivated. Contact your administrator.' }, { status: 403 })
    }

    // Verify password (supports both hashed and legacy plain text)
    const isValid = await verifyPassword(password, user.password)
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    // Auto-upgrade: if password is still plain text, hash it now
    if (!isPasswordHashed(user.password)) {
      try {
        const hashed = await hashPassword(password)
        await db.user.update({ where: { id: user.id }, data: { password: hashed } })
      } catch (e) {
        console.error('Failed to hash password during login for user', user.id, e)
      }
    }

    // Create session token
    const token = await createSessionToken(user.id)

    // Prepare user data for client (never send password)
    const userData = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      avatar: user.avatar,
      phone: user.phone,
    }

    // Set session cookie and return user data
    const response = NextResponse.json({
      ...userData,
      message: 'Login successful',
    })

    response.cookies.set(getSessionCookieName(), token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: getSessionMaxAge(),
      path: '/',
    })

    return response
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json({ error: 'Login failed. Please try again.' }, { status: 500 })
  }
}
