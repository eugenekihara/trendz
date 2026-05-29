'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAppStore, DataChangeEvent } from '@/store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  CreditCard,
  Plus,
  Search,
  RefreshCw,
  Trash2,
  Eye,
  DollarSign,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Wallet,
  ChevronDown,
  ChevronUp,
  User,
} from 'lucide-react'
import { toast } from 'sonner'

function safeNum(val: any, fallback = 0): number {
  if (val === null || val === undefined) return fallback
  const n = Number(val)
  return isNaN(n) ? fallback : n
}

function safeLocaleString(val: any, fallback = '0'): string {
  const n = safeNum(val, -1)
  return n === -1 ? fallback : n.toLocaleString()
}

// All events that should trigger a Credit Management refresh
const CREDIT_EVENTS: DataChangeEvent[] = [
  'credit-changed',
  'sale-created',
  'sale-deleted',
  'product-updated',
  'product-deleted',
  'inventory-changed',
  'settings-changed',
]

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  unpaid: { label: 'Unpaid', color: 'border-gray-300 text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-950/30', icon: Wallet },
  deposit_paid: { label: 'Deposit Paid', color: 'border-blue-300 text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/30', icon: Clock },
  partially_paid: { label: 'Partially Paid', color: 'border-orange-300 text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/30', icon: Wallet },
  fully_paid: { label: 'Fully Paid', color: 'border-green-300 text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/30', icon: CheckCircle2 },
  overdue: { label: 'Overdue', color: 'border-red-300 text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/30', icon: AlertTriangle },
}

interface Product {
  id: string
  name: string
  sku: string
  sellingPrice: number
  quantity: number
  category?: { name: string }
}

