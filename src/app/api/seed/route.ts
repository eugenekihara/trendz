import { NextResponse } from 'next/server'
import { ensureDbSeeded } from '@/lib/seed'

export async function POST() {
  try {
    await ensureDbSeeded()
    return NextResponse.json({ success: true, message: 'Database seeded' })
  } catch (error) {
    console.error('Seed error:', error)
    return NextResponse.json({ error: 'Seed failed' }, { status: 500 })
  }
}
