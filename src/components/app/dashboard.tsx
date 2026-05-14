'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '@/store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TrendingUp, Package, ShoppingCart, AlertTriangle, Truck, Users } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

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

const COLORS = ['#9333ea', '#e11d48', '#f97316', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6']

export function Dashboard() {
  const authFetch = useAppStore((s) => s.authFetch)
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

  const statCards = [
    { title: 'Total Revenue', value: `KES ${stats.totalRevenue.toLocaleString()}`, sub: `KES ${stats.monthRevenue.toLocaleString()} this month`, icon: TrendingUp, color: 'text-green-600' },
    { title: 'Total Sales', value: stats.totalSales, sub: `${stats.monthSales} this month`, icon: ShoppingCart, color: 'text-purple-600' },
    { title: 'Products', value: stats.totalProducts, sub: `${stats.lowStockProducts} low stock`, icon: Package, color: 'text-blue-600' },
    { title: 'Categories', value: stats.totalCategories, sub: `${stats.totalSuppliers} suppliers`, icon: Truck, color: 'text-orange-600' },
  ]

  const pieData = categoryBreakdown.map((c: any) => ({
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

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Daily Sales Chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Daily Sales (Last 7 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailySales}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value: number) => [`KES ${value.toLocaleString()}`, 'Sales']} />
                  <Bar dataKey="total" fill="#9333ea" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
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
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Products */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top Products</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topProducts.map((item: any, i: number) => (
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
              ))}
              {topProducts.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No sales data yet</p>}
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
              {recentSales.map((sale: any) => (
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
              ))}
              {recentSales.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No sales yet</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
