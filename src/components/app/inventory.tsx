'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAppStore, DataChangeEvent } from '@/store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { Search, Plus, Edit2, Trash2, AlertTriangle, Package, Tags, X, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

interface Category {
  id: string
  name: string
  description?: string
  icon?: string
  _count?: { products: number }
}

interface Product {
  id: string
  name: string
  sku: string
  barcode?: string
  description?: string
  categoryId: string
  buyingPrice: number
  sellingPrice: number
  quantity: number
  minStock: number
  brand?: string
  size?: string
  color?: string
  fragrance?: string
  supplierId?: string
  active: boolean
  category: Category
  supplier?: any
}

// All events that should trigger an Inventory refresh
const INVENTORY_REFRESH_EVENTS: DataChangeEvent[] = [
  'sale-created',       // stock decreases after a sale
  'sale-deleted',       // stock restored after a sale deletion
  'product-created',
  'product-updated',
  'product-deleted',
  'inventory-changed',
  'category-changed',
  'supplier-changed',   // supplier info in product details
  'settings-changed',   // settings like low stock threshold
  'credit-changed',     // credit orders affect stock
]

function safeNum(val: any, fallback = 0): number {
  if (val === null || val === undefined) return fallback
  const n = Number(val)
  return isNaN(n) ? fallback : n
}

function safeLocaleString(val: any, fallback = '0'): string {
  const n = safeNum(val, -1)
  return n === -1 ? fallback : n.toLocaleString()
}

export function Inventory() {
  const user = useAppStore((s) => s.user)
  const authFetch = useAppStore((s) => s.authFetch)
  const notifyDataChange = useAppStore((s) => s.notifyDataChange)
  const onDataChange = useAppStore((s) => s.onDataChange)
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('all')
  const [filterStock, setFilterStock] = useState('all')
  const [productDialog, setProductDialog] = useState(false)
  const [categoryDialog, setCategoryDialog] = useState(false)
  const [deleteDialog, setDeleteDialog] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [deleteCategory, setDeleteCategory] = useState<Category | null>(null)
  const [reassignTo, setReassignTo] = useState('')

  // Product form
  const [form, setForm] = useState({
    name: '', sku: '', barcode: '', description: '', categoryId: '',
    buyingPrice: '', sellingPrice: '', quantity: '0', minStock: '5',
    brand: '', size: '', color: '', fragrance: '', supplierId: '',
  })

  // Category form
  const [catForm, setCatForm] = useState({ name: '', description: '', icon: '' })

  // Debounce ref for fetchProducts — prevents triple-fetch on save
  const lastFetchRef = useRef(0)
  const mountedRef = useRef(true)
  const retryCountRef = useRef(0)
  const fetchingRef = useRef(false)
  const MAX_RETRIES = 3
  const RETRY_DELAYS = [1000, 2000, 4000]

  const fetchProducts = useCallback(async (isRetry = false) => {
    // Prevent concurrent fetches (unless it's a retry)
    if (fetchingRef.current && !isRetry) return
    // Debounce: don't re-fetch if we just fetched within the last 2000ms
    if (!isRetry) {
      const now = Date.now()
      if (now - lastFetchRef.current < 2000) return
      lastFetchRef.current = now
    }

    fetchingRef.current = true
    if (!isRetry) setError(null)

    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (filterCategory !== 'all') params.set('categoryId', filterCategory)
      if (filterStock !== 'all') params.set('stock', filterStock)
      const res = await authFetch(`/api/inventory?${params}`)

      if (!mountedRef.current) return

      if (res.ok) {
        const data = await res.json()
        setProducts(Array.isArray(data?.products) ? data.products : [])
        retryCountRef.current = 0
        setError(null)
      } else {
        // Auto-retry on 5xx errors
        if (res.status >= 500 && retryCountRef.current < MAX_RETRIES) {
          retryCountRef.current++
          const delay = RETRY_DELAYS[retryCountRef.current - 1] || 4000
          console.log(`Inventory: retry ${retryCountRef.current}/${MAX_RETRIES} after ${delay}ms`)
          setError(`Loading products (attempt ${retryCountRef.current + 1}/${MAX_RETRIES})...`)
          setTimeout(() => {
            if (mountedRef.current) fetchProducts(true)
          }, delay)
          return
        }

        let errorMsg = 'Failed to fetch products'
        try {
          const errBody = await res.json()
          if (errBody?.error) errorMsg = errBody.error
        } catch {}
        setError(errorMsg)
        // Keep existing products if we have them
      }
    } catch (error) {
      console.error('Fetch products error:', error)
      if (!mountedRef.current) return

      // Auto-retry on network errors
      if (retryCountRef.current < MAX_RETRIES) {
        retryCountRef.current++
        const delay = RETRY_DELAYS[retryCountRef.current - 1] || 4000
        console.log(`Inventory: network retry ${retryCountRef.current}/${MAX_RETRIES} after ${delay}ms`)
        setError(`Connecting to server (attempt ${retryCountRef.current + 1}/${MAX_RETRIES})...`)
        setTimeout(() => {
          if (mountedRef.current) fetchProducts(true)
        }, delay)
        return
      }

      setError('Network error — please check your connection')
    } finally {
      if (mountedRef.current && (retryCountRef.current === 0 || retryCountRef.current >= MAX_RETRIES)) {
        setLoading(false)
      }
      fetchingRef.current = false
    }
  }, [authFetch, search, filterCategory, filterStock])

  const fetchCategories = useCallback(async () => {
    try {
      const res = await authFetch('/api/categories')
      if (res.ok) setCategories(await res.json())
    } catch (error) {
      console.error('Fetch categories error:', error)
    }
  }, [authFetch])

  const fetchSuppliers = useCallback(async () => {
    try {
      const res = await authFetch('/api/suppliers')
      if (res.ok) setSuppliers(await res.json())
    } catch {}
  }, [authFetch])

  useEffect(() => {
    mountedRef.current = true
    fetchCategories()
    fetchSuppliers()
    fetchProducts()
    return () => { mountedRef.current = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch products when search/filter changes
  useEffect(() => {
    retryCountRef.current = 0
    fetchProducts()
  }, [search, filterCategory, filterStock]) // eslint-disable-line react-hooks/exhaustive-deps

  // Subscribe to cross-module data changes for instant refresh
  useEffect(() => {
    const unsubscribe = onDataChange((event: DataChangeEvent) => {
      if (INVENTORY_REFRESH_EVENTS.includes(event)) {
        retryCountRef.current = 0
        fetchProducts()
      }
      if (event === 'category-changed') {
        fetchCategories()
      }
      if (event === 'supplier-changed') {
        fetchSuppliers()
      }
    })
    return unsubscribe
  }, [onDataChange, fetchProducts, fetchCategories])

  // Refresh products when tab becomes visible (covers SPA navigation from Sales back to Inventory)
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        retryCountRef.current = 0
        fetchProducts()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [fetchProducts])

  const openProductDialog = (product?: Product) => {
    if (product) {
      setEditingProduct(product)
      setForm({
        name: product.name, sku: product.sku, barcode: product.barcode || '',
        description: product.description || '', categoryId: product.categoryId,
        buyingPrice: String(product.buyingPrice), sellingPrice: String(product.sellingPrice),
        quantity: String(product.quantity), minStock: String(product.minStock),
        brand: product.brand || '', size: product.size || '', color: product.color || '',
        fragrance: product.fragrance || '', supplierId: product.supplierId || '',
      })
    } else {
      setEditingProduct(null)
      setForm({ name: '', sku: '', barcode: '', description: '', categoryId: '', buyingPrice: '', sellingPrice: '', quantity: '0', minStock: '5', brand: '', size: '', color: '', fragrance: '', supplierId: '' })
    }
    setProductDialog(true)
  }

  const saveProduct = async () => {
    try {
      const url = editingProduct ? `/api/inventory/${editingProduct.id}` : '/api/inventory'
      const method = editingProduct ? 'PUT' : 'POST'
      const res = await authFetch(url, {
        method,
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to save product')
        return
      }
      toast.success(editingProduct ? 'Product updated' : 'Product created')
      setProductDialog(false)
      fetchProducts()
      // Notify all other modules (POS, Dashboard, Reports, Sales Tracking) about product change
      const event = editingProduct ? 'product-updated' : 'product-created'
      notifyDataChange(event)
      // Also emit inventory-changed so all modules refresh
      notifyDataChange('inventory-changed')
    } catch (error) {
      toast.error('Failed to save product')
    }
  }

  const deleteProduct = async (id: string) => {
    try {
      const res = await authFetch(`/api/inventory/${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Product deleted')
        fetchProducts()
        // Notify all other modules about product deletion
        notifyDataChange('product-deleted')
        notifyDataChange('inventory-changed')
      } else {
        const data = await res.json()
        toast.error(data.error)
      }
    } catch {
      toast.error('Failed to delete product')
    }
  }

  const saveCategory = async () => {
    try {
      const url = editingCategory ? `/api/categories/${editingCategory.id}` : '/api/categories'
      const method = editingCategory ? 'PUT' : 'POST'
      const res = await authFetch(url, {
        method,
        body: JSON.stringify(catForm),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to save category')
        return
      }
      toast.success(editingCategory ? 'Category updated' : 'Category created')
      setCategoryDialog(false)
      setEditingCategory(null)
      fetchCategories()
      // Notify all other modules about category change
      notifyDataChange('category-changed')
    } catch {
      toast.error('Failed to save category')
    }
  }

  const handleDeleteCategory = async () => {
    if (!deleteCategory) return
    try {
      const params = reassignTo ? `?reassignTo=${reassignTo}` : ''
      const res = await authFetch(`/api/categories/${deleteCategory.id}${params}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) {
        if (data.requiresReassignment) {
          return // Dialog is already open
        }
        toast.error(data.error)
        return
      }
      toast.success('Category deleted')
      setDeleteDialog(false)
      setDeleteCategory(null)
      setReassignTo('')
      fetchCategories()
      fetchProducts()
      // Notify all other modules about category and product changes
      notifyDataChange('category-changed')
      notifyDataChange('inventory-changed')
    } catch {
      toast.error('Failed to delete category')
    }
  }

  const openDeleteCategory = async (cat: Category) => {
    setDeleteCategory(cat)
    const productCount = cat._count?.products || 0
    if (productCount > 0) {
      // Products exist — need reassignment dialog
      setDeleteDialog(true)
      return
    }
    // No products — safe to show a simple confirm dialog
    setDeleteDialog(true)
  }

  const stockStatus = (product: Product) => {
    if (product.quantity === 0) return <Badge variant="destructive">Out of Stock</Badge>
    if (product.quantity <= product.minStock) return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">Low Stock</Badge>
    return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">In Stock</Badge>
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex flex-wrap gap-2 items-center flex-1">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search products..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterStock} onValueChange={setFilterStock}>
            <SelectTrigger className="w-[130px]"><SelectValue placeholder="Stock" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stock</SelectItem>
              <SelectItem value="in">In Stock</SelectItem>
              <SelectItem value="low">Low Stock</SelectItem>
              <SelectItem value="out">Out of Stock</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          {user?.role === 'admin' && (
            <Button variant="outline" onClick={() => { setEditingCategory(null); setCatForm({ name: '', description: '', icon: '' }); setCategoryDialog(true) }}>
              <Tags className="h-4 w-4 mr-2" /> Categories
            </Button>
          )}
          {user?.role === 'admin' && (
            <Button onClick={() => openProductDialog()} className="bg-amber-800 hover:bg-amber-900 text-white">
              <Plus className="h-4 w-4 mr-2" /> Add Product
            </Button>
          )}
        </div>
      </div>

      {/* Error banner (partial data loaded) */}
      {error && products.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4" />
            <span>Some data may be unavailable. {error}</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => { retryCountRef.current = 0; lastFetchRef.current = 0; fetchProducts(); }}>
            <RefreshCw className="h-3 w-3 mr-1" /> Retry
          </Button>
        </div>
      )}

      {/* Products Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Loading products...</div>
          ) : error && products.length === 0 ? (
            <div className="p-8 text-center">
              <div className="max-w-md mx-auto space-y-4">
                <div className="p-4 bg-red-50 dark:bg-red-950/30 rounded-full w-fit mx-auto">
                  <AlertTriangle className="h-10 w-10 text-red-600" />
                </div>
                <h3 className="text-lg font-semibold">Failed to Load Inventory</h3>
                <p className="text-sm text-muted-foreground">{error}</p>
                <Button variant="outline" onClick={() => { retryCountRef.current = 0; lastFetchRef.current = 0; setError(null); fetchProducts(); }}>
                  <RefreshCw className="h-4 w-4 mr-2" /> Retry
                </Button>
              </div>
            </div>
          ) : products.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No products found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Buy Price</TableHead>
                    <TableHead className="text-right">Sell Price</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead>Status</TableHead>
                    {user?.role === 'admin' && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{product.name}</p>
                          {product.brand && <p className="text-xs text-muted-foreground">{product.brand}</p>}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{product.sku}</TableCell>
                      <TableCell><Badge variant="outline">{product.category?.name}</Badge></TableCell>
                      <TableCell className="text-right">KES {safeLocaleString(product.buyingPrice)}</TableCell>
                      <TableCell className="text-right">KES {safeLocaleString(product.sellingPrice)}</TableCell>
                      <TableCell className="text-right font-medium">{product.quantity}</TableCell>
                      <TableCell>{stockStatus(product)}</TableCell>
                      {user?.role === 'admin' && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openProductDialog(product)}>
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={() => deleteProduct(product.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
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

      {/* Product Dialog */}
      <Dialog open={productDialog} onOpenChange={setProductDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingProduct ? 'Edit Product' : 'Add Product'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Product Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>SKU *</Label>
              <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Category *</Label>
              <Select value={form.categoryId} onValueChange={(v) => setForm({ ...form, categoryId: v })}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Supplier</Label>
              <Select value={form.supplierId || '_none'} onValueChange={(v) => setForm({ ...form, supplierId: v === '_none' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">None</SelectItem>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Buying Price (KES) *</Label>
              <Input type="number" value={form.buyingPrice} onChange={(e) => setForm({ ...form, buyingPrice: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Selling Price (KES) *</Label>
              <Input type="number" value={form.sellingPrice} onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })} />
            </div>
            {!editingProduct && (
              <div className="space-y-2">
                <Label>Initial Stock</Label>
                <Input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
              </div>
            )}
            {editingProduct && (
              <div className="space-y-2">
                <Label>Current Stock</Label>
                <Input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
              </div>
            )}
            <div className="space-y-2">
              <Label>Min Stock Level</Label>
              <Input type="number" value={form.minStock} onChange={(e) => setForm({ ...form, minStock: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Barcode</Label>
              <Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Brand</Label>
              <Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Size</Label>
              <Input value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <Input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProductDialog(false)}>Cancel</Button>
            <Button onClick={saveProduct} className="bg-amber-800 hover:bg-amber-900 text-white">
              {editingProduct ? 'Update' : 'Create'} Product
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Category Management Dialog */}
      <Dialog open={categoryDialog} onOpenChange={setCategoryDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] !flex !flex-col overflow-hidden p-0 gap-0">
          {/* Fixed Header */}
          <DialogHeader className="shrink-0 px-6 pt-6 pb-2">
            <DialogTitle>Manage Categories</DialogTitle>
          </DialogHeader>
          {/* Fixed Add/Edit Form */}
          <div className="shrink-0 px-6 pb-3 space-y-2 border-b">
            <div className="flex flex-col sm:flex-row gap-2">
              <Input placeholder="Category name" value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} className="sm:w-40" />
              <Input placeholder="Description (optional)" value={catForm.description} onChange={(e) => setCatForm({ ...catForm, description: e.target.value })} className="flex-1 min-w-0" />
            </div>
            <div className="flex gap-2">
              <Button onClick={saveCategory} className="bg-amber-800 hover:bg-amber-900 text-white shrink-0">
                {editingCategory ? 'Update' : 'Add'}
              </Button>
              {editingCategory && (
                <Button variant="outline" onClick={() => { setEditingCategory(null); setCatForm({ name: '', description: '', icon: '' }) }}>Cancel</Button>
              )}
            </div>
          </div>
          {/* Scrollable Category List */}
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 py-3">
            {categories.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <Tags className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No categories yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {categories.map((cat) => (
                  <div key={cat.id} className="flex items-center justify-between gap-2 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <p className="font-medium text-sm truncate">{cat.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {cat.description || 'No description'} · {cat._count?.products || 0} product{(cat._count?.products || 0) !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingCategory(cat); setCatForm({ name: cat.name, description: cat.description || '', icon: cat.icon || '' }) }}>
                        <Edit2 className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600" onClick={() => openDeleteCategory(cat)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Category Confirmation */}
      <AlertDialog open={deleteDialog} onOpenChange={setDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Category: {deleteCategory?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This category has products linked to it. Please choose a category to reassign them to, or the deletion will be cancelled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label>Reassign products to:</Label>
            <Select value={reassignTo} onValueChange={setReassignTo}>
              <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>
                {categories.filter((c) => c.id !== deleteCategory?.id).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setDeleteDialog(false); setDeleteCategory(null); setReassignTo('') }}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteCategory} disabled={!reassignTo} className="bg-red-600 hover:bg-red-700">
              Delete & Reassign
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
