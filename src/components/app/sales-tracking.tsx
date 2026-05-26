'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAppStore, DataChangeEvent } from '@/store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { TrendingUp, Plus, Calendar, ShoppingCart, ArrowRight, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

// All events that should trigger a Sales Tracking refresh
const SALES_TRACKING_EVENTS: DataChangeEvent[] = [
  'sale-created',
  'sale-deleted',
  'product-updated',     // product name changes could affect display
  'product-deleted',
  'inventory-changed',   // stock changes could affect context
  'manual-entry-created',
  'settings-changed',    // currency/format changes
]

export function SalesTracking() {
  const user = useAppStore((s) => s.user)
  const authFetch = useAppStore((s) => s.authFetch)
  const setCurrentPage = useAppStore((s) => s.setCurrentPage)
  const notifyDataChange = useAppStore((s) => s.notifyDataChange)
  const onDataChange = useAppStore((s) => s.onDataChange)
  const [entries, setEntries] = useState<any[]>([])
  const [summary, setSummary] = useState({ totalAmount: 0, totalQuantity: 0, totalEntries: 0, posAmount: 0, posCount: 0, manualAmount: 0, manualCount: 0 })
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [addDialog, setAddDialog] = useState(false)
  const [deleteDialog, setDeleteDialog] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<any>(null)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [form, setForm] = useState({ productName: '', quantity: '', amount: '', date: '' })

  const fetchEntries = useCallback(async (showRefresh = false) => {
    try {
      if (showRefresh) setRefreshing(true)
      const params = new URLSearchParams()
      if (startDate) params.set('startDate', startDate)
      if (endDate) params.set('endDate', endDate)
      params.set('limit', '50')
      const res = await authFetch(`/api/sales-tracking?${params}`)
      if (res.ok) {
        const data = await res.json()
        setEntries(data.entries)
        // Use server-computed summary (not affected by pagination)
        if (data.summary) {
          setSummary(data.summary)
        }
      }
    } catch (error) {
      console.error('Fetch entries error:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [authFetch, startDate, endDate])

  useEffect(() => {
    fetchEntries()
  }, [fetchEntries])

  // Refresh data when tab becomes visible (covers SPA navigation)
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') fetchEntries()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [fetchEntries])

  // Subscribe to cross-module data changes for instant refresh
  useEffect(() => {
    const unsubscribe = onDataChange((event: DataChangeEvent) => {
      if (SALES_TRACKING_EVENTS.includes(event)) {
        fetchEntries()
      }
    })
    return unsubscribe
  }, [onDataChange, fetchEntries])

  const addEntry = async () => {
    try {
      const res = await authFetch('/api/sales-tracking', {
        method: 'POST',
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error)
        return
      }
      toast.success('Entry added')
      setAddDialog(false)
      setForm({ productName: '', quantity: '', amount: '', date: '' })
      fetchEntries()
      // Notify all other modules about the new manual entry
      // This is critical — Dashboard and Reports must refresh to include this manual entry
      notifyDataChange('manual-entry-created')
    } catch {
      toast.error('Failed to add entry')
    }
  }

  const deleteEntry = async () => {
    if (!deleteTarget) return
    try {
      if (deleteTarget.source === 'manual') {
        // Delete manual entry through sales-tracking API
        const res = await authFetch(`/api/sales-tracking/${deleteTarget.id}`, { method: 'DELETE' })
        if (!res.ok) {
          const data = await res.json()
          toast.error(data.error || 'Failed to delete entry')
          return
        }
        toast.success('Entry deleted')
      } else if (deleteTarget.source === 'pos' && deleteTarget.saleId) {
        // Delete POS sale through sales API (restores inventory)
        const res = await authFetch(`/api/sales/${deleteTarget.saleId}`, { method: 'DELETE' })
        if (!res.ok) {
          const data = await res.json()
          toast.error(data.error || 'Failed to delete sale')
          return
        }
        toast.success('Sale deleted and stock restored')
      }
      setDeleteDialog(false)
      setDeleteTarget(null)
      fetchEntries()
      // Notify all other modules about the deletion
      // sale-deleted covers inventory restore, dashboard, and reports refresh
      notifyDataChange('sale-deleted')
    } catch {
      toast.error('Failed to delete')
    }
  }

  const openDeleteDialog = (entry: any) => {
    setDeleteTarget(entry)
    setDeleteDialog(true)
  }

  return (
    <div className="space-y-4">
      {/* Summary — uses server-computed totals, not affected by pagination */}
      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total Amount</p>
            <p className="text-2xl font-bold">KES {summary.totalAmount.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total Entries</p>
            <p className="text-2xl font-bold">{summary.totalEntries}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total Quantity</p>
            <p className="text-2xl font-bold">{summary.totalQuantity}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground text-amber-700">POS Sales</p>
            <p className="text-xl font-bold">KES {summary.posAmount.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">{summary.posCount} entries</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground text-orange-600">Manual Entries</p>
            <p className="text-xl font-bold">KES {summary.manualAmount.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">{summary.manualCount} entries</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9 text-sm w-40" />
          <span className="text-sm text-muted-foreground">to</span>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9 text-sm w-40" />
        </div>
        <Button variant="outline" size="sm" onClick={() => { setStartDate(''); setEndDate('') }}>Clear</Button>
        <Button variant="outline" size="icon" onClick={() => fetchEntries(true)} disabled={refreshing} title="Refresh">
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        </Button>
        <div className="flex-1" />
        {user?.role === 'admin' && (
          <Button onClick={() => setAddDialog(true)} className="bg-amber-800 hover:bg-amber-900 text-white">
            <Plus className="h-4 w-4 mr-2" /> Manual Entry
          </Button>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : entries.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <ShoppingCart className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p className="font-medium">No sales recorded yet</p>
              <p className="text-sm mt-1">Sales entries will appear here once you complete a sale through POS or add a manual entry.</p>
              <Button
                variant="outline"
                className="mt-3"
                onClick={() => setCurrentPage('sales-pos')}
              >
                <ShoppingCart className="h-4 w-4 mr-2" />
                Go to Sales POS <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Salesperson</TableHead>
                    <TableHead>Date</TableHead>
                    {user?.role === 'admin' && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-medium">{entry.productName}</TableCell>
                      <TableCell className="text-right">{entry.quantity}</TableCell>
                      <TableCell className="text-right">KES {entry.amount.toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`capitalize text-xs ${
                            entry.source === 'pos'
                              ? 'border-amber-300 text-amber-800 dark:text-amber-300'
                              : 'border-orange-300 text-orange-700 dark:text-orange-300'
                          }`}
                        >
                          {entry.source}
                        </Badge>
                      </TableCell>
                      <TableCell>{entry.user?.name || '-'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{new Date(entry.date).toLocaleDateString()}</TableCell>
                      {user?.role === 'admin' && (
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-500 hover:text-red-700"
                            onClick={() => openDeleteDialog(entry)}
                            title={entry.source === 'manual' ? 'Delete manual entry' : 'Delete sale (restores stock)'}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Manual Entry Dialog */}
      <Dialog open={addDialog} onOpenChange={setAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Manual Sales Entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Product Name *</Label>
              <Input value={form.productName} onChange={(e) => setForm({ ...form, productName: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Quantity *</Label>
                <Input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Amount (KES) *</Label>
                <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialog(false)}>Cancel</Button>
            <Button onClick={addEntry} className="bg-amber-800 hover:bg-amber-900 text-white">Add Entry</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialog} onOpenChange={setDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
          </DialogHeader>
          {deleteTarget && (
            <div className="space-y-3">
              <p className="text-sm">
                {deleteTarget.source === 'manual' ? (
                  <>Are you sure you want to delete this manual entry? This will remove it from all sales totals and reports.</>
                ) : (
                  <>This will delete the entire sale and <strong>restore all product stock</strong> that was deducted. All items in this sale will be removed from sales tracking, dashboard totals, and reports.</>
                )}
              </p>
              <div className="p-3 bg-muted rounded-lg text-sm">
                <p><strong>Product:</strong> {deleteTarget.productName}</p>
                <p><strong>Quantity:</strong> {deleteTarget.quantity}</p>
                <p><strong>Amount:</strong> KES {deleteTarget.amount?.toLocaleString()}</p>
                <p><strong>Source:</strong> <span className="capitalize">{deleteTarget.source}</span></p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteDialog(false); setDeleteTarget(null) }}>Cancel</Button>
            <Button variant="destructive" onClick={deleteEntry}>
              <Trash2 className="h-4 w-4 mr-2" />
              {deleteTarget?.source === 'manual' ? 'Delete Entry' : 'Delete Sale & Restore Stock'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
