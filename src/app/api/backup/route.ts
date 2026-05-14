import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyAuth } from '@/lib/auth'

export async function GET() {
  try {
    const auth = await verifyAuth('admin')
    if (!auth.authenticated || auth.error) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const [users, categories, products, suppliers, sales, saleItems, salesEntries, settings, notifications, auditLogs] = await Promise.all([
      db.user.findMany(),
      db.category.findMany(),
      db.product.findMany(),
      db.supplier.findMany(),
      db.sale.findMany(),
      db.saleItem.findMany(),
      db.salesEntry.findMany(),
      db.setting.findMany(),
      db.notification.findMany(),
      db.auditLog.findMany(),
    ])

    return NextResponse.json({
      exportDate: new Date().toISOString(),
      version: '1.0',
      data: { users, categories, products, suppliers, sales, saleItems, salesEntries, settings, notifications, auditLogs },
    })
  } catch (error) {
    console.error('Backup GET error:', error)
    return NextResponse.json({ error: 'Failed to export backup' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await verifyAuth('admin')
    if (!auth.authenticated || auth.error) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const backup = await request.json()
    if (!backup.data) {
      return NextResponse.json({ error: 'Invalid backup data' }, { status: 400 })
    }

    // Clear existing data and restore
    const { users, categories, products, suppliers, sales, saleItems, salesEntries, settings, notifications } = backup.data

    // Delete in order of dependencies
    await db.auditLog.deleteMany()
    await db.stockMove.deleteMany()
    await db.salesEntry.deleteMany()
    await db.saleItem.deleteMany()
    await db.sale.deleteMany()
    await db.notification.deleteMany()
    await db.product.deleteMany()
    await db.purchaseOrder.deleteMany()
    await db.supplier.deleteMany()
    await db.category.deleteMany()
    await db.setting.deleteMany()
    await db.user.deleteMany()

    // Restore in order
    if (users?.length) await db.user.createMany({ data: users })
    if (categories?.length) await db.category.createMany({ data: categories })
    if (suppliers?.length) await db.supplier.createMany({ data: suppliers })
    if (settings?.length) await db.setting.createMany({ data: settings })
    if (products?.length) await db.product.createMany({ data: products })
    if (sales?.length) await db.sale.createMany({ data: sales })
    if (saleItems?.length) await db.saleItem.createMany({ data: saleItems })
    if (salesEntries?.length) await db.salesEntry.createMany({ data: salesEntries })
    if (notifications?.length) await db.notification.createMany({ data: notifications })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Backup POST error:', error)
    return NextResponse.json({ error: 'Failed to restore backup' }, { status: 500 })
  }
}
