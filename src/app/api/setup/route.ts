import { NextResponse } from 'next/server'
import { isSystemInitialized, createInitialAdmin, ensureDbSeeded } from '@/lib/seed'
import { db } from '@/lib/db'
import { hashPassword, createSessionToken, getSessionCookieName, getSessionMaxAge } from '@/lib/auth'

/**
 * GET /api/setup - Check if system needs initial setup
 * Public endpoint (no auth required)
 */
export async function GET() {
  try {
    // Ensure settings/categories are seeded first
    await ensureDbSeeded()

    const initialized = await isSystemInitialized()
    return NextResponse.json({ initialized })
  } catch (error) {
    console.error('Setup check error:', error)
    return NextResponse.json({ error: 'Failed to check setup status' }, { status: 500 })
  }
}

/**
 * POST /api/setup - Create initial admin account
 * Public endpoint (only works when no users exist)
 */
export async function POST(request: Request) {
  try {
    // Only allow setup if system is not yet initialized
    const initialized = await isSystemInitialized()
    if (initialized) {
      return NextResponse.json({ error: 'System is already initialized' }, { status: 400 })
    }

    const data = await request.json()
    const { name, email, password, shopName } = data

    if (!name || !email || !password) {
      return NextResponse.json({ error: 'Name, email, and password are required' }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }

    // Check if email is already taken
    const existingUser = await db.user.findUnique({ where: { email: email.toLowerCase().trim() } })
    if (existingUser) {
      return NextResponse.json({ error: 'Email is already registered' }, { status: 400 })
    }

    // Hash the admin password before storing
    const user = await createInitialAdmin({
      name,
      email: email.toLowerCase().trim(),
      password, // seed.ts will receive the plain password; we hash it there
      shopName,
    })

    // Create session for auto-login after setup
    const token = await createSessionToken(user.id)

    const userData = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      message: 'Admin account created successfully',
    }

    const response = NextResponse.json(userData)

    response.cookies.set(getSessionCookieName(), token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: getSessionMaxAge(),
      path: '/',
    })

    return response
  } catch (error) {
    console.error('Setup POST error:', error)
    return NextResponse.json({ error: 'Failed to create admin account' }, { status: 500 })
  }
}
