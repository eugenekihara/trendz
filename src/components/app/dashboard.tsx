'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAppStore, DataChangeEvent } from '@/store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TrendingUp, Package, ShoppingCart, Truck, BarChart3, ShoppingBag, ArrowRight, CreditCard, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

interface DashboardData {
  stats: {
    totalProducts: number
    lowStockProducts: number
    outOfStockProducts: number
    totalSales: number
    monthSales: number
    totalRevenue: number
    monthRevenue: number
    totalCategories: number
    totalSuppliers: number
    totalUsers: number
  }
  credit: {
    totalOrders: number
    totalCreditAmount: number
    totalOutstanding: number
    totalPaid: number
    paidOrders: number
    outstandingOrders: number
    overdueOrders: number
    monthOrders: number
  } | null
  recentSales: Array<{
    id: string
    type: 'pos' | 'manual' | 'credit'
    label: string
    total: number
    paymentMethod: string
    user: { name: string } | null
    date: string
    itemCount: number
  }>
  categoryBreakdown: any[]
  topProducts: any[]
  dailySales: { date: string; total: number }[]
}

const COLORS = ['#92400e', '#b45309', '#d97706', '#f59e0b', '#78350f', '#a16207', '#ca8a04', '#854d0e']

// All events that should trigger a Dashboard refresh
const DASHBOARD_EVENTS: DataChangeEvent[] = [
  'sale-created',
  'sale-deleted',
  'product-created',
  'product-updated',
  'product-deleted',
  'inventory-changed',
  'category-changed',
  'manual-entry-created',
  'supplier-changed',
  'settings-changed',
  'user-changed',
  'credit-changed',
]

// Safe number formatter — never crashes on null/undefined
function safeNum(val: any, fallback = 0): number {
  const n = Number(val)
  return isNaN(n) ? fallback : n
}

function safeLocaleString(val: any, fallback = '0'): string {
  const n = safeNum(val, -1)
  return n === -1 ? fallback : n.toLocaleString()
}

