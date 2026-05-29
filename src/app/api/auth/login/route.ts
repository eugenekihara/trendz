import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyPassword, isPasswordHashed, hashPassword, createSessionToken, getSessionCookieName, getSessionMaxAge } from '@/lib/auth'

/**
 * Detects if the request was made over HTTPS (directly or via a proxy).
 * Checks x-forwarded-proto header (set by reverse proxies like Nginx/Apache)
 * and falls back to the request URL protocol.
 */
function isSecureRequest(request: NextRequest): boolean {
  const forwardedProto = request.headers.get('x-forwarded-proto')
  if (forwardedProto) return forwardedProto === 'https'
  return request.nextUrl.protocol === 'https:'
}

export async function POST(request: NextRequest) {
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

    // Check approval status before allowing login
    if (user.approvalStatus === 'pending') {
      return NextResponse.json(
        { error: 'Your account is awaiting admin approval. You will be able to log in once an administrator approves your registration.', approvalStatus: 'pending' },
        { status: 403 }
      )
    }
    if (user.approvalStatus === 'rejected') {
      return NextResponse.json(
        { error: 'Your account registration has been rejected by an administrator. Please contact support if you believe this is an error.', approvalStatus: 'rejected' },
        { status: 403 }
      )
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
      approvalStatus: user.approvalStatus,
    }

    // Set session cookie and return user data
    const response = NextResponse.json({
      ...userData,
      message: 'Login successful',
    })

    // Use Secure flag ONLY when the request is actually over HTTPS.
    // This fixes the issue where production deployments over HTTP
    // would set Secure cookies that browsers reject over HTTP,
    // causing session cookies to be silently discarded.
    const secure = isSecureRequest(request)

    response.cookies.set(getSessionCookieName(), token, {
      httpOnly: true,
      secure,
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
