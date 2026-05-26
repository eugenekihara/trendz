import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyAuth } from '@/lib/auth'

// Force dynamic rendering — never cache this route
export const dynamic = 'force-dynamic'

/**
 * GET /api/reports - Generate reports from ALL live data (POS sales + manual entries)
 * This ensures Reports always match Dashboard and Sales Tracking totals.
 *
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

    const saleDateFilter = { createdAt: { gte: startDate, lte: endDate } }
    const entryDateFilter = { date: { gte: startDate, lte: endDate } }

    // ─── POS sales data from Sale table ───
    const [
      posTotalSales,
      posTotalRevenue,
      posTotalItemsSold,
      posSalesByDay,
      salesByPaymentMethod,
      posTopProducts,
    ] = await Promise.all([
      // POS sale count in period
      db.sale.count({ where: saleDateFilter }),

      // POS revenue in period
      db.sale.aggregate({
        _sum: { total: true, discount: true },
        _count: true,
        where: saleDateFilter,
      }),

      // POS items sold in period
      db.saleItem.aggregate({
        _sum: { quantity: true },
        where: { sale: saleDateFilter },
      }),

      // POS sales grouped by day
      db.sale.findMany({
        where: saleDateFilter,
        select: { createdAt: true, total: true },
        orderBy: { createdAt: 'asc' },
      }),

      // POS sales grouped by payment method
      db.sale.groupBy({
        by: ['paymentMethod'],
        _sum: { total: true },
        _count: true,
        where: saleDateFilter,
      }),

      // Top selling products (from POS SaleItems)
      db.saleItem.groupBy({
        by: ['productId'],
        _sum: { quantity: true, total: true },
        _count: true,
        where: { sale: saleDateFilter },
        orderBy: { _sum: { total: 'desc' } },
        take: 10,
      }),
    ])

    // ─── Manual sales entries in the same period ───
    const [manualTotal, manualRevenue, manualSalesByDay] = await Promise.all([
      db.salesEntry.count({ where: { source: 'manual', ...entryDateFilter } }),
      db.salesEntry.aggregate({
        _sum: { amount: true },
        where: { source: 'manual', ...entryDateFilter },
      }),
      db.salesEntry.findMany({
        where: { source: 'manual', ...entryDateFilter },
        select: { date: true, amount: true },
      }),
    ])

    // ─── Combined totals ───
    const totalSales = posTotalSales + manualTotal
    const totalRevenue = (posTotalRevenue._sum.total || 0) + (manualRevenue._sum.amount || 0)
    const totalDiscount = posTotalRevenue._sum.discount || 0
    const totalItemsSold = posTotalItemsSold._sum.quantity || 0

    // ─── Process daily sales (POS + manual combined) ───
    const dailySalesMap: Record<string, number> = {}
    // Add POS daily sales
    for (const sale of posSalesByDay) {
      const key = sale.createdAt.toISOString().split('T')[0]
      dailySalesMap[key] = (dailySalesMap[key] || 0) + sale.total
    }
    // Add manual daily sales
    for (const entry of manualSalesByDay) {
      const key = entry.date.toISOString().split('T')[0]
      dailySalesMap[key] = (dailySalesMap[key] || 0) + entry.amount
    }
    const dailySales = Object.entries(dailySalesMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, total]) => ({ date, total }))

    // ─── Enrich top products with name and category ───
    const topProductIds = posTopProducts.map(item => item.productId)
    const topProductsData = await db.product.findMany({
      where: { id: { in: topProductIds } },
      select: { id: true, name: true, category: { select: { name: true } } },
    })
    const topProductsWithDetails = posTopProducts.map(item => ({
      ...item,
      product: topProductsData.find(p => p.id === item.productId) || null,
    }))

    // ─── Process payment method breakdown (POS only — manual entries don't have payment methods) ───
    const paymentMethodBreakdown = salesByPaymentMethod.map(item => ({
      method: item.paymentMethod,
      total: item._sum.total || 0,
      count: item._count,
    }))

    // ─── Category breakdown (active products, date-aware via sales data) ───
    const categoryBreakdown = await db.category.findMany({
      include: {
        _count: { select: { products: { where: { active: true } } } },
      },
    })

    const result = {
      period,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      summary: {
        totalSales,
        totalRevenue,
        totalDiscount,
        totalItemsSold,
        averageSale: totalSales > 0 ? totalRevenue / totalSales : 0,
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