export function Dashboard() {
  const authFetch = useAppStore((s) => s.authFetch)
  const setCurrentPage = useAppStore((s) => s.setCurrentPage)
  const onDataChange = useAppStore((s) => s.onDataChange)
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const fetchDashboard = useCallback(async (showRefresh = false) => {
    try {
      if (showRefresh) setRefreshing(true)
      setError(null)
      const res = await authFetch('/api/dashboard')
      if (res.ok) {
        const json = await res.json()
        // Validate minimum structure to prevent rendering crashes
        if (json && json.stats) {
          setData(json)
        } else {
          setError('Received invalid data from server')
        }
      } else {
        const errBody = await res.json().catch(() => null)
        setError(errBody?.error || `Failed to load dashboard (${res.status})`)
      }
    } catch (err) {
      console.error('Dashboard fetch error:', err)
      setError('Network error — please check your connection')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [authFetch])

  useEffect(() => {
    fetchDashboard()
  }, [fetchDashboard])

  // Refresh data when tab becomes visible
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
      if (DASHBOARD_EVENTS.includes(event)) {
        fetchDashboard()
      }
    })
    return unsubscribe
  }, [onDataChange, fetchDashboard])

  // Loading skeleton
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-20 bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2 animate-pulse"><CardContent className="p-6"><div className="h-64 bg-muted rounded" /></CardContent></Card>
          <Card className="animate-pulse"><CardContent className="p-6"><div className="h-64 bg-muted rounded" /></CardContent></Card>
        </div>
      </div>
    )
  }

  // Error state with retry
  if (error && !data) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="max-w-md mx-auto space-y-4">
            <div className="p-4 bg-red-50 dark:bg-red-950/30 rounded-full w-fit mx-auto">
              <AlertTriangle className="h-10 w-10 text-red-600" />
            </div>
            <h3 className="text-lg font-semibold">Failed to Load Dashboard</h3>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" onClick={() => fetchDashboard(true)}>
              <RefreshCw className="h-4 w-4 mr-2" /> Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Fallback if data is somehow still null (shouldn't happen with above checks)
  if (!data) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="max-w-md mx-auto space-y-4">
            <div className="p-4 bg-amber-50 dark:bg-amber-950/30 rounded-full w-fit mx-auto">
              <BarChart3 className="h-10 w-10 text-amber-700" />
            </div>
            <h3 className="text-lg font-semibold">Welcome to Your Dashboard</h3>
            <p className="text-sm text-muted-foreground">
              Your dashboard will come alive as you start adding products and making sales.
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
    )
  }

  const { stats, credit, recentSales, categoryBreakdown, topProducts, dailySales } = data

  const hasSalesData = safeNum(stats?.totalSales) > 0
  const hasProductData = safeNum(stats?.totalProducts) > 0

  const statCards = [
    { title: 'Total Revenue', value: `KES ${safeLocaleString(stats?.totalRevenue)}`, sub: `KES ${safeLocaleString(stats?.monthRevenue)} this month`, icon: TrendingUp, color: 'text-green-600' },
    { title: 'Total Sales', value: safeNum(stats?.totalSales), sub: `${safeNum(stats?.monthSales)} this month`, icon: ShoppingCart, color: 'text-amber-700' },
    { title: 'Products', value: safeNum(stats?.totalProducts), sub: `${safeNum(stats?.lowStockProducts)} low, ${safeNum(stats?.outOfStockProducts)} out`, icon: Package, color: 'text-blue-600' },
    { title: 'Categories', value: safeNum(stats?.totalCategories), sub: `${safeNum(stats?.totalSuppliers)} suppliers`, icon: Truck, color: 'text-orange-600' },
  ]

  const creditCards = (credit && safeNum(credit.totalOrders) > 0) ? [
    { title: 'Outstanding Credit', value: `KES ${safeLocaleString(credit?.totalOutstanding)}`, sub: `${safeNum(credit?.outstandingOrders)} orders pending`, icon: CreditCard, color: 'text-red-600' },
    { title: 'Credit Paid', value: `${safeNum(credit?.paidOrders)}`, sub: `KES ${safeLocaleString(credit?.totalPaid)} collected`, icon: CheckCircle2, color: 'text-green-600' },
    { title: 'Overdue', value: `${safeNum(credit?.overdueOrders)}`, sub: `${safeNum(credit?.monthOrders)} new this month`, icon: AlertTriangle, color: 'text-orange-600' },
  ] : []

  const pieData = (categoryBreakdown || [])
    .filter((c: any) => (c._count?.products || 0) > 0)
    .map((c: any) => ({
      name: c.name || 'Unknown',
      value: c._count?.products || 0,
    }))

  return (
    <div className="space-y-6">
      {/* Refresh indicator */}
      {refreshing && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="h-3 w-3 animate-spin" /> Refreshing...
        </div>
      )}

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

      {/* Credit Summary Cards */}
      {creditCards.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {creditCards.map((card) => (
            <Card key={card.title} className="border-l-4 border-l-amber-500">
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
      )}

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
                {hasSalesData && (dailySales || []).some(d => safeNum(d?.total) > 0) ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dailySales || []}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(value: number) => [`KES ${safeLocaleString(value)}`, 'Sales']} />
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
                {(topProducts || []).length > 0 ? (
                  (topProducts || []).map((item: any, i: number) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-muted-foreground w-6">{i + 1}.</span>
                        <div>
                          <p className="text-sm font-medium">{item.product?.name || 'Unknown'}</p>
                          <p className="text-xs text-muted-foreground">{item.product?.category?.name || ''}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">KES {safeLocaleString(item._sum?.total)}</p>
                        <p className="text-xs text-muted-foreground">{safeNum(item._sum?.quantity)} sold</p>
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
                {(recentSales || []).length > 0 ? (
                  (recentSales || []).map((sale) => (
                    <div key={sale.id} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{sale.label || 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground">
                          {sale.user?.name || '-'} · {sale.date ? new Date(sale.date).toLocaleDateString() : '-'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">KES {safeLocaleString(sale.total)}</p>
                        <Badge
                          variant="outline"
                          className={`text-xs capitalize ${
                            sale.type === 'manual'
                              ? 'border-orange-300 text-orange-700 dark:text-orange-300'
                              : sale.type === 'credit'
                              ? 'border-purple-300 text-purple-700 dark:text-purple-300'
                              : 'border-amber-300 text-amber-800 dark:text-amber-300'
                          }`}
                        >
                          {sale.type === 'manual' ? 'Manual' : sale.type === 'credit' ? 'Credit' : (sale.paymentMethod || 'POS')}
                        </Badge>
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

      {/* Error banner at bottom if partial data loaded */}
      {error && data && (
        <div className="text-center text-xs text-muted-foreground">
          Some data may be outdated. <Button variant="link" className="text-xs h-auto p-0" onClick={() => fetchDashboard(true)}>Refresh</Button>
        </div>
      )}
    </div>
  )
}
