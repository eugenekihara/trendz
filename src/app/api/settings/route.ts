import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyAuth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const auth = await verifyAuth()
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
    }

    const settings = await db.setting.findMany()
    const settingsMap: Record<string, string> = {}
    for (const s of settings) {
      // Never expose sensitive settings (jwtSecret, etc.) to the client
      if (s.key === 'jwtSecret') continue
      settingsMap[s.key] = s.value
    }
    return NextResponse.json(settingsMap, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
  } catch (error) {
    console.error('Settings GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
  }
}

// Whitelist of allowed setting keys that can be updated via API
// This prevents overwriting sensitive keys like jwtSecret
const ALLOWED_SETTING_KEYS = [
  'shopName', 'businessPhone', 'businessEmail', 'businessAddress',
  'currency', 'receiptFooter', 'lowStockThreshold', 'taxRate',
  'receiptHeader', 'receiptShowLogo', 'receiptShowPrices',
  'backupFrequency', 'autoBackup', 'theme', 'dateFormat',
  'numberFormat', 'defaultPaymentMethod',
]

export async function PUT(request: Request) {
  try {
    const auth = await verifyAuth('admin')
    if (!auth.authenticated || auth.error) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
    }

    const data = await request.json()
    const results: any[] = []

    for (const [key, value] of Object.entries(data)) {
      // Enforce whitelist — reject any key not in the allowed list
      if (!ALLOWED_SETTING_KEYS.includes(key)) {
        console.warn(`Settings PUT: rejected disallowed key "${key}"`)
        continue
      }
      const result = await db.setting.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) },
      })
      results.push(result)
    }

    if (results.length > 0) {
      await db.auditLog.create({
        data: {
          userId: auth.user!.id,
          userName: auth.user!.name,
          action: 'UPDATE',
          entity: 'Settings',
          details: `Updated settings: ${results.map(r => r.key).join(', ')}`,
        },
      })
    }

    return NextResponse.json({ success: true, updated: results.length }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
  } catch (error) {
    console.error('Settings PUT error:', error)
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
  }
}
