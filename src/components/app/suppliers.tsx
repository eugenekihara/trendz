'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAppStore, DataChangeEvent } from '@/store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { Truck, Plus, Edit2, Trash2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

// Events that should trigger a Suppliers refresh
const SUPPLIER_REFRESH_EVENTS: DataChangeEvent[] = [
  'supplier-changed',
  'settings-changed',
]

export function Suppliers() {
  const authFetch = useAppStore((s) => s.authFetch)
  const notifyDataChange = useAppStore((s) => s.notifyDataChange)
  const onDataChange = useAppStore((s) => s.onDataChange)
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [dialog, setDialog] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '', city: '', country: '', notes: '' })

  const fetchSuppliers = useCallback(async (showRefresh = false) => {
    try {
      if (showRefresh) setRefreshing(true)
      const res = await authFetch('/api/suppliers')
      if (res.ok) setSuppliers(await res.json())
    } catch {
      toast.error('Failed to fetch suppliers')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [authFetch])

  useEffect(() => { fetchSuppliers() }, [fetchSuppliers])

  // Refresh data when tab becomes visible (covers SPA navigation)
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') fetchSuppliers()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [fetchSuppliers])

  // Subscribe to cross-module data changes for instant refresh
  useEffect(() => {
    const unsubscribe = onDataChange((event: DataChangeEvent) => {
      if (SUPPLIER_REFRESH_EVENTS.includes(event)) {
        fetchSuppliers()
      }
    })
    return unsubscribe
  }, [onDataChange, fetchSuppliers])

  const openDialog = (supplier?: any) => {
    if (supplier) {
      setEditing(supplier)
      setForm({ name: supplier.name, email: supplier.email || '', phone: supplier.phone || '', address: supplier.address || '', city: supplier.city || '', country: supplier.country || '', notes: supplier.notes || '' })
    } else {
      setEditing(null)
      setForm({ name: '', email: '', phone: '', address: '', city: '', country: '', notes: '' })
    }
    setDialog(true)
  }

  const save = async () => {
    try {
      const url = editing ? `/api/suppliers/${editing.id}` : '/api/suppliers'
      const method = editing ? 'PUT' : 'POST'
      const res = await authFetch(url, { method, body: JSON.stringify(form) })
      if (!res.ok) { const d = await res.json(); toast.error(d.error); return }
      toast.success(editing ? 'Supplier updated' : 'Supplier created')
      setDialog(false)
      fetchSuppliers()
      // Notify all other modules about supplier change
      notifyDataChange('supplier-changed')
    } catch { toast.error('Failed to save supplier') }
  }

  const remove = async (id: string) => {
    try {
      const res = await authFetch(`/api/suppliers/${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Supplier deleted')
        fetchSuppliers()
        // Notify all other modules about supplier change
        notifyDataChange('supplier-changed')
      } else {
        const d = await res.json()
        toast.error(d.error || 'Failed to delete')
      }
    } catch { toast.error('Failed to delete') }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Suppliers</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => fetchSuppliers(true)} disabled={refreshing} title="Refresh">
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
          <Button onClick={() => openDialog()} className="bg-amber-800 hover:bg-amber-900 text-white">
            <Plus className="h-4 w-4 mr-2" /> Add Supplier
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? <div className="p-8 text-center text-muted-foreground">Loading...</div> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>City</TableHead>
                    <TableHead>Products</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suppliers.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>{s.email || '-'}</TableCell>
                      <TableCell>{s.phone || '-'}</TableCell>
                      <TableCell>{s.city || '-'}</TableCell>
                      <TableCell><Badge variant="outline">{s._count?.products || 0}</Badge></TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openDialog(s)}><Edit2 className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={() => remove(s.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {suppliers.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground"><Truck className="h-8 w-8 mx-auto mb-2 opacity-50" />No suppliers yet</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? 'Edit' : 'Add'} Supplier</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div className="space-y-2"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            </div>
            <div className="space-y-2"><Label>Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>City</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
              <div className="space-y-2"><Label>Country</Label><Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></div>
            </div>
            <div className="space-y-2"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)}>Cancel</Button>
            <Button onClick={save} className="bg-amber-800 hover:bg-amber-900 text-white">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
