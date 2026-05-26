'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAppStore, DataChangeEvent } from '@/store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts'
import { BarChart3, ShoppingCart, Package, TrendingUp, ArrowRight, CreditCard, RefreshCw } from 'lucide-react'

interface ReportData {
  period: string
  startDate: string
  endDate: string
  summary: {
    totalSales: number
    totalRevenue: number
    totalDiscount: number
    totalItemsSold: number
    averageSale: number
  }
  dailySales: { date: string; total: number }[]
  topProducts: any[]
  paymentMethodBreakdown: { method: string; total: number; count: number }[]
  categoryBreakdown: any[]
}

const COLORS = ['#92400e', '#b45309', '#d97706', '#f59e0b', '#78350f', '#a16207', '#ca8a04', '#854d0e']
const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash',
  mpesa: 'M-Pesa',
  card: 'Card',
  bank_transfer: 'Bank Transfer',
}

// All events that should trigger a Reports refresh
const REPORTS_REFRESH_EVENTS: DataChangeEvent[] = [
  'sale-created',
  'sale-deleted',
  'product-created',
  'product-updated',
  'product-deleted',
  'inventory-changed',
  'category-changed',
  'manual-entry-created',
]

export function Reports() {
  const authFetch = useAppStore((s) => s.authFetch)
  const setCurrentPage = useAppStore((s) => s.setCurrentPage)
  const onDataChange = useAppStore((s) => s.onDataChange)
  const [data, setData] = useState<ReportData | null>(null)
  const [period, setPeriod] = useState('month')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchReport = useCallback(async (showRefresh = false) => {
    try {
      if (showRefresh) setRefreshing(true)
      const res = await authFetch(`/api/reports?period=${period}`)
      if (res.ok) {
        const reportData = await res.json()
        setData(reportData)
      }
    } catch (error) {
      console.error('Fetch report error:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [authFetch, period])

  useEffect(() => {
    fetchReport()
  }, [fetchReport])

  // Refresh data when tab becomes visible (covers SPA navigation)
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') fetchReport()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [fetchReport])

  // Subscribe to cross-module data changes for instant refresh
  useEffect(() => {
    const unsubscribe = onDataChange((event: DataChangeEvent) => {
      if (REPORTS_REFRESH_EVENTS.includes(event)) {
        fetchReport()
      }
    })
    return unsubscribe
  }, [onDataChange, fetchReport])

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6"><div className="h-16 bg-muted rounded" /></CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="max-w-md mx-auto space-y-4">
            <div className="p-4 bg-amber-50 dark:bg-amber-950/30 rounded-full w-fit mx-auto">
              <BarChart3 className="h-10 w-10 text-amber-700" />
            </div>
            <h3 className="text-lg font-semibold">Failed to Load Reports</h3>
            <p className="text-sm text-muted-foreground">There was an error loading report data. Please try again.</p>
            <Button variant="outline" onClick={() => fetchReport(true)}>
              <RefreshCw className="h-4 w-4 mr-2" /> Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  const { summary, dailySales, topProducts, paymentMethodBreakdown, categoryBreakdown } = data
  const hasSalesData = summary.totalSales > 0
  const hasProductData = categoryBreakdown.some((c: any) => (c._count?.products || 0) > 0)

  // Pie chart data for payment methods
  const paymentPieData = paymentMethodBreakdown.map(p => ({
    name: PAYMENT_LABELS[p.method] || p.method,
    value: p.count,
    total: p.total,
  }))

  // Category bar chart data
  const categoryChartData = categoryBreakdown
    .map((c: any) => ({ name: c.name, products: c._count?.products || 0 }))
    .filter((c: any) => c.products > 0)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Reports</h2>
        <div className="flex gap-2 items-center">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="year">This Year</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => fetchReport(true)} disabled={refreshing} title="Refresh">
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Empty State - No Data at All */}
      {!hasSalesData && !hasProductData && (
        <Card>
          <CardContent className="p-8 text-center">
            <div className="max-w-md mx-auto space-y-4">
              <div className="p-4 bg-amber-50 dark:bg-amber-950/30 rounded-full w-fit mx-auto">
                <BarChart3 className="h-10 w-10 text-amber-700" />
              </div>
              <h3 className="text-lg font-semibold">No Reports Available</h3>
              <p className="text-sm text-muted-foreground">
                Reports are generated from your actual sales and inventory data. Start by adding products and making sales to see your business analytics here.
              </p>
              <div className="flex gap-2 justify-center">
                <Button variant="outline" onClick={() => setCurrentPage('inventory')}>
                  <Package className="h-4 w-4 mr-2" /> Add Products
                </Button>
                <Button className="bg-amber-800 hover:bg-amber-900 text-white" onClick={() => setCurrentPage('sales-pos')}>
                  <ShoppingCart className="h-4 w-4 mr-2" /> Make a Sale
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      {(hasSalesData || hasProductData) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Total Revenue</p>
              <p className="text-2xl font-bold">KES {summary.totalRevenue.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Total Sales</p>
              <p className="text-2xl font-bold">{summary.totalSales}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Items Sold</p>
              <p className="text-2xl font-bold">{summary.totalItemsSold}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Average Sale</p>
              <p className="text-2xl font-bold">KES {summary.averageSale.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Charts Row */}
      {(hasSalesData || hasProductData) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Sales Trend */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Sales Trend
                {period === 'week' && ' (This Week)'}
                {period === 'month' && ' (This Month)'}
                {period === 'year' && ' (This Year)'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                {hasSalesData && dailySales.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={dailySales}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: number) => [`KES ${v.toLocaleString()}`, 'Revenue']} />
                      <Line type="monotone" dataKey="total" stroke="#92400e" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <div className="text-center">
                      <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No sales data for this period</p>
                      <p className="text-xs mt-1">Sales trend will appear once you record sales</p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Inventory by Category */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Inventory by Category</CardTitle></CardHeader>
            <CardContent>
              <div className="h-64">
                {hasProductData ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={categoryChartData}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="products" fill="#b45309" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <div className="text-center">
                      <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No inventory data available</p>
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
            <CardHeader className="pb-2"><CardTitle className="text-base">Top Selling Products</CardTitle></CardHeader>
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
                    <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No sales data for this period</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Payment Method Breakdown */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Payment Methods</CardTitle></CardHeader>
            <CardContent>
              <div className="h-64">
                {hasSalesData && paymentPieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={paymentPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={80}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {paymentPieData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number, name: string, props: any) => [`${v} transactions (KES ${(props.payload.total || 0).toLocaleString()})`, name]} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <div className="text-center">
                      <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No payment data for this period</p>
                    </div>
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
