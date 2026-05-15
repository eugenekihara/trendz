import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyAuth } from '@/lib/auth'

export async function GET(request: Request) {
  try {
    const auth = await verifyAuth()
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    const where: any = {}
    if (userId) where.userId = userId
    // Staff can only see their own entries
    if (auth.user?.role === 'staff') where.userId = auth.user.id

    if (startDate || endDate) {
      where.date = {}
      if (startDate) where.date.gte = new Date(startDate)
      if (endDate) where.date.lte = new Date(endDate)
    }

    const [entries, total] = await Promise.all([
      db.salesEntry.findMany({
        where,
        include: { user: { select: { id: true, name: true } } },
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.salesEntry.count({ where }),
    ])

    return NextResponse.json({ entries, total, page, limit })
  } catch (error) {
    console.error('Sales tracking GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch sales entries' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await verifyAuth()
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const data = await request.json()
    const entry = await db.salesEntry.create({
      data: {
        productName: data.productName,
        quantity: parseInt(data.quantity),
        amount: parseFloat(data.amount),
        date: new Date(data.date || new Date()),
        userId: auth.user!.id,
        source: 'manual',
      },
      include: { user: { select: { id: true, name: true } } },
    })

    return NextResponse.json(entry)
  } catch (error) {
    console.error('Sales tracking POST error:', error)
    return NextResponse.json({ error: 'Failed to create entry' }, { status: 500 })
  }
}
