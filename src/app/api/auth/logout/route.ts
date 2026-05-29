import { NextResponse } from 'next/server'
import { getSessionCookieName } from '@/lib/auth'

export async function POST() {
  try {
    const response = NextResponse.json({ message: 'Logged out successfully' })

    // Clear the session cookie
    response.cookies.set(getSessionCookieName(), '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0, // Expire immediately
      path: '/',
    })

    return response
  } catch (error) {
    console.error('Logout error:', error)
    return NextResponse.json({ error: 'Logout failed' }, { status: 500 })
  }
}
