import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyAuth } from '@/lib/auth'

// Force dynamic rendering — never cache this route
export const dynamic = 'force-dynamic'

// Helper: safely execute a DB query, returning fallback on failure
async function safeQuery<T>(label: string, query: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await query()
  } catch (err) {
    console.error(`Sales tracking query failed [${label}]:`, err)
    return fallback
  }
}

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

    // Fetch paginated entries AND aggregate summary in parallel
    // Summary is computed over ALL matching entries, not just the current page
    const [entries, total, summary, posSummary, creditSummary] = await safeQuery('main-query', () => Promise.all([
      db.salesEntry.findMany({
        where,
        include: { user: { select: { id: true, name: true } } },
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.salesEntry.count({ where }),
      db.salesEntry.aggregate({
        where,
        _sum: { amount: true, quantity: true },
        _count: true,
      }),
      // Separate POS mirror entry summary for source breakdown
      db.salesEntry.aggregate({
        where: { ...where, source: 'pos' },
        _sum: { amount: true },
        _count: true,
      }),
      // Credit source summary
      db.salesEntry.aggregate({
        where: { ...where, source: 'credit' },
        _sum: { amount: true },
        _count: true,
      }),
    ]), [
      [], 0,
      { _sum: { amount: 0, quantity: 0 }, _count: 0 },
      { _sum: { amount: 0 }, _count: 0 },
      { _sum: { amount: 0 }, _count: 0 },
    ])

    // Compute manual entry totals by subtraction (avoids extra queries)
    const creditAmount = creditSummary._sum?.amount || 0
    const creditCount = creditSummary._count || 0
    const manualAmount = Math.max(0, (summary._sum?.amount || 0) - (posSummary._sum?.amount || 0) - creditAmount)
    const manualCount = Math.max(0, (summary._count || 0) - (posSummary._count || 0) - creditCount)

    return NextResponse.json({
      entries: Array.isArray(entries) ? entries : [],
      total: total || 0,
      page,
      limit,
      // Summary totals across ALL entries (not just current page)
      summary: {
        totalAmount: summary._sum?.amount || 0,
        totalQuantity: summary._sum?.quantity || 0,
        totalEntries: summary._count || 0,
        posAmount: posSummary._sum?.amount || 0,
        posCount: posSummary._count || 0,
        creditAmount,
        creditCount,
        manualAmount,
        manualCount,
      },
    }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
  } catch (error) {
    console.error('Sales tracking GET fatal error:', error)
    // Return structured empty data so frontend doesn't crash
    return NextResponse.json({
      entries: [],
      total: 0,
      page: 1,
      limit: 20,
      summary: {
        totalAmount: 0, totalQuantity: 0, totalEntries: 0,
        posAmount: 0, posCount: 0,
        creditAmount: 0, creditCount: 0,
        manualAmount: 0, manualCount: 0,
      },
      _error: 'Failed to fetch sales tracking data',
    }, { status: 200 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await verifyAuth()
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const data = await request.json()

    // Validate required fields
    if (!data.productName?.trim()) {
      return NextResponse.json({ error: 'Product name is required' }, { status: 400 })
    }

    const quantity = parseInt(data.quantity)
    const amount = parseFloat(data.amount)
    if (isNaN(quantity) || quantity <= 0) {
      return NextResponse.json({ error: 'Valid quantity is required' }, { status: 400 })
    }
    if (isNaN(amount) || amount < 0) {
      return NextResponse.json({ error: 'Valid amount is required' }, { status: 400 })
    }

    const entry = await db.salesEntry.create({
      data: {
        productName: data.productName.trim(),
        quantity,
        amount,
        date: new Date(data.date || new Date()),
        userId: auth.user!.id,
        source: 'manual',
      },
      include: { user: { select: { id: true, name: true } } },
    })

    return NextResponse.json(entry, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
  } catch (error) {
    console.error('Sales tracking POST error:', error)
    return NextResponse.json({ error: 'Failed to create entry' }, { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
  }
}
