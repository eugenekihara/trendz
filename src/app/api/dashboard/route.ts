import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyAuth } from '@/lib/auth'

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
      lowStockProducts,
      totalSales,
      monthSales,
      totalRevenue,
      monthRevenue,
      totalCategories,
      totalSuppliers,
      totalUsers,
    ] = await Promise.all([
      db.product.count({ where: { active: true } }),
      db.product.count({ where: { active: true, quantity: { lte: 5 } } }),
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

    // Top products
    const topProducts = await db.saleItem.groupBy({
      by: ['productId'],
      _sum: { quantity: true, total: true },
      orderBy: { _sum: { total: 'desc' } },
      take: 5,
    })

    const topProductsWithName = await Promise.all(
      topProducts.map(async (item) => {
        const product = await db.product.findUnique({
          where: { id: item.productId },
          select: { name: true, category: { select: { name: true } } },
        })
        return { ...item, product }
      })
    )

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
    })
  } catch (error) {
    console.error('Dashboard GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch dashboard' }, { status: 500 })
  }
}
