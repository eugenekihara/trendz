import { headers, cookies } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'
import bcrypt from 'bcryptjs'
import { db } from './db'

// ─── JWT Configuration ───────────────────────────────────────────────
const JWT_ISSUER = 'trendz-app'
const JWT_AUDIENCE = 'trendz-users'
const SESSION_COOKIE_NAME = 'trendz-session'
const SESSION_MAX_AGE = 7 * 24 * 60 * 60 // 7 days in seconds
const BCRYPT_ROUNDS = 10

// ─── JWT Secret Management ───────────────────────────────────────────
let _cachedSecret: Uint8Array | null = null

async function getJwtSecret(): Promise<Uint8Array> {
  if (_cachedSecret) return _cachedSecret

  // 1. Check environment variable
  if (process.env.JWT_SECRET) {
    _cachedSecret = new TextEncoder().encode(process.env.JWT_SECRET)
    return _cachedSecret
  }

  // 2. Check DB settings for stored secret
  try {
    const setting = await db.setting.findUnique({ where: { key: 'jwtSecret' } })
    if (setting?.value) {
      _cachedSecret = new TextEncoder().encode(setting.value)
      return _cachedSecret
    }

    // 3. Generate a new secret and store it
    const secret = generateSecret()
    await db.setting.upsert({
      where: { key: 'jwtSecret' },
      update: { value: secret },
      create: { key: 'jwtSecret', value: secret },
    })
    _cachedSecret = new TextEncoder().encode(secret)
    return _cachedSecret
  } catch {
    // Fallback for when DB is not available (shouldn't happen in production)
    const fallback = 'trendz-fallback-secret-change-in-production-2024'
    _cachedSecret = new TextEncoder().encode(fallback)
    return _cachedSecret
  }
}

function generateSecret(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*'
  let result = 'tz_'
  for (let i = 0; i < 48; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

// ─── Password Hashing ────────────────────────────────────────────────
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS)
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  // Check if the stored password is a bcrypt hash
  if (hashedPassword.startsWith('$2a$') || hashedPassword.startsWith('$2b$')) {
    return bcrypt.compare(password, hashedPassword)
  }

  // Legacy: plain text comparison for passwords stored before hashing was implemented
  // If it matches, the caller should hash and update the password
  return password === hashedPassword
}

export function isPasswordHashed(password: string): boolean {
  return password.startsWith('$2a$') || password.startsWith('$2b$')
}

// ─── JWT Token Management ────────────────────────────────────────────
export interface SessionPayload {
  userId: string
}

export async function createSessionToken(userId: string): Promise<string> {
  const secret = await getJwtSecret()
  const token = await new SignJWT({ userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secret)
  return token
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const secret = await getJwtSecret()
    const { payload } = await jwtVerify(token, secret, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    })
    return { userId: payload.userId as string }
  } catch {
    return null
  }
}

// ─── Cookie Helpers ──────────────────────────────────────────────────
export function getSessionCookieName(): string {
  return SESSION_COOKIE_NAME
}

export function getSessionMaxAge(): number {
  return SESSION_MAX_AGE
}

// ─── Auth Verification (replaces old header-based auth) ──────────────
export async function verifyAuth(requiredRole?: string | string[]) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value

    if (!token) {
      return { authenticated: false, user: null, error: 'Not authenticated' }
    }

    const session = await verifySessionToken(token)
    if (!session?.userId) {
      return { authenticated: false, user: null, error: 'Invalid or expired session' }
    }

    const user = await db.user.findUnique({ where: { id: session.userId } })
    if (!user || !user.active) {
      return { authenticated: false, user: null, error: 'User not found or inactive' }
    }

    // Role check uses the DATABASE value, not any client-supplied value
    if (requiredRole) {
      const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole]
      if (!roles.includes(user.role)) {
        return { authenticated: true, user, error: 'Insufficient permissions' }
      }
    }

    // Auto-upgrade: if user's password is still plain text, hash it now
    if (!isPasswordHashed(user.password)) {
      try {
        const hashed = await hashPassword(user.password)
        await db.user.update({
          where: { id: user.id },
          data: { password: hashed },
        })
      } catch (e) {
        console.error('Failed to auto-hash password for user', user.id, e)
      }
    }

    return { authenticated: true, user, error: null }
  } catch (error) {
    console.error('Auth verification error:', error)
    return { authenticated: false, user: null, error: 'Authentication failed' }
  }
}
