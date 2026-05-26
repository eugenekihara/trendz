import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyAuth } from '@/lib/auth'

// Force dynamic rendering — never cache this route
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const auth = await verifyAuth(['admin', 'staff'])
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const isAdmin = auth.user?.role === 'admin'
    const userId = auth.user!.id

    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    // Staff-scoped where clause: staff only see their own sales, admin sees all
    const saleWhere = isAdmin ? {} : { userId }
    const entryWhere = isAdmin ? {} : { userId }
    const creditWhere = isAdmin ? {} : { userId }

    // ─── Core counts & aggregates from Sale table (POS sales) ───
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
    ] = await Promise.all([
      db.product.count({ where: { active: true } }),
      db.product.findMany({ where: { active: true }, select: { quantity: true, minStock: true } }),
      db.sale.count({ where: saleWhere }),
      db.sale.count({ where: { ...saleWhere, createdAt: { gte: startOfMonth } } }),
      db.sale.aggregate({ _sum: { total: true }, where: saleWhere }),
      db.sale.aggregate({ _sum: { total: true }, where: { ...saleWhere, createdAt: { gte: startOfMonth } } }),
      db.category.count(),
      db.supplier.count({ where: { active: true } }),
      db.user.count({ where: { active: true } }),
    ])

    // ─── Manual sales entries (source='manual') ───
    const [manualTotal, manualMonth] = await Promise.all([
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
    ])

    // ─── Credit sales entries (source='credit') ───
    const [creditTotal, creditMonth] = await Promise.all([
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
    ])

    // ─── Credit order stats ───
    const [creditOrderStats, creditOutstanding, creditPaidOrders, creditOverdueOrders, creditMonthOrders] = await Promise.all([
      db.creditOrder.aggregate({
        _sum: { totalAmount: true, remainingBalance: true, depositAmount: true },
        _count: true,
        where: creditWhere,
      }),
      db.creditOrder.count({ where: { ...creditWhere, paymentStatus: { not: 'fully_paid' } } }),
      db.creditOrder.count({ where: { ...creditWhere, paymentStatus: 'fully_paid' } }),
      db.creditOrder.count({ where: { ...creditWhere, paymentStatus: 'overdue' } }),
      db.creditOrder.count({ where: { ...creditWhere, createdAt: { gte: startOfMonth } } }),
    ])

    // ─── Combined totals (POS + Manual + Credit) ───
    const totalSales = posTotalSales + manualTotal._count + creditTotal._count
    const monthSales = posMonthSales + manualMonth._count + creditMonth._count
    const totalRevenue = (posTotalRevenue._sum.total || 0) + (manualTotal._sum.amount || 0) + (creditTotal._sum.amount || 0)
    const monthRevenue = (posMonthRevenue._sum.total || 0) + (manualMonth._sum.amount || 0) + (creditMonth._sum.amount || 0)

    // ─── Recent activity (POS sales + manual entries + credit entries combined) ───
    const recentPosSales = await db.sale.findMany({
      where: saleWhere,
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { name: true } },
        items: { include: { product: { select: { name: true } } } },
      },
    })

    const recentManualEntries = await db.salesEntry.findMany({
      where: { source: 'manual', ...entryWhere },
      take: 5,
      orderBy: { date: 'desc' },
      include: { user: { select: { name: true } } },
    })

    const recentCreditEntries = await db.salesEntry.findMany({
      where: { source: 'credit', ...entryWhere },
      take: 5,
      orderBy: { date: 'desc' },
      include: { user: { select: { name: true } } },
    })

    // Merge all into a unified recent sales list, sorted by date
    const recentSales = [
      ...recentPosSales.map(sale => ({
        id: sale.id,
        type: 'pos' as const,
        label: sale.invoiceNumber,
        total: sale.total,
        paymentMethod: sale.paymentMethod,
        user: sale.user,
        date: sale.createdAt,
        itemCount: sale.items.length,
      })),
      ...recentManualEntries.map(entry => ({
        id: entry.id,
        type: 'manual' as const,
        label: entry.productName,
        total: entry.amount,
        paymentMethod: 'manual',
        user: entry.user,
        date: entry.date,
        itemCount: 0,
      })),
      ...recentCreditEntries.map(entry => ({
        id: entry.id,
        type: 'credit' as const,
        label: entry.productName,
        total: entry.amount,
        paymentMethod: 'credit',
        user: entry.user,
        date: entry.date,
        itemCount: 0,
      })),
    ]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 8)

    // Category breakdown
    const categoryBreakdown = await db.category.findMany({
      include: { _count: { select: { products: { where: { active: true } } } } },
    })

    const lowStockProducts = (lowStockProductsRaw as Array<{ quantity: number; minStock: number }>).filter(p => p.quantity > 0 && p.quantity <= p.minStock).length
    const outOfStockProducts = (lowStockProductsRaw as Array<{ quantity: number; minStock: number }>).filter(p => p.quantity === 0).length

    // ─── Top products (from POS SaleItems — scoped by user for staff) ───
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
    const topProductsWithName = topProductSales.map(item => ({
      ...item,
      product: topProductsData.find(p => p.id === item.productId) || null,
    }))

    // ─── Daily sales last 7 days (POS + manual + credit combined) ───
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
    sevenDaysAgo.setHours(0, 0, 0, 0)

    const posRecentSalesData = await db.sale.findMany({
      where: { ...saleWhere, createdAt: { gte: sevenDaysAgo } },
      select: { createdAt: true, total: true },
    })

    const manualRecentEntries = await db.salesEntry.findMany({
      where: { source: 'manual', ...entryWhere, date: { gte: sevenDaysAgo } },
      select: { date: true, amount: true },
    })

    const creditRecentEntries = await db.salesEntry.findMany({
      where: { source: 'credit', ...entryWhere, date: { gte: sevenDaysAgo } },
      select: { date: true, amount: true },
    })

    // Build daily sales map combining all sources
    const dailySales: Record<string, number> = {}
    for (let i = 0; i < 7; i++) {
      const d = new Date(sevenDaysAgo)
      d.setDate(d.getDate() + i)
      dailySales[d.toISOString().split('T')[0]] = 0
    }
    // Add POS sales
    for (const sale of posRecentSalesData) {
      const key = sale.createdAt.toISOString().split('T')[0]
      if (dailySales[key] !== undefined) {
        dailySales[key] += sale.total
      }
    }
    // Add manual entries
    for (const entry of manualRecentEntries) {
      const key = entry.date.toISOString().split('T')[0]
      if (dailySales[key] !== undefined) {
        dailySales[key] += entry.amount
      }
    }
    // Add credit entries
    for (const entry of creditRecentEntries) {
      const key = entry.date.toISOString().split('T')[0]
      if (dailySales[key] !== undefined) {
        dailySales[key] += entry.amount
      }
    }

    return NextResponse.json({
      stats: {
        totalProducts,
        lowStockProducts,
        outOfStockProducts,
        totalSales,
        monthSales,
        totalRevenue,
        monthRevenue,
        totalCategories,
        totalSuppliers,
        totalUsers,
      },
      credit: {
        totalOrders: creditOrderStats._count,
        totalCreditAmount: creditOrderStats._sum.totalAmount || 0,
        totalOutstanding: creditOrderStats._sum.remainingBalance || 0,
        totalPaid: creditOrderStats._sum.depositAmount || 0,
        paidOrders: creditPaidOrders,
        outstandingOrders: creditOutstanding,
        overdueOrders: creditOverdueOrders,
        monthOrders: creditMonthOrders,
      },
      recentSales,
      categoryBreakdown,
      topProducts: topProductsWithName,
      dailySales: Object.entries(dailySales).map(([date, total]) => ({ date, total })),
    }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
  } catch (error) {
    console.error('Dashboard GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch dashboard' }, { status: 500 })
  }
}
