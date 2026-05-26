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
    console.error(`Dashboard query failed [${label}]:`, err)
    return fallback
  }
}

export async function GET(request: Request) {
  try {
    // ─── Auth check ───
    const auth = await verifyAuth(['admin', 'staff'])
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const isAdmin = auth.user?.role === 'admin'
    const userId = auth.user!.id

    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    // Staff-scoped where clauses
    const saleWhere = isAdmin ? {} : { userId }
    const entryWhere = isAdmin ? {} : { userId }
    const creditWhere = isAdmin ? {} : { userId }

    // ─── Section 1: Core counts & aggregates ───
    const [
      totalProducts,
      lowStockProductsRaw,
      posTotalSales,
      posMonthSales,
      posTotalRevenue,
      posMonthRevenue,
      totalCategories,
      totalSuppliers,
      totalUsers,
    ] = await safeQuery('core-counts', () => Promise.all([
      db.product.count({ where: { active: true } }),
      db.product.findMany({ where: { active: true }, select: { quantity: true, minStock: true } }),
      db.sale.count({ where: saleWhere }),
      db.sale.count({ where: { ...saleWhere, createdAt: { gte: startOfMonth } } }),
      db.sale.aggregate({ _sum: { total: true }, where: saleWhere }),
      db.sale.aggregate({ _sum: { total: true }, where: { ...saleWhere, createdAt: { gte: startOfMonth } } }),
      db.category.count(),
      db.supplier.count({ where: { active: true } }),
      db.user.count({ where: { active: true } }),
    ]), [0, [], 0, 0, { _sum: { total: 0 } }, { _sum: { total: 0 } }, 0, 0, 0])

    const lowStockProducts = Array.isArray(lowStockProductsRaw)
      ? lowStockProductsRaw.filter((p: any) => (p.quantity ?? 0) > 0 && (p.quantity ?? 0) <= (p.minStock ?? 0)).length
      : 0
    const outOfStockProducts = Array.isArray(lowStockProductsRaw)
      ? lowStockProductsRaw.filter((p: any) => (p.quantity ?? 0) === 0).length
      : 0

    // ─── Section 2: Manual sales entries ───
    const [manualTotal, manualMonth] = await safeQuery('manual-sales', () => Promise.all([
      db.salesEntry.aggregate({
        _sum: { amount: true },
        _count: true,
        where: { source: 'manual', ...entryWhere },
      }),
      db.salesEntry.aggregate({
        _sum: { amount: true },
        _count: true,
        where: { source: 'manual', ...entryWhere, date: { gte: startOfMonth } },
      }),
    ]), [
      { _sum: { amount: 0 }, _count: 0 },
      { _sum: { amount: 0 }, _count: 0 },
    ])

    // ─── Section 3: Credit sales entries ───
    const [creditTotal, creditMonth] = await safeQuery('credit-sales', () => Promise.all([
      db.salesEntry.aggregate({
        _sum: { amount: true },
        _count: true,
        where: { source: 'credit', ...entryWhere },
      }),
      db.salesEntry.aggregate({
        _sum: { amount: true },
        _count: true,
        where: { source: 'credit', ...entryWhere, date: { gte: startOfMonth } },
      }),
    ]), [
      { _sum: { amount: 0 }, _count: 0 },
      { _sum: { amount: 0 }, _count: 0 },
    ])

    // ─── Section 4: Credit order stats ───
    const [creditOrderStats, creditOutstanding, creditPaidOrders, creditOverdueOrders, creditMonthOrders] = await safeQuery('credit-orders', () => Promise.all([
      db.creditOrder.aggregate({
        _sum: { totalAmount: true, remainingBalance: true, depositAmount: true },
        _count: true,
        where: creditWhere,
      }),
      db.creditOrder.count({ where: { ...creditWhere, paymentStatus: { not: 'fully_paid' } } }),
      db.creditOrder.count({ where: { ...creditWhere, paymentStatus: 'fully_paid' } }),
      db.creditOrder.count({ where: { ...creditWhere, paymentStatus: 'overdue' } }),
      db.creditOrder.count({ where: { ...creditWhere, createdAt: { gte: startOfMonth } } }),
    ]), [
      { _sum: { totalAmount: 0, remainingBalance: 0, depositAmount: 0 }, _count: 0 },
      0, 0, 0, 0,
    ])

    // ─── Combined totals ───
    const totalSales = (posTotalSales || 0) + (manualTotal._count || 0) + (creditTotal._count || 0)
    const monthSales = (posMonthSales || 0) + (manualMonth._count || 0) + (creditMonth._count || 0)
    const totalRevenue = (posTotalRevenue._sum?.total || 0) + (manualTotal._sum?.amount || 0) + (creditTotal._sum?.amount || 0)
    const monthRevenue = (posMonthRevenue._sum?.total || 0) + (manualMonth._sum?.amount || 0) + (creditMonth._sum?.amount || 0)

    // ─── Section 5: Recent activity ───
    const recentPosSales = await safeQuery('recent-pos', () => db.sale.findMany({
      where: saleWhere,
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { name: true } },
        items: { include: { product: { select: { name: true } } } },
      },
    }), [])

    const recentManualEntries = await safeQuery('recent-manual', () => db.salesEntry.findMany({
      where: { source: 'manual', ...entryWhere },
      take: 5,
      orderBy: { date: 'desc' },
      include: { user: { select: { name: true } } },
    }), [])

    const recentCreditEntries = await safeQuery('recent-credit', () => db.salesEntry.findMany({
      where: { source: 'credit', ...entryWhere },
      take: 5,
      orderBy: { date: 'desc' },
      include: { user: { select: { name: true } } },
    }), [])

    // Merge all into a unified recent sales list, sorted by date
    const recentSales = [
      ...(Array.isArray(recentPosSales) ? recentPosSales : []).map((sale: any) => ({
        id: sale.id,
        type: 'pos' as const,
        label: sale.invoiceNumber || 'POS Sale',
        total: sale.total || 0,
        paymentMethod: sale.paymentMethod || 'cash',
        user: sale.user || null,
        date: sale.createdAt || new Date(),
        itemCount: Array.isArray(sale.items) ? sale.items.length : 0,
      })),
      ...(Array.isArray(recentManualEntries) ? recentManualEntries : []).map((entry: any) => ({
        id: entry.id,
        type: 'manual' as const,
        label: entry.productName || 'Manual Entry',
        total: entry.amount || 0,
        paymentMethod: 'manual',
        user: entry.user || null,
        date: entry.date || new Date(),
        itemCount: 0,
      })),
      ...(Array.isArray(recentCreditEntries) ? recentCreditEntries : []).map((entry: any) => ({
        id: entry.id,
        type: 'credit' as const,
        label: entry.productName || 'Credit Sale',
        total: entry.amount || 0,
        paymentMethod: 'credit',
        user: entry.user || null,
        date: entry.date || new Date(),
        itemCount: 0,
      })),
    ]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 8)

    // ─── Section 6: Category breakdown ───
    const categoryBreakdown = await safeQuery('categories', () => db.category.findMany({
      include: { _count: { select: { products: { where: { active: true } } } } },
    }), [])

    // ─── Section 7: Top products ───
    let topProductsWithName: any[] = []
    try {
      const topProductSales = isAdmin
        ? await db.saleItem.groupBy({
            by: ['productId'],
            _sum: { quantity: true, total: true },
            orderBy: { _sum: { total: 'desc' } },
            take: 5,
          })
        : await db.saleItem.groupBy({
            by: ['productId'],
            _sum: { quantity: true, total: true },
            orderBy: { _sum: { total: 'desc' } },
            take: 5,
            where: { sale: { userId } },
          })

      const topProductIds = topProductSales.map(item => item.productId)
      const topProductsData = topProductIds.length > 0
        ? await db.product.findMany({
            where: { id: { in: topProductIds } },
            select: { id: true, name: true, category: { select: { name: true } } },
          })
        : []
      topProductsWithName = topProductSales.map(item => ({
        ...item,
        product: topProductsData.find(p => p.id === item.productId) || null,
      }))
    } catch (err) {
      console.error('Dashboard query failed [top-products]:', err)
    }

    // ─── Section 8: Daily sales last 7 days ───
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
    sevenDaysAgo.setHours(0, 0, 0, 0)

    const posRecentSalesData = await safeQuery('daily-pos', () => db.sale.findMany({
      where: { ...saleWhere, createdAt: { gte: sevenDaysAgo } },
      select: { createdAt: true, total: true },
    }), [])

    const manualRecentEntries = await safeQuery('daily-manual', () => db.salesEntry.findMany({
      where: { source: 'manual', ...entryWhere, date: { gte: sevenDaysAgo } },
      select: { date: true, amount: true },
    }), [])

    const creditRecentEntries = await safeQuery('daily-credit', () => db.salesEntry.findMany({
      where: { source: 'credit', ...entryWhere, date: { gte: sevenDaysAgo } },
      select: { date: true, amount: true },
    }), [])

    // Build daily sales map combining all sources
    const dailySalesMap: Record<string, number> = {}
    for (let i = 0; i < 7; i++) {
      const d = new Date(sevenDaysAgo)
      d.setDate(d.getDate() + i)
      dailySalesMap[d.toISOString().split('T')[0]] = 0
    }
    // Add POS sales
    for (const sale of (Array.isArray(posRecentSalesData) ? posRecentSalesData : [])) {
      try {
        const key = new Date(sale.createdAt).toISOString().split('T')[0]
        if (dailySalesMap[key] !== undefined) {
          dailySalesMap[key] += sale.total || 0
        }
      } catch {}
    }
    // Add manual entries
    for (const entry of (Array.isArray(manualRecentEntries) ? manualRecentEntries : [])) {
      try {
        const key = new Date(entry.date).toISOString().split('T')[0]
        if (dailySalesMap[key] !== undefined) {
          dailySalesMap[key] += entry.amount || 0
        }
      } catch {}
    }
    // Add credit entries
    for (const entry of (Array.isArray(creditRecentEntries) ? creditRecentEntries : [])) {
      try {
        const key = new Date(entry.date).toISOString().split('T')[0]
        if (dailySalesMap[key] !== undefined) {
          dailySalesMap[key] += entry.amount || 0
        }
      } catch {}
    }

    const response = {
      stats: {
        totalProducts: totalProducts || 0,
        lowStockProducts: lowStockProducts || 0,
        outOfStockProducts: outOfStockProducts || 0,
        totalSales: totalSales || 0,
        monthSales: monthSales || 0,
        totalRevenue: totalRevenue || 0,
        monthRevenue: monthRevenue || 0,
        totalCategories: totalCategories || 0,
        totalSuppliers: totalSuppliers || 0,
        totalUsers: totalUsers || 0,
      },
      credit: {
        totalOrders: creditOrderStats._count || 0,
        totalCreditAmount: creditOrderStats._sum?.totalAmount || 0,
        totalOutstanding: creditOrderStats._sum?.remainingBalance || 0,
        totalPaid: creditOrderStats._sum?.depositAmount || 0,
        paidOrders: creditPaidOrders || 0,
        outstandingOrders: creditOutstanding || 0,
        overdueOrders: creditOverdueOrders || 0,
        monthOrders: creditMonthOrders || 0,
      },
      recentSales,
      categoryBreakdown: Array.isArray(categoryBreakdown) ? categoryBreakdown : [],
      topProducts: Array.isArray(topProductsWithName) ? topProductsWithName : [],
      dailySales: Object.entries(dailySalesMap).map(([date, total]) => ({ date, total })),
    }

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    })
  } catch (error) {
    console.error('Dashboard GET fatal error:', error)
    // Even on fatal error, return a valid structure so the frontend can render something
    return NextResponse.json({
      stats: {
        totalProducts: 0, lowStockProducts: 0, outOfStockProducts: 0,
        totalSales: 0, monthSales: 0, totalRevenue: 0, monthRevenue: 0,
        totalCategories: 0, totalSuppliers: 0, totalUsers: 0,
      },
      credit: {
        totalOrders: 0, totalCreditAmount: 0, totalOutstanding: 0, totalPaid: 0,
        paidOrders: 0, outstandingOrders: 0, overdueOrders: 0, monthOrders: 0,
      },
      recentSales: [],
      categoryBreakdown: [],
      topProducts: [],
      dailySales: [],
      _error: 'Failed to fetch some dashboard data',
    }, { status: 200 }) // Return 200 with empty data so frontend doesn't show error
  }
}
