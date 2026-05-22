import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyAuth } from '@/lib/auth'

export async function GET() {
  try {
    const auth = await verifyAuth()
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const settings = await db.setting.findMany()
    const settingsMap: Record<string, string> = {}
    for (const s of settings) {
      settingsMap[s.key] = s.value
    }
    return NextResponse.json(settingsMap)
  } catch (error) {
    console.error('Settings GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await verifyAuth('admin')
    if (!auth.authenticated || auth.error) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const data = await request.json()
    const results = []

    for (const [key, value] of Object.entries(data)) {
      const result = await db.setting.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) },
      })
      results.push(result)
    }

    await db.auditLog.create({
      data: {
        userId: auth.user!.id,
        userName: auth.user!.name,
        action: 'UPDATE',
        entity: 'Settings',
        details: `Updated settings: ${Object.keys(data).join(', ')}`,
      },
    })

    return NextResponse.json({ success: true, updated: results.length })
  } catch (error) {
    console.error('Settings PUT error:', error)
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
  }
}