export function CreditManagement() {
  const user = useAppStore((s) => s.user)
  const authFetch = useAppStore((s) => s.authFetch)
  const notifyDataChange = useAppStore((s) => s.notifyDataChange)
  const onDataChange = useAppStore((s) => s.onDataChange)

  const defaultSummary = {
    totalOutstanding: 0,
    totalCreditAmount: 0,
    totalDepositPaid: 0,
    totalPaid: 0,
    totalPayments: 0,
    fullyPaidCount: 0,
    depositPaidCount: 0,
    partiallyPaidCount: 0,
    overdueCount: 0,
    totalOrders: 0,
  }

  const [creditOrders, setCreditOrders] = useState<any[]>([])
  const [summary, setSummary] = useState(defaultSummary)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Debounce refs
  const fetchingRef = useRef(false)
  const lastFetchRef = useRef(0)
  const MIN_FETCH_INTERVAL = 2000
  const mountedRef = useRef(true)
  const retryCountRef = useRef(0)
  const MAX_RETRIES = 3
  const RETRY_DELAYS = [1000, 2000, 4000]

  // Filters
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')

  // Dialogs
  const [createDialog, setCreateDialog] = useState(false)
  const [paymentDialog, setPaymentDialog] = useState(false)
  const [historyDialog, setHistoryDialog] = useState(false)
  const [detailDialog, setDetailDialog] = useState(false)
  const [editDialog, setEditDialog] = useState(false)
  const [deleteDialog, setDeleteDialog] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<any>(null)

  // Create form
  const [products, setProducts] = useState<Product[]>([])
  const [cartItems, setCartItems] = useState<Array<{ productId: string; productName: string; quantity: number; price: number }>>([])
  const [createForm, setCreateForm] = useState({
    customerName: '',
    customerPhone: '',
    depositAmount: '',
    dueDate: '',
    notes: '',
    paymentMethod: 'cash',
  })

  // Payment form
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    paymentMethod: 'cash',
    notes: '',
  })

  // Edit form
  const [editForm, setEditForm] = useState({
    customerName: '',
    customerPhone: '',
    dueDate: '',
    notes: '',
  })

  const fetchCreditOrders = useCallback(async (showRefresh = false) => {
    if (fetchingRef.current) return
    const now = Date.now()
    if (now - lastFetchRef.current < MIN_FETCH_INTERVAL) return
    fetchingRef.current = true
    lastFetchRef.current = now

    try {
      setError(null)
      if (showRefresh) setRefreshing(true)
      const params = new URLSearchParams()
      if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter)
      if (searchTerm) params.set('search', searchTerm)
      
      const res = await authFetch(`/api/credits?${params}`)
      if (!mountedRef.current) return
      
      if (res.ok) {
        const data = await res.json()
        if (mountedRef.current) {
          setCreditOrders(Array.isArray(data.creditOrders) ? data.creditOrders : [])
          setSummary(data.summary || defaultSummary)
          // Show schema warning if present but don't block rendering
          if (data._error) {
            console.warn('Credits API warning:', data._error)
          }
        }
        retryCountRef.current = 0
      } else {
        // Auto-retry on 5xx errors
        if (res.status >= 500 && retryCountRef.current < MAX_RETRIES && mountedRef.current) {
          retryCountRef.current++
          const delay = RETRY_DELAYS[retryCountRef.current - 1] || 4000
          setTimeout(() => {
            if (mountedRef.current) fetchCreditOrders(false)
          }, delay)
          return
        }
        if (mountedRef.current) {
          setError('Failed to fetch credit orders')
        }
      }
    } catch (error) {
      console.error('Fetch credit orders error:', error)
      if (!mountedRef.current) return
      
      // Auto-retry on network errors
      if (retryCountRef.current < MAX_RETRIES) {
        retryCountRef.current++
        const delay = RETRY_DELAYS[retryCountRef.current - 1] || 4000
        setTimeout(() => {
          if (mountedRef.current) fetchCreditOrders(false)
        }, delay)
        return
      }
      setError('Network error — please check your connection')
    } finally {
      if (mountedRef.current) {
        setLoading(false)
        setRefreshing(false)
      }
      fetchingRef.current = false
    }
  }, [authFetch, statusFilter, searchTerm])

  useEffect(() => {
    mountedRef.current = true
    fetchCreditOrders()
    return () => { mountedRef.current = false }
  }, [fetchCreditOrders])

  // Refresh on visibility change
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') fetchCreditOrders()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [fetchCreditOrders])

  // Subscribe to cross-module data changes
  useEffect(() => {
    const unsubscribe = onDataChange((event: DataChangeEvent) => {
      if (CREDIT_EVENTS.includes(event)) {
        fetchCreditOrders()
      }
    })
    return unsubscribe
  }, [onDataChange, fetchCreditOrders])

  // Fetch products when create dialog opens
  useEffect(() => {
    if (createDialog) {
      const fetchProducts = async () => {
        try {
          const res = await authFetch('/api/inventory')
          if (res.ok) {
            const data = await res.json()
            setProducts(data.products || data)
          }
        } catch (error) {
          console.error('Fetch products error:', error)
        }
      }
      fetchProducts()
    }
  }, [createDialog, authFetch])

  const addToCart = (product: Product) => {
    const existing = cartItems.find((item) => item.productId === product.id)
    if (existing) {
      if (existing.quantity >= product.quantity) {
        toast.error(`Only ${product.quantity} units available`)
        return
      }
      setCartItems(
        cartItems.map((item) =>
          item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item
        )
      )
    } else {
      if (product.quantity <= 0) {
        toast.error('Product is out of stock')
        return
      }
      setCartItems([...cartItems, { productId: product.id, productName: product.name, quantity: 1, price: product.sellingPrice }])
    }
  }

  const updateCartItem = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      setCartItems(cartItems.filter((item) => item.productId !== productId))
    } else {
      // Enforce stock limit when incrementing
      const product = products.find((p) => p.id === productId)
      const maxQty = product?.quantity ?? 0
      const clampedQty = Math.min(quantity, maxQty)
      if (clampedQty < quantity) {
        toast.error(`Only ${maxQty} units available`)
      }
      setCartItems(cartItems.map((item) => (item.productId === productId ? { ...item, quantity: clampedQty } : item)))
    }
  }

  const removeCartItem = (productId: string) => {
    setCartItems(cartItems.filter((item) => item.productId !== productId))
  }

  const cartTotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const depositAmount = parseFloat(createForm.depositAmount) || 0

  const createCreditOrder = async () => {
    try {
      if (!createForm.customerName.trim()) {
        toast.error('Customer name is required')
        return
      }
      if (cartItems.length === 0) {
        toast.error('Add at least one product')
        return
      }
      if (depositAmount > cartTotal) {
        toast.error('Deposit cannot exceed total amount')
        return
      }

      const res = await authFetch('/api/credits', {
        method: 'POST',
        body: JSON.stringify({
          customerName: createForm.customerName,
          customerPhone: createForm.customerPhone,
          items: cartItems.map((item) => ({
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
            price: item.price,
          })),
          depositAmount: createForm.depositAmount || '0',
          dueDate: createForm.dueDate || null,
          notes: createForm.notes || null,
          paymentMethod: createForm.paymentMethod,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to create credit order')
        return
      }

      toast.success('Credit order created successfully')
      setCreateDialog(false)
      setCartItems([])
      setCreateForm({ customerName: '', customerPhone: '', depositAmount: '', dueDate: '', notes: '', paymentMethod: 'cash' })
      fetchCreditOrders()
      notifyDataChange('credit-changed')
      notifyDataChange('sale-created')
      notifyDataChange('inventory-changed')
    } catch {
      toast.error('Failed to create credit order')
    }
  }

  const addPayment = async () => {
    if (!selectedOrder) return
    try {
      const amount = parseFloat(paymentForm.amount)
      if (!amount || amount <= 0) {
        toast.error('Enter a valid payment amount')
        return
      }
      if (amount > selectedOrder.remainingBalance) {
        toast.error(`Payment exceeds remaining balance of KES ${safeLocaleString(selectedOrder.remainingBalance)}`)
        return
      }

      const res = await authFetch(`/api/credits/${selectedOrder.id}/payments`, {
        method: 'POST',
        body: JSON.stringify(paymentForm),
      })

      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to record payment')
        return
      }

      toast.success('Payment recorded successfully')
      setPaymentDialog(false)
      setPaymentForm({ amount: '', paymentMethod: 'cash', notes: '' })
      setSelectedOrder(null)
      fetchCreditOrders()
      notifyDataChange('credit-changed')
    } catch {
      toast.error('Failed to record payment')
    }
  }

  const editCreditOrder = async () => {
    if (!selectedOrder) return
    try {
      const res = await authFetch(`/api/credits/${selectedOrder.id}`, {
        method: 'PUT',
        body: JSON.stringify(editForm),
      })

      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to update credit order')
        return
      }

      toast.success('Credit order updated')
      setEditDialog(false)
      setSelectedOrder(null)
      fetchCreditOrders()
      notifyDataChange('credit-changed')
    } catch {
      toast.error('Failed to update credit order')
    }
  }

  const deleteCreditOrder = async () => {
    if (!selectedOrder) return
    try {
      const res = await authFetch(`/api/credits/${selectedOrder.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error || 'Failed to delete credit order')
        return
      }

      toast.success('Credit order deleted and stock restored')
      setDeleteDialog(false)
      setSelectedOrder(null)
      fetchCreditOrders()
      notifyDataChange('credit-changed')
      notifyDataChange('sale-deleted')
      notifyDataChange('inventory-changed')
    } catch {
      toast.error('Failed to delete credit order')
    }
  }

  const openPaymentDialog = (order: any) => {
    setSelectedOrder(order)
    setPaymentForm({ amount: '', paymentMethod: 'cash', notes: '' })
    setPaymentDialog(true)
  }

  const openHistoryDialog = (order: any) => {
    setSelectedOrder(order)
    setHistoryDialog(true)
  }

  const openDetailDialog = (order: any) => {
    setSelectedOrder(order)
    setDetailDialog(true)
  }

  const openEditDialog = (order: any) => {
    setSelectedOrder(order)
    setEditForm({
      customerName: order.customerName,
      customerPhone: order.customerPhone || '',
      dueDate: order.dueDate ? new Date(order.dueDate).toISOString().split('T')[0] : '',
      notes: order.notes || '',
    })
    setEditDialog(true)
  }

  const openDeleteDialog = (order: any) => {
    setSelectedOrder(order)
    setDeleteDialog(true)
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Outstanding Balance</p>
                <p className="text-2xl font-bold text-red-600">KES {safeLocaleString(summary.totalOutstanding)}</p>
                <p className="text-xs text-muted-foreground">{summary.totalOrders - summary.fullyPaidCount} pending orders</p>
              </div>
              <CreditCard className="h-8 w-8 text-red-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Credit Sales</p>
                <p className="text-2xl font-bold">KES {safeLocaleString(summary.totalCreditAmount)}</p>
                <p className="text-xs text-muted-foreground">{summary.totalOrders} total orders</p>
              </div>
              <DollarSign className="h-8 w-8 text-amber-700 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Paid</p>
                <p className="text-2xl font-bold text-green-600">KES {safeLocaleString(summary.totalPaid)}</p>
                <p className="text-xs text-muted-foreground">{summary.fullyPaidCount} fully paid</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Overdue</p>
                <p className="text-2xl font-bold text-orange-600">{summary.overdueCount}</p>
                <p className="text-xs text-muted-foreground">{summary.partiallyPaidCount + summary.depositPaidCount} in progress</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-orange-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search customer name or phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px] h-9">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="unpaid">Unpaid</SelectItem>
            <SelectItem value="deposit_paid">Deposit Paid</SelectItem>
            <SelectItem value="partially_paid">Partially Paid</SelectItem>
            <SelectItem value="fully_paid">Fully Paid</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={() => fetchCreditOrders(true)} disabled={refreshing} title="Refresh">
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        </Button>
        <div className="flex-1" />
        <Button onClick={() => setCreateDialog(true)} className="bg-amber-800 hover:bg-amber-900 text-white">
          <Plus className="h-4 w-4 mr-2" /> New Credit Order
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : error && creditOrders.length === 0 ? (
            <div className="p-8 text-center">
              <div className="max-w-md mx-auto space-y-4">
                <div className="p-4 bg-red-50 dark:bg-red-950/30 rounded-full w-fit mx-auto">
                  <AlertTriangle className="h-10 w-10 text-red-600" />
                </div>
                <h3 className="text-lg font-semibold">Failed to Load Credit Orders</h3>
                <p className="text-sm text-muted-foreground">{error}</p>
                <Button variant="outline" onClick={() => fetchCreditOrders(true)}>
                  <RefreshCw className="h-4 w-4 mr-2" /> Retry
                </Button>
              </div>
            </div>
          ) : creditOrders.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <CreditCard className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p className="font-medium">No credit orders found</p>
              <p className="text-sm mt-1">Credit orders will appear here when customers place orders with deposits or partial payments.</p>
              <Button
                variant="outline"
                className="mt-3"
                onClick={() => setCreateDialog(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Create First Credit Order
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Staff</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {creditOrders.map((order) => {
                    const status = STATUS_CONFIG[order.paymentStatus] || STATUS_CONFIG.deposit_paid
                    return (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium">{order.customerName}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{order.customerPhone || '-'}</TableCell>
                        <TableCell className="text-right">KES {safeLocaleString(order.totalAmount)}</TableCell>
                        <TableCell className="text-right text-green-600">KES {safeLocaleString(order.totalAmount - order.remainingBalance)}</TableCell>
                        <TableCell className="text-right font-semibold text-red-600">KES {safeLocaleString(order.remainingBalance)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-xs ${status.color}`}>
                            {status.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {order.dueDate ? new Date(order.dueDate).toLocaleDateString() : '-'}
                        </TableCell>
                        <TableCell className="text-sm">{order.user?.name || '-'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(order.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => openDetailDialog(order)}
                              title="View details"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            {order.paymentStatus !== 'fully_paid' && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-green-600 hover:text-green-700"
                                onClick={() => openPaymentDialog(order)}
                                title="Record payment"
                              >
                                <DollarSign className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {user?.role === 'admin' && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => openEditDialog(order)}
                                  title="Edit"
                                >
                                  <User className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-red-500 hover:text-red-700"
                                  onClick={() => openDeleteDialog(order)}
                                  title="Delete"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Credit Order Dialog */}
      <Dialog open={createDialog} onOpenChange={setCreateDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Credit Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Customer Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Customer Name *</Label>
                <Input
                  value={createForm.customerName}
                  onChange={(e) => setCreateForm({ ...createForm, customerName: e.target.value })}
                  placeholder="Enter customer name"
                />
              </div>
              <div className="space-y-2">
                <Label>Phone Number</Label>
                <Input
                  value={createForm.customerPhone}
                  onChange={(e) => setCreateForm({ ...createForm, customerPhone: e.target.value })}
                  placeholder="Enter phone number"
                />
              </div>
            </div>

            {/* Product Selection */}
            <div className="space-y-2">
              <Label>Select Products</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto border rounded-lg p-2">
                {products
                  .filter((p) => p.quantity > 0)
                  .map((product) => (
                    <button
                      key={product.id}
                      className="flex flex-col items-start p-2 rounded border hover:bg-amber-50 dark:hover:bg-amber-950/30 text-left text-sm transition-colors"
                      onClick={() => addToCart(product)}
                    >
                      <span className="font-medium truncate w-full">{product.name}</span>
                      <span className="text-xs text-muted-foreground">
                        KES {safeLocaleString(product.sellingPrice)} · {product.quantity} left
                      </span>
                    </button>
                  ))}
                {products.filter((p) => p.quantity > 0).length === 0 && (
                  <p className="col-span-full text-center text-sm text-muted-foreground py-4">
                    No products in stock. Add products to inventory first.
                  </p>
                )}
              </div>
            </div>

            {/* Cart */}
            {cartItems.length > 0 && (
              <div className="space-y-2">
                <Label>Order Items</Label>
                <div className="border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Price</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cartItems.map((item) => (
                        <TableRow key={item.productId}>
                          <TableCell className="font-medium text-sm">{item.productName}</TableCell>
                          <TableCell className="text-right text-sm">KES {safeLocaleString(item.price)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => updateCartItem(item.productId, item.quantity - 1)}>-</Button>
                              <span className="w-8 text-center text-sm">{item.quantity}</span>
                              <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => updateCartItem(item.productId, item.quantity + 1)}>+</Button>
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-sm font-medium">KES {safeLocaleString(item.price * item.quantity)}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500" onClick={() => removeCartItem(item.productId)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="p-3 border-t flex justify-between items-center font-medium">
                    <span>Total Amount</span>
                    <span>KES {safeLocaleString(cartTotal)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Payment Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Deposit Amount (KES)</Label>
                <Input
                  type="number"
                  value={createForm.depositAmount}
                  onChange={(e) => setCreateForm({ ...createForm, depositAmount: e.target.value })}
                  placeholder="0"
                  min="0"
                  max={cartTotal}
                />
                {cartTotal > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Balance: KES {safeLocaleString(cartTotal - depositAmount)}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Deposit Payment Method</Label>
                <Select value={createForm.paymentMethod} onValueChange={(v) => setCreateForm({ ...createForm, paymentMethod: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="mpesa">M-Pesa</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Due Date (optional)</Label>
                <Input
                  type="date"
                  value={createForm.dueDate}
                  onChange={(e) => setCreateForm({ ...createForm, dueDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Input
                  value={createForm.notes}
                  onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                  placeholder="Optional notes"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateDialog(false); setCartItems([]) }}>Cancel</Button>
            <Button onClick={createCreditOrder} className="bg-amber-800 hover:bg-amber-900 text-white">Create Credit Order</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record Payment Dialog */}
      <Dialog open={paymentDialog} onOpenChange={setPaymentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-lg text-sm space-y-1">
                <p><strong>Customer:</strong> {selectedOrder.customerName}</p>
                <p><strong>Total:</strong> KES {safeLocaleString(selectedOrder.totalAmount)}</p>
                <p><strong>Paid So Far:</strong> KES {safeLocaleString(selectedOrder.totalAmount - selectedOrder.remainingBalance)}</p>
                <p><strong>Remaining:</strong> <span className="text-red-600 font-semibold">KES {safeLocaleString(selectedOrder.remainingBalance)}</span></p>
              </div>
              <div className="space-y-2">
                <Label>Payment Amount (KES) *</Label>
                <Input
                  type="number"
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                  placeholder="Enter amount"
                  min="0"
                  max={selectedOrder.remainingBalance}
                />
              </div>
              <div className="space-y-2">
                <Label>Payment Method</Label>
                <Select value={paymentForm.paymentMethod} onValueChange={(v) => setPaymentForm({ ...paymentForm, paymentMethod: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="mpesa">M-Pesa</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Input
                  value={paymentForm.notes}
                  onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                  placeholder="Optional payment notes"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialog(false)}>Cancel</Button>
            <Button onClick={addPayment} className="bg-green-700 hover:bg-green-800 text-white">
              <DollarSign className="h-4 w-4 mr-2" /> Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment History Dialog */}
      <Dialog open={historyDialog} onOpenChange={setHistoryDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Payment History</DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-lg text-sm space-y-1">
                <p><strong>Customer:</strong> {selectedOrder.customerName}</p>
                <p><strong>Total:</strong> KES {safeLocaleString(selectedOrder.totalAmount)}</p>
                <p><strong>Remaining:</strong> KES {safeLocaleString(selectedOrder.remainingBalance)}</p>
              </div>
              {selectedOrder.payments && selectedOrder.payments.length > 0 ? (
                <div className="space-y-2">
                  {selectedOrder.payments.map((payment: any) => (
                    <div key={payment.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="text-sm font-medium">KES {safeLocaleString(payment.amount)}</p>
                        <p className="text-xs text-muted-foreground">
                          {payment.paymentMethod} · by {payment.user?.name || '-'}
                        </p>
                        {payment.notes && <p className="text-xs text-muted-foreground mt-1">{payment.notes}</p>}
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">
                          {new Date(payment.createdAt).toLocaleDateString()}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(payment.createdAt).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-sm text-muted-foreground py-4">No payments recorded yet</p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setHistoryDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={detailDialog} onOpenChange={setDetailDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Credit Order Details</DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              {/* Customer & Order Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-muted rounded-lg text-sm space-y-1">
                  <p className="font-semibold mb-2">Customer Info</p>
                  <p><strong>Name:</strong> {selectedOrder.customerName}</p>
                  <p><strong>Phone:</strong> {selectedOrder.customerPhone || '-'}</p>
                </div>
                <div className="p-3 bg-muted rounded-lg text-sm space-y-1">
                  <p className="font-semibold mb-2">Payment Info</p>
                  <p><strong>Total:</strong> KES {safeLocaleString(selectedOrder.totalAmount)}</p>
                  <p><strong>Paid:</strong> <span className="text-green-600">KES {safeLocaleString(selectedOrder.totalAmount - selectedOrder.remainingBalance)}</span></p>
                  <p><strong>Balance:</strong> <span className="text-red-600 font-semibold">KES {safeLocaleString(selectedOrder.remainingBalance)}</span></p>
                  <p>
                    <strong>Status:</strong>{' '}
                    <Badge variant="outline" className={`text-xs ${(STATUS_CONFIG[selectedOrder.paymentStatus] || STATUS_CONFIG.deposit_paid).color}`}>
                      {(STATUS_CONFIG[selectedOrder.paymentStatus] || STATUS_CONFIG.deposit_paid).label}
                    </Badge>
                  </p>
                </div>
              </div>

              {/* Items */}
              {selectedOrder.items && selectedOrder.items.length > 0 && (
                <div>
                  <p className="font-semibold text-sm mb-2">Items Ordered</p>
                  <div className="border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead className="text-right">Price</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedOrder.items.map((item: any) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium text-sm">{item.product?.name || 'Unknown'}</TableCell>
                            <TableCell className="text-right text-sm">KES {safeLocaleString(item.price)}</TableCell>
                            <TableCell className="text-right text-sm">{item.quantity}</TableCell>
                            <TableCell className="text-right text-sm font-medium">KES {safeLocaleString(item.total)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* Payment History */}
              {selectedOrder.payments && selectedOrder.payments.length > 0 && (
                <div>
                  <p className="font-semibold text-sm mb-2">Payment History</p>
                  <div className="space-y-2">
                    {selectedOrder.payments.map((payment: any) => (
                      <div key={payment.id} className="flex items-center justify-between p-2 border rounded text-sm">
                        <div>
                          <span className="font-medium">KES {safeLocaleString(payment.amount)}</span>
                          <span className="text-muted-foreground ml-2">via {payment.paymentMethod}</span>
                          {payment.notes && <span className="text-muted-foreground ml-2">· {payment.notes}</span>}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(payment.createdAt).toLocaleDateString()} by {payment.user?.name || '-'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Additional Info */}
              <div className="text-sm text-muted-foreground space-y-1">
                <p><strong>Due Date:</strong> {selectedOrder.dueDate ? new Date(selectedOrder.dueDate).toLocaleDateString() : 'Not set'}</p>
                <p><strong>Notes:</strong> {selectedOrder.notes || 'None'}</p>
                <p><strong>Handled by:</strong> {selectedOrder.user?.name || '-'}</p>
                <p><strong>Created:</strong> {new Date(selectedOrder.createdAt).toLocaleDateString()}</p>
              </div>
            </div>
          )}
          <DialogFooter>
            {selectedOrder?.paymentStatus !== 'fully_paid' && (
              <Button
                onClick={() => { setDetailDialog(false); openPaymentDialog(selectedOrder) }}
                className="bg-green-700 hover:bg-green-800 text-white"
              >
                <DollarSign className="h-4 w-4 mr-2" /> Record Payment
              </Button>
            )}
            <Button variant="outline" onClick={() => setDetailDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog (Admin) */}
      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Credit Order</DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Customer Name</Label>
                <Input
                  value={editForm.customerName}
                  onChange={(e) => setEditForm({ ...editForm, customerName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Phone Number</Label>
                <Input
                  value={editForm.customerPhone}
                  onChange={(e) => setEditForm({ ...editForm, customerPhone: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Due Date</Label>
                <Input
                  type="date"
                  value={editForm.dueDate}
                  onChange={(e) => setEditForm({ ...editForm, dueDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(false)}>Cancel</Button>
            <Button onClick={editCreditOrder} className="bg-amber-800 hover:bg-amber-900 text-white">Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialog} onOpenChange={setDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Credit Order</DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-3">
              <p className="text-sm">
                This will delete the credit order for <strong>{selectedOrder.customerName}</strong> and{' '}
                <strong>restore all product stock</strong> that was deducted. This action cannot be undone.
              </p>
              <div className="p-3 bg-muted rounded-lg text-sm">
                <p><strong>Total:</strong> KES {safeLocaleString(selectedOrder.totalAmount)}</p>
                <p><strong>Paid:</strong> KES {safeLocaleString(selectedOrder.totalAmount - selectedOrder.remainingBalance)}</p>
                <p><strong>Remaining:</strong> KES {safeLocaleString(selectedOrder.remainingBalance)}</p>
                <p><strong>Items:</strong> {selectedOrder.items?.length || 0} products</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteDialog(false); setSelectedOrder(null) }}>Cancel</Button>
            <Button variant="destructive" onClick={deleteCreditOrder}>
              <Trash2 className="h-4 w-4 mr-2" /> Delete & Restore Stock
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
