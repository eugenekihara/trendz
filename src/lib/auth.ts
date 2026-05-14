import { headers } from 'next/headers'
import { db } from './db'

export async function verifyAuth(requiredRole?: string | string[]) {
  const headersList = await headers()
  const userId = headersList.get('x-user-id')
  const userRole = headersList.get('x-user-role')

  if (!userId || !userRole) {
    return { authenticated: false, user: null, error: 'Not authenticated' }
  }

  const user = await db.user.findUnique({ where: { id: userId } })
  if (!user || !user.active) {
    return { authenticated: false, user: null, error: 'User not found or inactive' }
  }

  if (requiredRole) {
    const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole]
    if (!roles.includes(userRole)) {
      return { authenticated: true, user, error: 'Insufficient permissions' }
    }
  }

  return { authenticated: true, user, error: null }
}
