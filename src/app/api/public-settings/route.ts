import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureDbSeeded } from '@/lib/seed'

/**
 * GET /api/public-settings - Get public shop settings (no auth required)
 * Used by login page and receipt generation to display shop name/tagline.
 */
export async function GET() {
  try {
    // Ensure settings exist
    await ensureDbSeeded()

    const settings = await db.setting.findMany({
      where: {
        key: {
          in: ['shopName', 'businessPhone', 'businessEmail', 'businessAddress', 'receiptFooter', 'currency'],
        },
      },
    })

    const result: Record<string, string> = {}
    for (const s of settings) {
      result[s.key] = s.value
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Public settings GET error:', error)
    return NextResponse.json({ shopName: 'Trendz', currency: 'KES' })
  }
}
