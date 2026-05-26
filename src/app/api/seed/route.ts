import { NextResponse } from 'next/server'
import { ensureDbSeeded } from '@/lib/seed'
import { verifyAuth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const auth = await verifyAuth('admin')
    if (!auth.authenticated || auth.error) {
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 403, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
    }

    await ensureDbSeeded()
    return NextResponse.json({ success: true, message: 'Database seeded' }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
  } catch (error) {
    console.error('Seed error:', error)
    return NextResponse.json({ error: 'Seed failed' }, { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
  }
}
