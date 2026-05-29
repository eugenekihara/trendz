import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyAuth } from '@/lib/auth'

// Force dynamic rendering — never cache this route
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // Require authentication — categories contain business data
    const auth = await verifyAuth()
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const categories = await db.category.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { products: { where: { active: true } } } } },
    })
    return NextResponse.json(categories, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
  } catch (error) {
    console.error('Categories GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await verifyAuth('admin')
    if (!auth.authenticated || auth.error) {
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 403 })
    }

    const data = await request.json()
    if (!data.name || !data.name.trim()) {
      return NextResponse.json({ error: 'Category name is required' }, { status: 400 })
    }

    const existing = await db.category.findFirst({
      where: { name: { equals: data.name.trim() } },
    })
    if (existing) {
      return NextResponse.json({ error: 'Category already exists' }, { status: 400 })
    }

    const category = await db.category.create({
      data: {
        name: data.name.trim(),
        description: data.description?.trim() || null,
        icon: data.icon || null,
      },
    })

    await db.auditLog.create({
      data: {
        userId: auth.user!.id,
        userName: auth.user!.name,
        action: 'CREATE',
        entity: 'Category',
        entityId: category.id,
        details: `Created category: ${category.name}`,
      },
    })

    return NextResponse.json(category, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
  } catch (error: any) {
    console.error('Categories POST error:', error)
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'Category name already exists' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Failed to create category' }, { status: 500 })
  }
}
