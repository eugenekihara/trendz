import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyAuth } from '@/lib/auth'

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
      where.quantity = { lte: db.product.fields.minStock ? 5 : 5 }
    } else if (stockFilter === 'out') {
      where.quantity = { equals: 0 }
    } else if (stockFilter === 'in') {
      where.quantity = { gt: 0 }
    }

    const [products, total] = await Promise.all([
      db.product.findMany({
        where,
        include: { category: true, supplier: true },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.product.count({ where }),
    ])

    return NextResponse.json({ products, total, page, limit })
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
    const product = await db.product.create({
      data: {
        name: data.name,
        sku: data.sku,
        barcode: data.barcode || null,
        description: data.description || null,
        imageUrl: data.imageUrl || null,
        categoryId: data.categoryId,
        buyingPrice: parseFloat(data.buyingPrice),
        sellingPrice: parseFloat(data.sellingPrice),
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

    return NextResponse.json(product)
  } catch (error: any) {
    console.error('Inventory POST error:', error)
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'SKU already exists' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Failed to create product' }, { status: 500 })
  }
}
