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

    const [
      totalProducts,
      lowStockProductsRaw,
      totalSales,
      monthSales,
      totalRevenue,
      monthRevenue,
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

    // Recent sales
    const recentSales = await db.sale.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { name: true } },
        items: { include: { product: { select: { name: true } } } },
      },
    })

    // Category breakdown
    const categoryBreakdown = await db.category.findMany({
      include: { _count: { select: { products: { where: { active: true } } } } },
    })

    const lowStockProducts = (lowStockProductsRaw as Array<{ quantity: number; minStock: number }>).filter(p => p.quantity > 0 && p.quantity <= p.minStock).length

    // Top products - fetch all at once instead of N+1
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

    // Daily sales last 7 days
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
    sevenDaysAgo.setHours(0, 0, 0, 0)

    const recentSalesData = await db.sale.findMany({
      where: { createdAt: { gte: sevenDaysAgo } },
      select: { createdAt: true, total: true },
    })

    const dailySales: Record<string, number> = {}
    for (let i = 0; i < 7; i++) {
      const d = new Date(sevenDaysAgo)
      d.setDate(d.getDate() + i)
      dailySales[d.toISOString().split('T')[0]] = 0
    }
    for (const sale of recentSalesData) {
      const key = sale.createdAt.toISOString().split('T')[0]
      if (dailySales[key] !== undefined) {
        dailySales[key] += sale.total
      }
    }

    return NextResponse.json({
      stats: {
        totalProducts,
        lowStockProducts,
        totalSales,
        monthSales,
        totalRevenue: totalRevenue._sum.total || 0,
        monthRevenue: monthRevenue._sum.total || 0,
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
