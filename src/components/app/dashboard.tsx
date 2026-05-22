'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAppStore, DataChangeEvent } from '@/store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TrendingUp, Package, ShoppingCart, Truck, BarChart3, ShoppingBag, ArrowRight } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { Button } from '@/components/ui/button'

interface DashboardData {
  stats: {
    totalProducts: number
    lowStockProducts: number
    totalSales: number
    monthSales: number
    totalRevenue: number
    monthRevenue: number
    totalCategories: number
    totalSuppliers: number
    totalUsers: number
  }
  recentSales: any[]
  categoryBreakdown: any[]
  topProducts: any[]
  dailySales: { date: string; total: number }[]
}

const COLORS = ['#92400e', '#b45309', '#d97706', '#f59e0b', '#78350f', '#a16207', '#ca8a04', '#854d0e']

export function Dashboard() {
  const authFetch = useAppStore((s) => s.authFetch)
  const setCurrentPage = useAppStore((s) => s.setCurrentPage)
  const onDataChange = useAppStore((s) => s.onDataChange)
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await authFetch('/api/dashboard')
      if (res.ok) {
        setData(await res.json())
      }
    } catch (error) {
      console.error('Dashboard fetch error:', error)
    } finally {
      setLoading(false)
    }
  }, [authFetch])

  useEffect(() => {
    fetchDashboard()
  }, [fetchDashboard])

  // Refresh data when tab becomes visible (covers SPA navigation)
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') fetchDashboard()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [fetchDashboard])

  // Subscribe to cross-module data changes for instant refresh
  useEffect(() => {
    const unsubscribe = onDataChange((event: DataChangeEvent) => {
      // Refresh dashboard whenever any relevant data changes
      if (
        event === 'sale-created' ||
        event === 'sale-deleted' ||
        event === 'product-created' ||
        event === 'product-updated' ||
        event === 'product-deleted' ||
        event === 'inventory-changed' ||
        event === 'category-changed' ||
        event === 'manual-entry-created'
      ) {
        fetchDashboard()
      }
    })
    return unsubscribe
  }, [onDataChange, fetchDashboard])

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="h-20 bg-muted rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (!data) return <div className="text-center text-muted-foreground">Failed to load dashboard</div>

  const { stats, recentSales, categoryBreakdown, topProducts, dailySales } = data

  const hasSalesData = stats.totalSales > 0
  const hasProductData = stats.totalProducts > 0

  const statCards = [
    { title: 'Total Revenue', value: `KES ${stats.totalRevenue.toLocaleString()}`, sub: `KES ${stats.monthRevenue.toLocaleString()} this month`, icon: TrendingUp, color: 'text-green-600' },
    { title: 'Total Sales', value: stats.totalSales, sub: `${stats.monthSales} this month`, icon: ShoppingCart, color: 'text-amber-700' },
    { title: 'Products', value: stats.totalProducts, sub: `${stats.lowStockProducts} low stock`, icon: Package, color: 'text-blue-600' },
    { title: 'Categories', value: stats.totalCategories, sub: `${stats.totalSuppliers} suppliers`, icon: Truck, color: 'text-orange-600' },
  ]

  const pieData = categoryBreakdown
    .filter((c: any) => (c._count?.products || 0) > 0)
    .map((c: any) => ({
      name: c.name,
      value: c._count.products,
    }))

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <Card key={card.title}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{card.title}</p>
                  <p className="text-2xl font-bold mt-1">{card.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>
                </div>
                <card.icon className={`h-8 w-8 ${card.color} opacity-80`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Empty State - No Data at All */}
      {!hasSalesData && !hasProductData && (
        <Card>
          <CardContent className="p-8 text-center">
            <div className="max-w-md mx-auto space-y-4">
              <div className="p-4 bg-amber-50 dark:bg-amber-950/30 rounded-full w-fit mx-auto">
                <BarChart3 className="h-10 w-10 text-amber-700" />
              </div>
              <h3 className="text-lg font-semibold">Welcome to Your Dashboard</h3>
              <p className="text-sm text-muted-foreground">
                Your dashboard will come alive as you start adding products and making sales.
                Get started by adding your first product to inventory.
              </p>
              <Button
                onClick={() => setCurrentPage('inventory')}
                className="bg-amber-800 hover:bg-amber-900 text-white"
              >
                <Package className="h-4 w-4 mr-2" />
                Add Your First Product
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts Row */}
      {(hasSalesData || hasProductData) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Daily Sales Chart */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Daily Sales (Last 7 Days)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                {hasSalesData && dailySales.some(d => d.total > 0) ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dailySales}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(value: number) => [`KES ${value.toLocaleString()}`, 'Sales']} />
                      <Bar dataKey="total" fill="#92400e" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <div className="text-center">
                      <ShoppingBag className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No sales recorded yet</p>
                      <p className="text-xs mt-1">Sales data will appear here once you make your first sale</p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Category Breakdown */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Products by Category</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                {pieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                        {pieData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <div className="text-center">
                      <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No inventory added yet</p>
                      <p className="text-xs mt-1">Add products to see category distribution</p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Bottom Row */}
      {(hasSalesData || hasProductData) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Top Products */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Top Products</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {topProducts.length > 0 ? (
                  topProducts.map((item: any, i: number) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-muted-foreground w-6">{i + 1}.</span>
                        <div>
                          <p className="text-sm font-medium">{item.product?.name || 'Unknown'}</p>
                          <p className="text-xs text-muted-foreground">{item.product?.category?.name || ''}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">KES {(item._sum.total || 0).toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">{item._sum.quantity || 0} sold</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-4 text-muted-foreground">
                    <ShoppingBag className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No sales data yet</p>
                    <p className="text-xs mt-1">Top selling products will appear here</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Recent Sales */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Recent Sales</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recentSales.length > 0 ? (
                  recentSales.map((sale: any) => (
                    <div key={sale.id} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{sale.invoiceNumber}</p>
                        <p className="text-xs text-muted-foreground">
                          {sale.user?.name} · {new Date(sale.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">KES {sale.total.toLocaleString()}</p>
                        <Badge variant="outline" className="text-xs capitalize">{sale.paymentMethod}</Badge>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-4 text-muted-foreground">
                    <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No sales recorded yet</p>
                    <p className="text-xs mt-1">Recent transactions will appear here</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
