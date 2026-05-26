import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyAuth } from '@/lib/auth'

// Force dynamic rendering — never cache this route
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const auth = await verifyAuth('admin')
    if (!auth.authenticated || auth.error) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

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
      // Low stock: products where quantity > 0 but quantity <= minStock
      // Since SQLite can't compare columns in WHERE, we fetch all active products and filter
      db.product.findMany({ where: { active: true }, select: { quantity: true, minStock: true } }),
      db.sale.count(),
      db.sale.count({ where: { createdAt: { gte: startOfMonth } } }),
      db.sale.aggregate({ _sum: { total: true } }),
      db.sale.aggregate({ _sum: { total: true }, where: { createdAt: { gte: startOfMonth } } }),
      db.category.count(),
      db.supplier.count({ where: { active: true } }),
      db.user.count({ where: { active: true } }),
    ])

    // ─── Manual sales entries (source='manual') ───
    // These are sales tracked outside POS and must be included in totals
    const [manualTotal, manualMonth] = await Promise.all([
      db.salesEntry.aggregate({
        _sum: { amount: true },
        _count: true,
        where: { source: 'manual' },
      }),
      db.salesEntry.aggregate({
        _sum: { amount: true },
        _count: true,
        where: { source: 'manual', date: { gte: startOfMonth } },
      }),
    ])

    // ─── Combined totals (POS + Manual) ───
    const totalSales = posTotalSales + manualTotal._count
    const monthSales = posMonthSales + manualMonth._count
    const totalRevenue = (posTotalRevenue._sum.total || 0) + (manualTotal._sum.amount || 0)
    const monthRevenue = (posMonthRevenue._sum.total || 0) + (manualMonth._sum.amount || 0)

    // ─── Recent activity (POS sales + manual entries combined) ───
    // Fetch POS sales (have full item detail)
    const recentPosSales = await db.sale.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { name: true } },
        items: { include: { product: { select: { name: true } } } },
      },
    })

    // Fetch recent manual entries (contribute to totals but were invisible before)
    const recentManualEntries = await db.salesEntry.findMany({
      where: { source: 'manual' },
      take: 5,
      orderBy: { date: 'desc' },
      include: { user: { select: { name: true } } },
    })

    // Merge both into a unified recent sales list, sorted by date
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
    ]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 8)

    // Category breakdown
    const categoryBreakdown = await db.category.findMany({
      include: { _count: { select: { products: { where: { active: true } } } } },
    })

    const lowStockProducts = (lowStockProductsRaw as Array<{ quantity: number; minStock: number }>).filter(p => p.quantity > 0 && p.quantity <= p.minStock).length
    const outOfStockProducts = (lowStockProductsRaw as Array<{ quantity: number; minStock: number }>).filter(p => p.quantity === 0).length

    // ─── Top products (from POS SaleItems only — manual entries don't have product breakdown) ───
    const topProducts = await db.saleItem.groupBy({
      by: ['productId'],
      _sum: { quantity: true, total: true },
      orderBy: { _sum: { total: 'desc' } },
      take: 5,
    })

    const topProductIds = topProducts.map(item => item.productId)
    const topProductsData = await db.product.findMany({
      where: { id: { in: topProductIds } },
      select: { id: true, name: true, category: { select: { name: true } } },
    })
    const topProductsWithName = topProducts.map(item => ({
      ...item,
      product: topProductsData.find(p => p.id === item.productId) || null,
    }))

    // ─── Daily sales last 7 days (POS sales + manual entries combined) ───
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
    sevenDaysAgo.setHours(0, 0, 0, 0)

    // Fetch POS sales for last 7 days
    const posRecentSalesData = await db.sale.findMany({
      where: { createdAt: { gte: sevenDaysAgo } },
      select: { createdAt: true, total: true },
    })

    // Fetch manual entries for last 7 days
    const manualRecentEntries = await db.salesEntry.findMany({
      where: { source: 'manual', date: { gte: sevenDaysAgo } },
      select: { date: true, amount: true },
    })

    // Build daily sales map combining both sources
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
