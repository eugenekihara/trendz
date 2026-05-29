import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword, createSessionToken, getSessionCookieName, getSessionMaxAge } from '@/lib/auth'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, email, password, confirmPassword, phone } = body

    // ─── Validation ───────────────────────────────────────────────
    const errors: string[] = []

    if (!name || !name.trim()) {
      errors.push('Full name is required')
    } else if (name.trim().length < 2) {
      errors.push('Name must be at least 2 characters')
    }

    if (!email || !email.trim()) {
      errors.push('Email is required')
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(email.trim())) {
        errors.push('Please enter a valid email address')
      }
    }

    if (!password) {
      errors.push('Password is required')
    } else if (password.length < 6) {
      errors.push('Password must be at least 6 characters')
    }

    if (!confirmPassword) {
      errors.push('Please confirm your password')
    } else if (password !== confirmPassword) {
      errors.push('Passwords do not match')
    }

    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join('. ') }, { status: 400 })
    }

    // ─── Check for duplicate email ────────────────────────────────
    const normalizedEmail = email.toLowerCase().trim()
    const existingUser = await db.user.findUnique({ where: { email: normalizedEmail } })
    if (existingUser) {
      return NextResponse.json(
        { error: 'An account with this email already exists. Please log in or use a different email.' },
        { status: 409 }
      )
    }

    // ─── Create user (defaults to staff role) ─────────────────────
    const hashedPassword = await hashPassword(password)

    const user = await db.user.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        password: hashedPassword,
        phone: phone?.trim() || null,
        role: 'staff', // Default role for self-registration
        active: true,
        theme: 'light',
        language: 'en',
        notifySales: true,
        notifyInventory: true,
        notifyTasks: true,
      },
    })

    // ─── Create session and set cookie ────────────────────────────
    const token = await createSessionToken(user.id)

    const userData = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      avatar: user.avatar,
      phone: user.phone,
    }

    const response = NextResponse.json({
      ...userData,
      message: 'Account created successfully! Welcome to Trendz.',
    }, { status: 201 })

    response.cookies.set(getSessionCookieName(), token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: getSessionMaxAge(),
      path: '/',
    })

    return response
  } catch (error: any) {
    console.error('Registration error:', error)
    if (error.code === 'P2002') {
      return NextResponse.json(
        { error: 'An account with this email already exists.' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: 'Registration failed. Please try again.' }, { status: 500 })
  }
}
