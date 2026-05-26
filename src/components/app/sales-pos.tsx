'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAppStore, DataChangeEvent } from '@/store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Search, ShoppingCart, Plus, Minus, Trash2, CreditCard, Receipt, Package, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

interface Product {
  id: string
  name: string
  sku: string
  sellingPrice: number
  quantity: number
  minStock: number
  active: boolean
  category: { id: string; name: string }
}

interface CartItem {
  product: Product
  quantity: number
  price: number
}

// Events that should trigger a POS product refresh
const POS_REFRESH_EVENTS: DataChangeEvent[] = [
  'product-created',
  'product-updated',
  'product-deleted',
  'inventory-changed',
  'sale-created',     // stock changes after a sale
  'sale-deleted',     // stock restored after a sale deletion
  'category-changed',
  'supplier-changed', // supplier info changes
  'settings-changed', // receipt/currency changes
]

export function SalesPOS() {
  const authFetch = useAppStore((s) => s.authFetch)
  const notifyDataChange = useAppStore((s) => s.notifyDataChange)
  const onDataChange = useAppStore((s) => s.onDataChange)
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('all')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [discount, setDiscount] = useState(0)
  const [receiptDialog, setReceiptDialog] = useState(false)
  const [lastSale, setLastSale] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [shopSettings, setShopSettings] = useState<{ shopName: string; receiptFooter: string; currency: string }>({
    shopName: 'Trendz',
    receiptFooter: 'Thank you for shopping with us!',
    currency: 'KES',
  })
  const mountedRef = useRef(true)
  const lastRefreshRef = useRef(0)

  // Fetch all active products (including out-of-stock so user can see them)
  // Cache-busting timestamp ensures we never get a stale browser-cached response
  const fetchProducts = useCallback(async (showRefresh = false) => {
    // Debounce: don't re-fetch if we just fetched within the last 500ms
    const now = Date.now()
    if (now - lastRefreshRef.current < 500 && !showRefresh) return
    lastRefreshRef.current = now

    try {
      if (showRefresh) setRefreshing(true)
      const ts = Date.now()
      const res = await authFetch(`/api/inventory?limit=500&_t=${ts}`)
      if (res.ok) {
        const data = await res.json()
        // Show all active products — out-of-stock ones will be displayed but not sellable
        const activeProducts = data.products.filter((p: any) => p.active !== false)
        if (mountedRef.current) {
          setProducts(activeProducts)
        }
      } else {
        console.error('Failed to fetch products:', res.status)
      }
    } catch (error) {
      console.error('Fetch products error:', error)
    } finally {
      if (mountedRef.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [authFetch])

  // Fetch categories independently
  const fetchCategories = useCallback(async () => {
    try {
      const res = await authFetch('/api/categories')
      if (res.ok) {
        const data = await res.json()
        if (mountedRef.current) setCategories(data)
      }
    } catch (error) {
      console.error('Fetch categories error:', error)
    }
  }, [authFetch])

  // Fetch shop settings independently
  const fetchSettings = useCallback(async () => {
    try {
      const res = await authFetch('/api/public-settings')
      if (res.ok) {
        const settings = await res.json()
        if (mountedRef.current) {
          setShopSettings({
            shopName: settings.shopName || 'Trendz',
            receiptFooter: settings.receiptFooter || 'Thank you for shopping with us!',
            currency: settings.currency || 'KES',
          })
        }
      }
    } catch (error) {
      console.error('Fetch settings error:', error)
    }
  }, [authFetch])

  // Load all data on mount — each call is independent so one failure doesn't block others
  useEffect(() => {
    mountedRef.current = true
    fetchProducts()
    fetchCategories()
    fetchSettings()
    return () => { mountedRef.current = false }
  }, [fetchProducts, fetchCategories, fetchSettings])

  // Subscribe to cross-module data changes for instant refresh
  useEffect(() => {
    const unsubscribe = onDataChange((event: DataChangeEvent) => {
      if (POS_REFRESH_EVENTS.includes(event)) {
        fetchProducts()
        if (event === 'category-changed') fetchCategories()
        if (event === 'settings-changed') fetchSettings()
      }
    })
    return unsubscribe
  }, [onDataChange, fetchProducts, fetchCategories, fetchSettings])

  // Auto-refresh when the tab/window becomes visible again
  // Use only visibilitychange to avoid double-fetch (not also 'focus')
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchProducts()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [fetchProducts])

  // Manual refresh all data
  const refreshAll = async () => {
    setRefreshing(true)
    lastRefreshRef.current = 0 // Reset debounce for manual refresh
    await Promise.all([fetchProducts(true), fetchCategories(), fetchSettings()])
  }

  const filtered = products.filter((p) => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase())
    const matchCat = filterCat === 'all' || p.category?.id === filterCat
    return matchSearch && matchCat
  })

  const inStockProducts = filtered.filter(p => p.quantity > 0)
  const outOfStockProducts = filtered.filter(p => p.quantity <= 0)

  const addToCart = (product: Product) => {
    if (product.quantity <= 0) {
      toast.error('This product is out of stock')
      return
    }
    const existing = cart.find((c) => c.product.id === product.id)
    if (existing) {
      if (existing.quantity >= product.quantity) {
        toast.error('Not enough stock')
        return
      }
      setCart(cart.map((c) => c.product.id === product.id ? { ...c, quantity: c.quantity + 1 } : c))
    } else {
      setCart([...cart, { product, quantity: 1, price: product.sellingPrice }])
    }
  }

  const updateQty = (productId: string, delta: number) => {
    setCart(cart.map((c) => {
      if (c.product.id !== productId) return c
      const newQty = c.quantity + delta
      if (newQty <= 0) return c
      if (newQty > c.product.quantity) return c
      return { ...c, quantity: newQty }
    }))
  }

  const removeFromCart = (productId: string) => {
    setCart(cart.filter((c) => c.product.id !== productId))
  }

  const subtotal = cart.reduce((sum, c) => sum + (c.price * c.quantity), 0)
  const total = subtotal - discount

  const completeSale = async () => {
    if (cart.length === 0) {
      toast.error('Cart is empty')
      return
    }

    try {
      const res = await authFetch('/api/sales', {
        method: 'POST',
        body: JSON.stringify({
          items: cart.map((c) => ({
            productId: c.product.id,
            productName: c.product.name,
            quantity: c.quantity,
            price: c.price,
          })),
          customerName: customerName || null,
          customerPhone: customerPhone || null,
          paymentMethod,
          discount,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Sale failed')
        return
      }

      setLastSale(data)
      setCart([])
      setCustomerName('')
      setCustomerPhone('')
      setDiscount(0)
      setReceiptDialog(true)
      toast.success('Sale completed!')

      // Refresh products to update stock levels immediately
      lastRefreshRef.current = 0 // Reset debounce for post-sale refresh
      fetchProducts()
      // Notify all other modules (Dashboard, Reports, Sales Tracking, Inventory) about the new sale
      notifyDataChange('sale-created')
    } catch {
      toast.error('Failed to complete sale')
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[calc(100vh-8rem)]">
      {/* Products Grid */}
      <div className="lg:col-span-2 space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search products..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={filterCat} onValueChange={setFilterCat}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={refreshAll}
            disabled={refreshing}
            title="Refresh products"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <ScrollArea className="h-[calc(100vh-16rem)]">
          {loading ? (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              <div className="text-center">
                <RefreshCw className="h-8 w-8 mx-auto mb-2 animate-spin opacity-50" />
                <p>Loading products...</p>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              <div className="text-center">
                <Package className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p>No products available</p>
                <p className="text-xs mt-1">
                  {products.length === 0
                    ? 'Add products to inventory to start selling'
                    : 'Try adjusting your search or category filter'}
                </p>
                <Button variant="outline" size="sm" className="mt-3" onClick={refreshAll}>
                  <RefreshCw className="h-3 w-3 mr-1" /> Refresh
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 pr-4">
              {/* In-stock products */}
              {inStockProducts.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {inStockProducts.map((product) => (
                    <Card
                      key={product.id}
                      className="cursor-pointer hover:ring-2 hover:ring-amber-400 transition-all"
                      onClick={() => addToCart(product)}
                    >
                      <CardContent className="p-3">
                        <p className="font-medium text-sm truncate">{product.name}</p>
                        <p className="text-xs text-muted-foreground">{product.category?.name}</p>
                        <div className="flex justify-between items-center mt-2">
                          <span className="font-bold text-sm">KES {product.sellingPrice.toLocaleString()}</span>
                          <Badge variant="outline" className="text-xs">{product.quantity} left</Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Out-of-stock products — visible but not clickable */}
              {outOfStockProducts.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2 px-1">Out of Stock</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {outOfStockProducts.map((product) => (
                      <Card
                        key={product.id}
                        className="opacity-50 cursor-not-allowed"
                        onClick={() => addToCart(product)}
                      >
                        <CardContent className="p-3">
                          <p className="font-medium text-sm truncate">{product.name}</p>
                          <p className="text-xs text-muted-foreground">{product.category?.name}</p>
                          <div className="flex justify-between items-center mt-2">
                            <span className="font-bold text-sm">KES {product.sellingPrice.toLocaleString()}</span>
                            <Badge variant="destructive" className="text-xs">Out of stock</Badge>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Cart */}
      <Card className="flex flex-col">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" /> Cart ({cart.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col flex-1 overflow-hidden p-4">
          <ScrollArea className="flex-1 -mx-4 px-4">
            {cart.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Cart is empty</p>
              </div>
            ) : (
              <div className="space-y-3">
                {cart.map((item) => (
                  <div key={item.product.id} className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.product.name}</p>
                      <p className="text-xs text-muted-foreground">KES {item.price.toLocaleString()} each</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => updateQty(item.product.id, -1)}><Minus className="h-3 w-3" /></Button>
                        <span className="text-sm font-medium w-6 text-center">{item.quantity}</span>
                        <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => updateQty(item.product.id, 1)}><Plus className="h-3 w-3" /></Button>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">KES {(item.price * item.quantity).toLocaleString()}</p>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500" onClick={() => removeFromCart(item.product.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          <Separator className="my-3" />

          {/* Customer Info */}
          <div className="space-y-2 mb-3">
            <Input placeholder="Customer name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="h-8 text-sm" />
            <Input placeholder="Customer phone" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className="h-8 text-sm" />
          </div>

          {/* Discount */}
          <div className="flex items-center gap-2 mb-3">
            <Label className="text-xs shrink-0">Discount (KES)</Label>
            <Input type="number" value={discount || ''} onChange={(e) => setDiscount(Number(e.target.value) || 0)} className="h-8 text-sm" />
          </div>

          {/* Totals */}
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span>Subtotal</span><span>KES {subtotal.toLocaleString()}</span></div>
            {discount > 0 && <div className="flex justify-between text-red-600"><span>Discount</span><span>-KES {discount.toLocaleString()}</span></div>}
            <Separator />
            <div className="flex justify-between font-bold text-base"><span>Total</span><span>KES {total.toLocaleString()}</span></div>
          </div>

          {/* Payment */}
          <div className="mt-3 space-y-2">
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="mpesa">M-Pesa</SelectItem>
                <SelectItem value="card">Card</SelectItem>
                <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={completeSale} className="w-full bg-green-600 hover:bg-green-700 text-white" disabled={cart.length === 0}>
              <CreditCard className="h-4 w-4 mr-2" /> Complete Sale
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Receipt Dialog */}
      <Dialog open={receiptDialog} onOpenChange={setReceiptDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Receipt className="h-5 w-5" /> Receipt</DialogTitle>
          </DialogHeader>
          {lastSale && (
            <div className="space-y-3 text-sm">
              <div className="text-center">
                <p className="font-bold text-lg">{shopSettings.shopName.toUpperCase()}</p>
                <p className="text-muted-foreground">Fashion & Beauty Store</p>
              </div>
              <Separator />
              <div className="space-y-1">
                <p>Invoice: {lastSale.invoiceNumber}</p>
                <p>Date: {new Date(lastSale.createdAt).toLocaleString()}</p>
                {lastSale.customerName && <p>Customer: {lastSale.customerName}</p>}
              </div>
              <Separator />
              {lastSale.items?.map((item: any, i: number) => (
                <div key={i} className="flex justify-between">
                  <span>{item.product?.name || 'Item'} x{item.quantity}</span>
                  <span>KES {item.total.toLocaleString()}</span>
                </div>
              ))}
              <Separator />
              <div className="flex justify-between"><span>Subtotal</span><span>KES {lastSale.subtotal?.toLocaleString()}</span></div>
              {lastSale.discount > 0 && <div className="flex justify-between text-red-600"><span>Discount</span><span>-KES {lastSale.discount.toLocaleString()}</span></div>}
              <div className="flex justify-between font-bold text-base"><span>Total</span><span>KES {lastSale.total?.toLocaleString()}</span></div>
              <p className="text-xs text-muted-foreground capitalize">Payment: {lastSale.paymentMethod}</p>
              <Separator />
              <p className="text-center text-xs text-muted-foreground">{shopSettings.receiptFooter}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
