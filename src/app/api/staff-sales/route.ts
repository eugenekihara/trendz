import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyAuth } from '@/lib/auth'

export async function GET() {
  try {
    const auth = await verifyAuth()
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const userId = auth.user!.id
    const now = new Date()
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const startOfWeek = new Date(startOfDay)
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay())
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    // Overall stats
    const allEntries = await db.salesEntry.findMany({
      where: { userId },
      select: { amount: true, quantity: true, date: true, source: true, createdAt: true },
    })

    const totalSales = allEntries.length
    const totalAmount = allEntries.reduce((sum, e) => sum + e.amount, 0)
    const avgSale = totalSales > 0 ? totalAmount / totalSales : 0

    // Period stats
    const todayEntries = allEntries.filter(e => new Date(e.date) >= startOfDay)
    const weekEntries = allEntries.filter(e => new Date(e.date) >= startOfWeek)
    const monthEntries = allEntries.filter(e => new Date(e.date) >= startOfMonth)

    // Recent transactions
    const recentSales = await db.salesEntry.findMany({
      where: { userId },
      include: { user: { select: { name: true } } },
      orderBy: { date: 'desc' },
      take: 10,
    })

    // Sales by source
    const posCount = allEntries.filter(e => e.source === 'pos').length
    const manualCount = allEntries.filter(e => e.source === 'manual').length

    // Performance trend (last 7 days)
    const sevenDaysAgo = new Date(startOfDay)
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
    const recentWeekEntries = allEntries.filter(e => new Date(e.date) >= sevenDaysAgo)

    const dailyData: Record<string, { count: number; amount: number }> = {}
    for (let i = 0; i < 7; i++) {
      const d = new Date(sevenDaysAgo)
      d.setDate(d.getDate() + i)
      const key = d.toISOString().split('T')[0]
      dailyData[key] = { count: 0, amount: 0 }
    }
    for (const entry of recentWeekEntries) {
      const key = new Date(entry.date).toISOString().split('T')[0]
      if (dailyData[key]) {
        dailyData[key].count++
        dailyData[key].amount += entry.amount
      }
    }

    return NextResponse.json({
      summary: {
        totalSales,
        totalAmount,
        avgSale,
        todaySales: todayEntries.length,
        todayAmount: todayEntries.reduce((s, e) => s + e.amount, 0),
        weekSales: weekEntries.length,
        weekAmount: weekEntries.reduce((s, e) => s + e.amount, 0),
        monthSales: monthEntries.length,
        monthAmount: monthEntries.reduce((s, e) => s + e.amount, 0),
        posCount,
        manualCount,
      },
      recentTransactions: recentSales,
      dailyTrend: Object.entries(dailyData).map(([date, data]) => ({ date, ...data })),
    })
  } catch (error) {
    console.error('Staff sales GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch sales data' }, { status: 500 })
  }
}
