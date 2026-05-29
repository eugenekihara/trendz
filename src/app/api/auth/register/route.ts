import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword } from '@/lib/auth'

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

    // ─── Create user (defaults to staff role, pending approval) ────
    const hashedPassword = await hashPassword(password)

    const user = await db.user.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        password: hashedPassword,
        phone: phone?.trim() || null,
        role: 'staff', // Default role for self-registration
        active: true,
        approvalStatus: 'pending', // New users require admin approval
        theme: 'light',
        language: 'en',
        notifySales: true,
        notifyInventory: true,
        notifyTasks: true,
      },
    })

    // ─── Do NOT create session — user must wait for admin approval ──
    // Return user data WITHOUT session cookie so the client shows the pending message
    const userData = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      avatar: user.avatar,
      phone: user.phone,
      approvalStatus: user.approvalStatus,
    }

    // ─── Create notification for admins about new registration ─────
    try {
      await db.notification.create({
        data: {
          type: 'user_registration',
          title: 'New User Registration',
          message: `${name.trim()} (${normalizedEmail}) has registered and is awaiting approval.`,
          read: false,
        },
      })
    } catch (e) {
      console.error('Failed to create registration notification:', e)
    }

    const response = NextResponse.json({
      ...userData,
      approvalStatus: 'pending',
      message: 'Your account has been created and is awaiting admin approval. You will be able to log in once an administrator approves your registration.',
    }, { status: 201 })

    // No session cookie set — user cannot access protected routes until approved

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
