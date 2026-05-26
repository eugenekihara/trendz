import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyAuth } from '@/lib/auth'

// Force dynamic rendering — never cache this route
export const dynamic = 'force-dynamic'

/**
 * GET /api/reports - Generate reports from live Sale data (same source as Dashboard)
 * Query params:
 *   period: 'week' | 'month' | 'year' (default: 'month')
 *   startDate: ISO date string (overrides period)
 *   endDate: ISO date string (overrides period)
 */
export async function GET(request: Request) {
  try {
    const auth = await verifyAuth('admin')
    if (!auth.authenticated || auth.error) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') || 'month'
    const customStartDate = searchParams.get('startDate')
    const customEndDate = searchParams.get('endDate')

    // Calculate date range based on period or custom dates
    const now = new Date()
    let startDate: Date
    let endDate: Date = now

    if (customStartDate && customEndDate) {
      startDate = new Date(customStartDate)
      endDate = new Date(customEndDate)
      endDate.setHours(23, 59, 59, 999)
    } else {
      switch (period) {
        case 'week': {
          startDate = new Date(now)
          startDate.setDate(now.getDate() - 6)
          startDate.setHours(0, 0, 0, 0)
          break
        }
        case 'year': {
          startDate = new Date(now.getFullYear(), 0, 1)
          break
        }
        case 'month':
        default: {
          startDate = new Date(now.getFullYear(), now.getMonth(), 1)
          break
        }
      }
    }

    const dateFilter = { createdAt: { gte: startDate, lte: endDate } }

    // All queries use the Sale table — the single source of truth for sales data
    // This ensures Reports always match Dashboard and Sales Tracking
    const [
      totalSales,
      totalRevenue,
      totalItemsSold,
      salesByDay,
      salesByPaymentMethod,
      topProducts,
      categoryBreakdown,
    ] = await Promise.all([
      // Total sale count in period
      db.sale.count({ where: dateFilter }),

      // Total revenue in period
      db.sale.aggregate({
        _sum: { total: true, discount: true },
        _count: true,
        where: dateFilter,
      }),

      // Total items sold in period
      db.saleItem.aggregate({
        _sum: { quantity: true },
        where: { sale: dateFilter },
      }),

      // Sales grouped by day
      db.sale.findMany({
        where: dateFilter,
        select: { createdAt: true, total: true },
        orderBy: { createdAt: 'asc' },
      }),

      // Sales grouped by payment method
      db.sale.groupBy({
        by: ['paymentMethod'],
        _sum: { total: true },
        _count: true,
        where: dateFilter,
      }),

      // Top selling products
      db.saleItem.groupBy({
        by: ['productId'],
        _sum: { quantity: true, total: true },
        _count: true,
        where: { sale: dateFilter },
        orderBy: { _sum: { total: 'desc' } },
        take: 10,
      }),

      // Category breakdown (active products only)
      db.category.findMany({
        include: {
          _count: { select: { products: { where: { active: true } } } },
        },
      }),
    ])

    // Process sales by day
    const dailySalesMap: Record<string, number> = {}
    for (const sale of salesByDay) {
      const key = sale.createdAt.toISOString().split('T')[0]
      dailySalesMap[key] = (dailySalesMap[key] || 0) + sale.total
    }
    const dailySales = Object.entries(dailySalesMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, total]) => ({ date, total }))

    // Enrich top products with name and category
    const topProductIds = topProducts.map(item => item.productId)
    const topProductsData = await db.product.findMany({
      where: { id: { in: topProductIds } },
      select: { id: true, name: true, category: { select: { name: true } } },
    })
    const topProductsWithDetails = topProducts.map(item => ({
      ...item,
      product: topProductsData.find(p => p.id === item.productId) || null,
    }))

    // Process payment method breakdown
    const paymentMethodBreakdown = salesByPaymentMethod.map(item => ({
      method: item.paymentMethod,
      total: item._sum.total || 0,
      count: item._count,
    }))

    const result = {
      period,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      summary: {
        totalSales,
        totalRevenue: totalRevenue._sum.total || 0,
        totalDiscount: totalRevenue._sum.discount || 0,
        totalItemsSold: totalItemsSold._sum.quantity || 0,
        averageSale: totalSales > 0 ? (totalRevenue._sum.total || 0) / totalSales : 0,
      },
      dailySales,
      topProducts: topProductsWithDetails,
      paymentMethodBreakdown,
      categoryBreakdown,
    }

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    })
  } catch (error) {
    console.error('Reports GET error:', error)
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 })
  }
}
