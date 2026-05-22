import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyAuth } from '@/lib/auth'

export async function GET() {
  try {
    const auth = await verifyAuth('admin')
    if (!auth.authenticated || auth.error) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const suppliers = await db.supplier.findMany({
      where: { active: true },
      include: { _count: { select: { products: { where: { active: true } } } } },
      orderBy: { name: 'asc' },
    })
    return NextResponse.json(suppliers)
  } catch (error) {
    console.error('Suppliers GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch suppliers' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await verifyAuth('admin')
    if (!auth.authenticated || auth.error) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const data = await request.json()

    if (!data.name?.trim()) {
      return NextResponse.json({ error: 'Supplier name is required' }, { status: 400 })
    }

    const supplier = await db.supplier.create({
      data: {
        name: data.name.trim(),
        email: data.email || null,
        phone: data.phone || null,
        address: data.address || null,
        city: data.city || null,
        country: data.country || null,
        notes: data.notes || null,
      },
    })

    return NextResponse.json(supplier)
  } catch (error) {
    console.error('Suppliers POST error:', error)
    return NextResponse.json({ error: 'Failed to create supplier' }, { status: 500 })
  }
}
