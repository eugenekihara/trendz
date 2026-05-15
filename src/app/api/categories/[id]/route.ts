import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyAuth } from '@/lib/auth'

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await verifyAuth('admin')
    if (!auth.authenticated || auth.error) {
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 403 })
    }

    const { id } = await params
    const data = await request.json()

    if (data.name) {
      const existing = await db.category.findFirst({
        where: { name: { equals: data.name.trim(), mode: 'insensitive' }, id: { not: id } },
      })
      if (existing) {
        return NextResponse.json({ error: 'Category name already exists' }, { status: 400 })
      }
    }

    const category = await db.category.update({
      where: { id },
      data: {
        name: data.name?.trim(),
        description: data.description?.trim() || null,
        icon: data.icon || null,
      },
    })

    await db.auditLog.create({
      data: {
        userId: auth.user!.id,
        userName: auth.user!.name,
        action: 'UPDATE',
        entity: 'Category',
        entityId: id,
        details: `Updated category: ${category.name}`,
      },
    })

    return NextResponse.json(category)
  } catch (error) {
    console.error('Category PUT error:', error)
    return NextResponse.json({ error: 'Failed to update category' }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await verifyAuth('admin')
    if (!auth.authenticated || auth.error) {
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 403 })
    }

    const { id } = await params
    const { searchParams } = new URL(request.url)
    const reassignTo = searchParams.get('reassignTo')

    const productCount = await db.product.count({
      where: { categoryId: id, active: true },
    })

    if (productCount > 0 && !reassignTo) {
      return NextResponse.json({
        error: 'Category has active products',
        productCount,
        requiresReassignment: true,
      }, { status: 400 })
    }

    if (productCount > 0 && reassignTo) {
      await db.product.updateMany({
        where: { categoryId: id },
        data: { categoryId: reassignTo },
      })
    }

    await db.category.delete({ where: { id } })

    await db.auditLog.create({
      data: {
        userId: auth.user!.id,
        userName: auth.user!.name,
        action: 'DELETE',
        entity: 'Category',
        entityId: id,
        details: `Deleted category${reassignTo ? `, products reassigned to ${reassignTo}` : ''}`,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Category DELETE error:', error)
    return NextResponse.json({ error: 'Failed to delete category' }, { status: 500 })
  }
}
