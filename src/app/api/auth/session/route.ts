import { NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/auth/session
 * Checks if the user has a valid session cookie and returns user data.
 * Used on page load to restore auth state after refresh.
 */
export async function GET() {
  try {
    const auth = await verifyAuth()

    if (!auth.authenticated || !auth.user) {
      return NextResponse.json(
        { authenticated: false, user: null },
        {
          status: 401,
          headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
        }
      )
    }

    return NextResponse.json(
      {
        authenticated: true,
        user: {
          id: auth.user.id,
          email: auth.user.email,
          name: auth.user.name,
          role: auth.user.role,
          avatar: auth.user.avatar,
          phone: auth.user.phone,
          approvalStatus: auth.user.approvalStatus,
        },
      },
      {
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
      }
    )
  } catch (error) {
    console.error('Session check error:', error)
    return NextResponse.json(
      { authenticated: false, user: null },
      { status: 401 }
    )
  }
}
