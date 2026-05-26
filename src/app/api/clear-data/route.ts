import { NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import { clearBusinessData } from '@/lib/seed'

// Force dynamic rendering — never cache this route
export const dynamic = 'force-dynamic'

/**
 * POST /api/clear-data - Clear all business data (admin only)
 * Keeps user accounts and settings intact.
 * Removes: products, sales, categories data, suppliers, notifications, audit logs.
 */
export async function POST() {
  try {
    const auth = await verifyAuth('admin')
    if (!auth.authenticated || auth.error) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 403, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
    }

    const result = await clearBusinessData()
    return NextResponse.json({ ...result, message: 'All business data cleared successfully' }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
  } catch (error) {
    console.error('Clear data error:', error)
    return NextResponse.json({ error: 'Failed to clear data' }, { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
  }
}
