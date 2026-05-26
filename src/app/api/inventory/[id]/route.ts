import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyAuth } from '@/lib/auth'

// Force dynamic rendering — never cache this route
export const dynamic = 'force-dynamic'

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await verifyAuth('admin')
    if (!auth.authenticated || auth.error) {
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 403 })
    }

    const { id } = await params
    const data = await request.json()

    // Validate numeric fields if provided
    if (data.buyingPrice !== undefined) {
      const buyingPrice = parseFloat(data.buyingPrice)
      if (isNaN(buyingPrice) || buyingPrice < 0) {
        return NextResponse.json({ error: 'Valid buying price is required' }, { status: 400 })
      }
    }
    if (data.sellingPrice !== undefined) {
      const sellingPrice = parseFloat(data.sellingPrice)
      if (isNaN(sellingPrice) || sellingPrice < 0) {
        return NextResponse.json({ error: 'Valid selling price is required' }, { status: 400 })
      }
    }

    const updateData: any = {
      name: data.name?.trim(),
      sku: data.sku?.trim(),
      barcode: data.barcode || null,
      description: data.description || null,
      imageUrl: data.imageUrl || null,
      categoryId: data.categoryId,
      buyingPrice: data.buyingPrice !== undefined ? parseFloat(data.buyingPrice) : undefined,
      sellingPrice: data.sellingPrice !== undefined ? parseFloat(data.sellingPrice) : undefined,
      minStock: data.minStock !== undefined ? (parseInt(data.minStock) || 5) : undefined,
      brand: data.brand || null,
      size: data.size || null,
      color: data.color || null,
      fragrance: data.fragrance || null,
      supplierId: data.supplierId || null,
      active: data.active !== undefined ? data.active : undefined,
    }

    // Remove undefined values so Prisma doesn't try to set them to undefined
    Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key])

    // ─── Handle quantity change with stockMove audit trail ───
    // If quantity is being changed, we need to track the adjustment
    if (data.quantity !== undefined) {
      const newQuantity = parseInt(data.quantity)
      if (!isNaN(newQuantity) && newQuantity >= 0) {
        // Fetch current product to compare quantities
        const currentProduct = await db.product.findUnique({
          where: { id },
          select: { quantity: true, name: true },
        })

        if (currentProduct) {
          const diff = newQuantity - currentProduct.quantity
          if (diff !== 0) {
            // Create a stock move to audit the quantity change
            await db.stockMove.create({
              data: {
                productId: id,
                type: diff > 0 ? 'in' : 'out',
                quantity: Math.abs(diff),
                reason: `Stock adjustment (${currentProduct.name}: ${currentProduct.quantity} → ${newQuantity})`,
                reference: 'inventory-edit',
              },
            })
          }
        }

        updateData.quantity = newQuantity
      }
    }

    const product = await db.product.update({
      where: { id },
      data: updateData,
      include: { category: true, supplier: true },
    })

    return NextResponse.json(product, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    })
  } catch (error: any) {
    console.error('Inventory PUT error:', error)
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'SKU already exists' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Failed to update product' }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await verifyAuth('admin')
    if (!auth.authenticated || auth.error) {
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 403 })
    }

    const { id } = await params
    await db.product.update({ where: { id }, data: { active: false } })

    return NextResponse.json({ success: true }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    })
  } catch (error) {
    console.error('Inventory DELETE error:', error)
    return NextResponse.json({ error: 'Failed to delete product' }, { status: 500 })
  }
}
