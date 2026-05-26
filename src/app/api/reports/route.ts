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
    console.error(`Reports query failed [${label}]:`, err)
    return fallback
  }
}

/**
 * GET /api/reports - Generate reports from ALL live data (POS sales + manual entries + credit)
 * This ensures Reports always match Dashboard and Sales Tracking totals.
 *
 * Query params:
 *   period: 'week' | 'month' | 'year' (default: 'month')
 *   startDate: ISO date string (overrides period)
 *   endDate: ISO date string (overrides period)
 */
export async function GET(request: Request) {
  try {
    const auth = await verifyAuth(['admin', 'staff'])
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const isAdmin = auth.user?.role === 'admin'
    const userId = auth.user!.id

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

    const saleDateFilter: any = { createdAt: { gte: startDate, lte: endDate } }
    const entryDateFilter: any = { date: { gte: startDate, lte: endDate } }
    const creditDateFilter: any = { createdAt: { gte: startDate, lte: endDate } }

    // Staff-scoped where clauses
    const saleWhere = isAdmin ? saleDateFilter : { ...saleDateFilter, userId }
    const entryWhere = isAdmin ? entryDateFilter : { ...entryDateFilter, userId }
    const creditWhere = isAdmin ? creditDateFilter : { ...creditDateFilter, userId }

    // ─── Section 1: POS sales data from Sale table ───
    const [
      posTotalSales,
      posTotalRevenue,
      posTotalItemsSold,
      posSalesByDay,
      salesByPaymentMethod,
      posTopProducts,
    ] = await safeQuery('pos-sales', () => Promise.all([
      db.sale.count({ where: saleWhere }),
      db.sale.aggregate({
        _sum: { total: true, discount: true },
        _count: true,
        where: saleWhere,
      }),
      db.saleItem.aggregate({
        _sum: { quantity: true },
        where: { sale: saleWhere },
      }),
      db.sale.findMany({
        where: saleWhere,
        select: { createdAt: true, total: true },
        orderBy: { createdAt: 'asc' },
      }),
      db.sale.groupBy({
        by: ['paymentMethod'],
        _sum: { total: true },
        _count: true,
        where: saleWhere,
      }),
      db.saleItem.groupBy({
        by: ['productId'],
        _sum: { quantity: true, total: true },
        _count: true,
        where: { sale: saleWhere },
        orderBy: { _sum: { total: 'desc' } },
        take: 10,
      }),
    ]), [
      0,
      { _sum: { total: 0, discount: 0 }, _count: 0 },
      { _sum: { quantity: 0 } },
      [],
      [],
      [],
    ])

    // ─── Section 2: Manual sales entries ───
    const [manualTotal, manualRevenue, manualSalesByDay, manualItemsSold] = await safeQuery('manual-sales', () => Promise.all([
      db.salesEntry.count({ where: { source: 'manual', ...entryWhere } }),
      db.salesEntry.aggregate({
        _sum: { amount: true },
        where: { source: 'manual', ...entryWhere },
      }),
      db.salesEntry.findMany({
        where: { source: 'manual', ...entryWhere },
        select: { date: true, amount: true },
      }),
      db.salesEntry.aggregate({
        _sum: { quantity: true },
        where: { source: 'manual', ...entryWhere },
      }),
    ]), [
      0,
      { _sum: { amount: 0 } },
      [],
      { _sum: { quantity: 0 } },
    ])

    // ─── Section 3: Credit sales entries ───
    const [creditTotal, creditRevenue, creditSalesByDay, creditItemsSold] = await safeQuery('credit-sales', () => Promise.all([
      db.salesEntry.count({ where: { source: 'credit', ...entryWhere } }),
      db.salesEntry.aggregate({
        _sum: { amount: true },
        where: { source: 'credit', ...entryWhere },
      }),
      db.salesEntry.findMany({
        where: { source: 'credit', ...entryWhere },
        select: { date: true, amount: true },
      }),
      db.salesEntry.aggregate({
        _sum: { quantity: true },
        where: { source: 'credit', ...entryWhere },
      }),
    ]), [
      0,
      { _sum: { amount: 0 } },
      [],
      { _sum: { quantity: 0 } },
    ])

    // ─── Section 4: Credit order analytics ───
    const [
      creditOrderPeriodCount,
      creditOrderPeriodRevenue,
      creditOrderOutstanding,
      creditOrderPaidCount,
      creditOrderOverdueCount,
    ] = await safeQuery('credit-orders', () => Promise.all([
      db.creditOrder.count({ where: creditWhere }),
      db.creditOrder.aggregate({
        _sum: { totalAmount: true, remainingBalance: true, depositAmount: true },
        where: creditWhere,
      }),
      db.creditOrder.aggregate({
        _sum: { remainingBalance: true },
        _count: true,
        where: { ...creditWhere, paymentStatus: { not: 'fully_paid' } },
      }),
      db.creditOrder.count({ where: { paymentStatus: 'fully_paid', ...creditWhere } }),
      db.creditOrder.count({ where: { paymentStatus: 'overdue', ...creditWhere } }),
    ]), [
      0,
      { _sum: { totalAmount: 0, remainingBalance: 0, depositAmount: 0 } },
      { _sum: { remainingBalance: 0 }, _count: 0 },
      0,
      0,
    ])

    // ─── Combined totals ───
    const totalSales = (posTotalSales || 0) + (manualTotal || 0) + (creditTotal || 0)
    const totalRevenue = (posTotalRevenue._sum?.total || 0) + (manualRevenue._sum?.amount || 0) + (creditRevenue._sum?.amount || 0)
    const totalDiscount = posTotalRevenue._sum?.discount || 0
    const totalItemsSold = (posTotalItemsSold._sum?.quantity || 0) + (manualItemsSold._sum?.quantity || 0) + (creditItemsSold._sum?.quantity || 0)

    // ─── Process daily sales (POS + manual + credit combined) ───
    const dailySalesMap: Record<string, number> = {}
    for (const sale of (Array.isArray(posSalesByDay) ? posSalesByDay : [])) {
      try {
        const key = new Date(sale.createdAt).toISOString().split('T')[0]
        dailySalesMap[key] = (dailySalesMap[key] || 0) + (sale.total || 0)
      } catch {}
    }
    for (const entry of (Array.isArray(manualSalesByDay) ? manualSalesByDay : [])) {
      try {
        const key = new Date(entry.date).toISOString().split('T')[0]
        dailySalesMap[key] = (dailySalesMap[key] || 0) + (entry.amount || 0)
      } catch {}
    }
    for (const entry of (Array.isArray(creditSalesByDay) ? creditSalesByDay : [])) {
      try {
        const key = new Date(entry.date).toISOString().split('T')[0]
        dailySalesMap[key] = (dailySalesMap[key] || 0) + (entry.amount || 0)
      } catch {}
    }
    const dailySales = Object.entries(dailySalesMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, total]) => ({ date, total }))

    // ─── Enrich top products ───
    let topProductsWithDetails: any[] = []
    try {
      const topProductIds = (Array.isArray(posTopProducts) ? posTopProducts : []).map((item: any) => item.productId)
      const topProductsData = topProductIds.length > 0
        ? await db.product.findMany({
            where: { id: { in: topProductIds } },
            select: { id: true, name: true, category: { select: { name: true } } },
          })
        : []
      topProductsWithDetails = (Array.isArray(posTopProducts) ? posTopProducts : []).map((item: any) => ({
        ...item,
        product: topProductsData.find((p: any) => p.id === item.productId) || null,
      }))
    } catch (err) {
      console.error('Reports query failed [top-products-enrich]:', err)
    }

    // ─── Payment method breakdown ───
    const paymentMethodBreakdown = (Array.isArray(salesByPaymentMethod) ? salesByPaymentMethod : []).map((item: any) => ({
      method: item.paymentMethod,
      total: item._sum?.total || 0,
      count: item._count || 0,
    }))

    // ─── Category breakdown ───
    let categoryBreakdown: any[] = []
    try {
      const categorySalesData = await db.saleItem.findMany({
        where: { sale: saleWhere },
        include: {
          product: {
            select: {
              categoryId: true,
              category: { select: { id: true, name: true } },
            },
          },
        },
      })

      const categorySalesMap: Record<string, { name: string; revenue: number; itemsSold: number; productIds: Set<string> }> = {}
      for (const item of categorySalesData) {
        const catId = item.product?.categoryId
        const catName = item.product?.category?.name
        if (!catId || !catName) continue
        if (!categorySalesMap[catId]) {
          categorySalesMap[catId] = { name: catName, revenue: 0, itemsSold: 0, productIds: new Set() }
        }
        categorySalesMap[catId].revenue += item.total || 0
        categorySalesMap[catId].itemsSold += item.quantity || 0
        if (item.productId) categorySalesMap[catId].productIds.add(item.productId)
      }

      const currentCategoryData = await db.category.findMany({
        include: {
          _count: { select: { products: { where: { active: true } } } },
        },
      })

      categoryBreakdown = currentCategoryData.map((cat: any) => {
        const salesData = categorySalesMap[cat.id]
        return {
          id: cat.id,
          name: cat.name,
          description: cat.description,
          _count: { products: cat._count?.products || 0 },
          periodRevenue: salesData?.revenue || 0,
          periodItemsSold: salesData?.itemsSold || 0,
          periodProductsSold: salesData?.productIds.size || 0,
        }
      })
    } catch (err) {
      console.error('Reports query failed [category-breakdown]:', err)
    }

    const result = {
      period,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      summary: {
        totalSales: totalSales || 0,
        totalRevenue: totalRevenue || 0,
        totalDiscount: totalDiscount || 0,
        totalItemsSold: totalItemsSold || 0,
        averageSale: totalSales > 0 ? totalRevenue / totalSales : 0,
        posSales: posTotalSales || 0,
        posRevenue: posTotalRevenue._sum?.total || 0,
        manualSales: manualTotal || 0,
        manualRevenue: manualRevenue._sum?.amount || 0,
        creditSales: creditTotal || 0,
        creditRevenue: creditRevenue._sum?.amount || 0,
      },
      credit: {
        periodOrders: creditOrderPeriodCount || 0,
        periodCreditAmount: creditOrderPeriodRevenue._sum?.totalAmount || 0,
        periodCollected: creditOrderPeriodRevenue._sum?.depositAmount || 0,
        totalOutstanding: creditOrderOutstanding._sum?.remainingBalance || 0,
        outstandingOrders: creditOrderOutstanding._count || 0,
        paidOrders: creditOrderPaidCount || 0,
        overdueOrders: creditOrderOverdueCount || 0,
      },
      dailySales: Array.isArray(dailySales) ? dailySales : [],
      topProducts: Array.isArray(topProductsWithDetails) ? topProductsWithDetails : [],
      paymentMethodBreakdown: Array.isArray(paymentMethodBreakdown) ? paymentMethodBreakdown : [],
      categoryBreakdown: Array.isArray(categoryBreakdown) ? categoryBreakdown : [],
    }

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    })
  } catch (error) {
    console.error('Reports GET fatal error:', error)
    // Return structured empty data so the frontend can render something
    return NextResponse.json({
      period: 'month',
      startDate: new Date().toISOString(),
      endDate: new Date().toISOString(),
      summary: {
        totalSales: 0, totalRevenue: 0, totalDiscount: 0, totalItemsSold: 0,
        averageSale: 0, posSales: 0, posRevenue: 0, manualSales: 0,
        manualRevenue: 0, creditSales: 0, creditRevenue: 0,
      },
      credit: {
        periodOrders: 0, periodCreditAmount: 0, periodCollected: 0,
        totalOutstanding: 0, outstandingOrders: 0, paidOrders: 0, overdueOrders: 0,
      },
      dailySales: [],
      topProducts: [],
      paymentMethodBreakdown: [],
      categoryBreakdown: [],
      _error: 'Failed to generate some report data',
    }, { status: 200 }) // Return 200 with empty data so frontend doesn't crash
  }
}
