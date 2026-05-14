'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '@/store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts'
import { BarChart3 } from 'lucide-react'

export function Reports() {
  const authFetch = useAppStore((s) => s.authFetch)
  const [salesData, setSalesData] = useState<any[]>([])
  const [inventoryData, setInventoryData] = useState<any[]>([])
  const [period, setPeriod] = useState('month')
  const [loading, setLoading] = useState(true)

  const fetchReportData = useCallback(async () => {
    try {
      const [salesRes, catRes] = await Promise.all([
        authFetch('/api/sales-tracking?limit=100'),
        authFetch('/api/categories'),
      ])

      if (salesRes.ok) {
        const data = await salesRes.json()
        setSalesData(data.entries || [])
      }
      if (catRes.ok) {
        setInventoryData(await catRes.json())
      }
    } catch {} finally {
      setLoading(false)
    }
  }, [authFetch])

  useEffect(() => { fetchReportData() }, [fetchReportData])

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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Total Revenue</p><p className="text-2xl font-bold">KES {totalRevenue.toLocaleString()}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Total Sales</p><p className="text-2xl font-bold">{salesData.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Average Sale</p><p className="text-2xl font-bold">KES {avgSale.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p></CardContent></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Sales Trend</CardTitle></CardHeader>
          <CardContent>
            <div className="h-64">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => [`KES ${v.toLocaleString()}`, 'Sales']} />
                    <Line type="monotone" dataKey="total" stroke="#9333ea" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <div className="text-center"><BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" /><p>No data available</p></div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Inventory by Category</CardTitle></CardHeader>
          <CardContent>
            <div className="h-64">
              {inventoryData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={inventoryData.map((c: any) => ({ name: c.name, products: c._count?.products || 0 }))}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="products" fill="#e11d48" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">No data</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
