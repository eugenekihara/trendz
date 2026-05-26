import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyAuth } from '@/lib/auth'

// Force dynamic rendering — never cache this route
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const auth = await verifyAuth()
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const categoryId = searchParams.get('categoryId') || ''
    const stockFilter = searchParams.get('stock') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')

    const where: any = { active: true }

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { sku: { contains: search } },
        { barcode: { contains: search } },
      ]
    }

    if (categoryId) {
      where.categoryId = categoryId
    }

    if (stockFilter === 'low') {
      // SQLite doesn't support comparing columns, so fetch products where quantity <= minStock client-side
      // We use a reasonable default threshold; the frontend can further filter
      where.quantity = { gt: 0 }
      // We'll post-filter for low stock after fetching
    } else if (stockFilter === 'out') {
      where.quantity = { equals: 0 }
    } else if (stockFilter === 'in') {
      where.quantity = { gt: 0 }
    }

    let [products, total] = await Promise.all([
      db.product.findMany({
        where,
        include: { category: true, supplier: true },
        orderBy: { updatedAt: 'desc' },
      }),
      db.product.count({ where }),
    ])

    // Post-filter for low stock (quantity > 0 but <= minStock)
    if (stockFilter === 'low') {
      products = products.filter(p => p.quantity > 0 && p.quantity <= p.minStock)
      total = products.length
    }

    // Apply pagination after filtering
    const paginatedProducts = products.slice((page - 1) * limit, page * limit)

    return NextResponse.json(
      { products: paginatedProducts, total, page, limit },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    )
  } catch (error) {
    console.error('Inventory GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch inventory' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await verifyAuth('admin')
    if (!auth.authenticated || auth.error) {
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 403 })
    }

    const data = await request.json()

    // Validate required fields
    if (!data.name?.trim() || !data.sku?.trim() || !data.categoryId) {
      return NextResponse.json({ error: 'Product name, SKU, and category are required' }, { status: 400 })
    }

    const buyingPrice = parseFloat(data.buyingPrice)
    const sellingPrice = parseFloat(data.sellingPrice)
    if (isNaN(buyingPrice) || isNaN(sellingPrice) || buyingPrice < 0 || sellingPrice < 0) {
      return NextResponse.json({ error: 'Valid buying and selling prices are required' }, { status: 400 })
    }

    const product = await db.product.create({
      data: {
        name: data.name.trim(),
        sku: data.sku.trim(),
        barcode: data.barcode || null,
        description: data.description || null,
        imageUrl: data.imageUrl || null,
        categoryId: data.categoryId,
        buyingPrice,
        sellingPrice,
        quantity: parseInt(data.quantity) || 0,
        minStock: parseInt(data.minStock) || 5,
        brand: data.brand || null,
        size: data.size || null,
        color: data.color || null,
        fragrance: data.fragrance || null,
        supplierId: data.supplierId || null,
      },
      include: { category: true, supplier: true },
    })

    // Create stock move for initial quantity
    if (product.quantity > 0) {
      await db.stockMove.create({
        data: {
          productId: product.id,
          type: 'in',
          quantity: product.quantity,
          reason: 'Initial stock',
        },
      })
    }

    return NextResponse.json(product, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
  } catch (error: any) {
    console.error('Inventory POST error:', error)
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'SKU already exists' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Failed to create product' }, { status: 500 })
  }
}
