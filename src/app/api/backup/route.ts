import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyAuth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const auth = await verifyAuth('admin')
    if (!auth.authenticated || auth.error) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
    }

    const [users, categories, products, suppliers, sales, saleItems, salesEntries, settings, notifications, auditLogs] = await Promise.all([
      db.user.findMany({ select: { id: true, email: true, name: true, role: true, avatar: true, phone: true, active: true, theme: true, language: true, notifySales: true, notifyInventory: true, notifyTasks: true, createdAt: true, updatedAt: true } }),
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
    }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
  } catch (error) {
    console.error('Backup GET error:', error)
    return NextResponse.json({ error: 'Failed to export backup' }, { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await verifyAuth('admin')
    if (!auth.authenticated || auth.error) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
    }

    const backup = await request.json()
    if (!backup.data) {
      return NextResponse.json({ error: 'Invalid backup data' }, { status: 400, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
    }

    // Clear existing data and restore in a transaction for atomicity
    const { users, categories, products, suppliers, sales, saleItems, salesEntries, settings, notifications } = backup.data

    await db.$transaction(async (tx) => {
      // Delete in order of dependencies
      await tx.auditLog.deleteMany()
      await tx.stockMove.deleteMany()
      await tx.salesEntry.deleteMany()
      await tx.saleItem.deleteMany()
      await tx.sale.deleteMany()
      await tx.notification.deleteMany()
      await tx.product.deleteMany()
      await tx.purchaseOrder.deleteMany()
      await tx.supplier.deleteMany()
      await tx.category.deleteMany()
      await tx.setting.deleteMany()
      await tx.user.deleteMany()

      // Restore in order
      if (users?.length) await tx.user.createMany({ data: users })
      if (categories?.length) await tx.category.createMany({ data: categories })
      if (suppliers?.length) await tx.supplier.createMany({ data: suppliers })
      if (settings?.length) await tx.setting.createMany({ data: settings })
      if (products?.length) await tx.product.createMany({ data: products })
      if (sales?.length) await tx.sale.createMany({ data: sales })
      if (saleItems?.length) await tx.saleItem.createMany({ data: saleItems })
      if (salesEntries?.length) await tx.salesEntry.createMany({ data: salesEntries })
      if (notifications?.length) await tx.notification.createMany({ data: notifications })
    })

    return NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
  } catch (error) {
    console.error('Backup POST error:', error)
    return NextResponse.json({ error: 'Failed to restore backup' }, { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
  }
}
