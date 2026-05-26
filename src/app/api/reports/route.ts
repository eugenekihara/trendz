import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyAuth } from '@/lib/auth'

// Force dynamic rendering — never cache this route
export const dynamic = 'force-dynamic'

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

    // Staff-scoped where clauses: staff only see their own data
    const saleWhere = isAdmin ? saleDateFilter : { ...saleDateFilter, userId }
    const entryWhere = isAdmin ? entryDateFilter : { ...entryDateFilter, userId }
    const creditWhere = isAdmin ? creditDateFilter : { ...creditDateFilter, userId }

    // ─── POS sales data from Sale table ───
    const [
      posTotalSales,
      posTotalRevenue,
      posTotalItemsSold,
      posSalesByDay,
      salesByPaymentMethod,
      posTopProducts,
    ] = await Promise.all([
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
    ])

    // ─── Manual sales entries in the same period ───
    const [manualTotal, manualRevenue, manualSalesByDay, manualItemsSold] = await Promise.all([
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
    ])

    // ─── Credit sales entries in the same period ───
    const [creditTotal, creditRevenue, creditSalesByDay, creditItemsSold] = await Promise.all([
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
    ])

    // ─── Credit order analytics ───
    const [
      creditOrderPeriodCount,
      creditOrderPeriodRevenue,
      creditOrderOutstanding,
      creditOrderPaidCount,
      creditOrderOverdueCount,
    ] = await Promise.all([
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
    ])

    // ─── Combined totals (POS + Manual + Credit) ───
    const totalSales = posTotalSales + manualTotal + creditTotal
    const totalRevenue = (posTotalRevenue._sum.total || 0) + (manualRevenue._sum.amount || 0) + (creditRevenue._sum.amount || 0)
    const totalDiscount = posTotalRevenue._sum.discount || 0
    const totalItemsSold = (posTotalItemsSold._sum.quantity || 0) + (manualItemsSold._sum.quantity || 0) + (creditItemsSold._sum.quantity || 0)

    // ─── Process daily sales (POS + manual + credit combined) ───
    const dailySalesMap: Record<string, number> = {}
    for (const sale of posSalesByDay) {
      const key = sale.createdAt.toISOString().split('T')[0]
      dailySalesMap[key] = (dailySalesMap[key] || 0) + sale.total
    }
    for (const entry of manualSalesByDay) {
      const key = entry.date.toISOString().split('T')[0]
      dailySalesMap[key] = (dailySalesMap[key] || 0) + entry.amount
    }
    for (const entry of creditSalesByDay) {
      const key = entry.date.toISOString().split('T')[0]
      dailySalesMap[key] = (dailySalesMap[key] || 0) + entry.amount
    }
    const dailySales = Object.entries(dailySalesMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, total]) => ({ date, total }))

    // ─── Enrich top products ───
    const topProductIds = posTopProducts.map(item => item.productId)
    const topProductsData = await db.product.findMany({
      where: { id: { in: topProductIds } },
      select: { id: true, name: true, category: { select: { name: true } } },
    })
    const topProductsWithDetails = posTopProducts.map(item => ({
      ...item,
      product: topProductsData.find(p => p.id === item.productId) || null,
    }))

    // ─── Payment method breakdown ───
    const paymentMethodBreakdown = salesByPaymentMethod.map(item => ({
      method: item.paymentMethod,
      total: item._sum.total || 0,
      count: item._count,
    }))

    // ─── Category breakdown ───
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

    const categoryBreakdown = currentCategoryData.map(cat => {
      const salesData = categorySalesMap[cat.id]
      return {
        id: cat.id,
        name: cat.name,
        description: cat.description,
        _count: { products: cat._count.products },
        periodRevenue: salesData?.revenue || 0,
        periodItemsSold: salesData?.itemsSold || 0,
        periodProductsSold: salesData?.productIds.size || 0,
      }
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
        posSales: posTotalSales,
        posRevenue: posTotalRevenue._sum.total || 0,
        manualSales: manualTotal,
        manualRevenue: manualRevenue._sum.amount || 0,
        creditSales: creditTotal,
        creditRevenue: creditRevenue._sum.amount || 0,
      },
      credit: {
        periodOrders: creditOrderPeriodCount,
        periodCreditAmount: creditOrderPeriodRevenue._sum.totalAmount || 0,
        periodCollected: creditOrderPeriodRevenue._sum.depositAmount || 0,
        totalOutstanding: creditOrderOutstanding._sum.remainingBalance || 0,
        outstandingOrders: creditOrderOutstanding._count,
        paidOrders: creditOrderPaidCount,
        overdueOrders: creditOrderOverdueCount,
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
