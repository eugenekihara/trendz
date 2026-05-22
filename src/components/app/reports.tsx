'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '@/store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts'
import { BarChart3, ShoppingCart, Package, ArrowRight } from 'lucide-react'

export function Reports() {
  const authFetch = useAppStore((s) => s.authFetch)
  const setCurrentPage = useAppStore((s) => s.setCurrentPage)
  const [salesData, setSalesData] = useState<any[]>([])
  const [inventoryData, setInventoryData] = useState<any[]>([])
  const [period, setPeriod] = useState('month')
  const [loading, setLoading] = useState(true)

  const fetchSalesData = useCallback(async () => {
    try {
      const res = await authFetch('/api/sales-tracking?limit=100')
      if (res.ok) {
        const data = await res.json()
        setSalesData(data.entries || [])
      }
    } catch (error) {
      console.error('Fetch sales data error:', error)
    }
  }, [authFetch])

  const fetchInventoryData = useCallback(async () => {
    try {
      const res = await authFetch('/api/categories')
      if (res.ok) setInventoryData(await res.json())
    } catch (error) {
      console.error('Fetch inventory data error:', error)
    } finally {
      setLoading(false)
    }
  }, [authFetch])

  useEffect(() => {
    fetchSalesData()
    fetchInventoryData()
  }, [fetchSalesData, fetchInventoryData])

  // Refresh data when tab becomes visible (covers SPA navigation)
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchSalesData()
        fetchInventoryData()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [fetchSalesData, fetchInventoryData])

  // Aggregate sales by date
  const salesByDate: Record<string, number> = {}
  salesData.forEach((s) => {
    const date = new Date(s.date).toISOString().split('T')[0]
    salesByDate[date] = (salesByDate[date] || 0) + s.amount
  })
  const chartData = Object.entries(salesByDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, total]) => ({ date, total }))

  const totalRevenue = salesData.reduce((s, e) => s + e.amount, 0)
  const avgSale = salesData.length > 0 ? totalRevenue / salesData.length : 0

  const hasSalesData = salesData.length > 0
  const hasInventoryData = inventoryData.some((c: any) => (c._count?.products || 0) > 0)

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

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Reports</h2>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="week">This Week</SelectItem>
            <SelectItem value="month">This Month</SelectItem>
            <SelectItem value="year">This Year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Empty State - No Data */}
      {!hasSalesData && !hasInventoryData && (
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

      {/* Stats Cards - only show when there's data */}
      {(hasSalesData || hasInventoryData) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Total Revenue</p><p className="text-2xl font-bold">KES {totalRevenue.toLocaleString()}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Total Sales</p><p className="text-2xl font-bold">{salesData.length}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Average Sale</p><p className="text-2xl font-bold">KES {avgSale.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p></CardContent></Card>
        </div>
      )}

      {/* Charts */}
      {(hasSalesData || hasInventoryData) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Sales Trend</CardTitle></CardHeader>
            <CardContent>
              <div className="h-64">
                {hasSalesData && chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: number) => [`KES ${v.toLocaleString()}`, 'Sales']} />
                      <Line type="monotone" dataKey="total" stroke="#92400e" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <div className="text-center">
                      <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No sales data available</p>
                      <p className="text-xs mt-1">Sales trend will appear once you record sales</p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Inventory by Category</CardTitle></CardHeader>
            <CardContent>
              <div className="h-64">
                {hasInventoryData ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={inventoryData.map((c: any) => ({ name: c.name, products: c._count?.products || 0 })).filter((c: any) => c.products > 0)}>
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
    </div>
  )
}
