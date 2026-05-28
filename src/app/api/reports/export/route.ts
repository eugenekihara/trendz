import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyAuth } from '@/lib/auth'

// Force dynamic rendering — never cache this route
export const dynamic = 'force-dynamic'

/**
 * GET /api/reports/export - Export report data in various formats
 * Query params:
 *   format: 'pdf' | 'xlsx' | 'csv' (required)
 *   period: 'week' | 'month' | 'year' (default: 'month')
 *   startDate: ISO date string (overrides period)
 *   endDate: ISO date string (overrides period)
 */
export async function GET(request: Request) {
  try {
    const auth = await verifyAuth(['admin', 'staff'])
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const isAdmin = auth.user?.role === 'admin'
    const userId = auth.user!.id

    const { searchParams } = new URL(request.url)
    const format = searchParams.get('format') || 'csv'
    const period = searchParams.get('period') || 'month'
    const customStartDate = searchParams.get('startDate')
    const customEndDate = searchParams.get('endDate')

    // Calculate date range
    const now = new Date()
    let startDate: Date
    let endDate: Date = now

    if (customStartDate && customEndDate) {
      startDate = new Date(customStartDate)
      endDate = new Date(customEndDate)
      endDate.setHours(23, 59, 59, 999)
    } else {
      switch (period) {
        case 'week': {
          startDate = new Date(now)
          startDate.setDate(now.getDate() - 6)
          startDate.setHours(0, 0, 0, 0)
          break
        }
        case 'year': {
          startDate = new Date(now.getFullYear(), 0, 1)
          break
        }
        case 'month':
        default: {
          startDate = new Date(now.getFullYear(), now.getMonth(), 1)
          break
        }
      }
    }

    const saleDateFilter: any = { createdAt: { gte: startDate, lte: endDate } }
    const entryDateFilter: any = { date: { gte: startDate, lte: endDate } }
    const creditDateFilter: any = { createdAt: { gte: startDate, lte: endDate } }

    const saleWhere = isAdmin ? saleDateFilter : { ...saleDateFilter, userId }
    const entryWhere = isAdmin ? entryDateFilter : { ...entryDateFilter, userId }
    const creditWhere = isAdmin ? creditDateFilter : { ...creditDateFilter, userId }

    // ─── Fetch all report data ───
    const posSales = await db.sale.findMany({
      where: saleWhere,
      include: {
        user: { select: { name: true } },
        items: { include: { product: { select: { name: true, category: { select: { name: true } } } } } },
      },
      orderBy: { createdAt: 'desc' },
    })

    const manualEntries = await db.salesEntry.findMany({
      where: { source: 'manual', ...entryWhere },
      include: { user: { select: { name: true } } },
      orderBy: { date: 'desc' },
    })

    const creditEntries = await db.salesEntry.findMany({
      where: { source: 'credit', ...entryWhere },
      include: { user: { select: { name: true } } },
      orderBy: { date: 'desc' },
    })

    const creditOrders = await db.creditOrder.findMany({
      where: creditWhere,
      include: {
        user: { select: { name: true } },
        items: { include: { product: { select: { name: true } } } },
        payments: { include: { user: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    })

    const posRevenue = posSales.reduce((sum, s) => sum + (s.total || 0), 0)
    const manualRevenue = manualEntries.reduce((sum, e) => sum + (e.amount || 0), 0)
    const creditRevenue = creditEntries.reduce((sum, e) => sum + (e.amount || 0), 0)
    const totalRevenue = posRevenue + manualRevenue + creditRevenue
    const totalSales = posSales.length + manualEntries.length + creditEntries.length

    const salesByPayment = await db.sale.groupBy({
      by: ['paymentMethod'],
      _sum: { total: true },
      _count: true,
      where: saleWhere,
    })

    const periodLabel = period === 'week' ? 'This Week' : period === 'year' ? 'This Year' : 'This Month'
    const dateRange = `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`

    // ─── Build flat transaction rows ───
    const transactions: any[] = []

    for (const sale of posSales) {
      const itemNames = sale.items?.map((i: any) => i.product?.name || 'Unknown').join(', ') || 'N/A'
      transactions.push({
        date: sale.createdAt ? new Date(sale.createdAt).toISOString().split('T')[0] : '',
        type: 'POS',
        customer: sale.customerName || '-',
        items: itemNames,
        quantity: sale.items?.reduce((s: number, i: any) => s + (i.quantity || 0), 0) || 0,
        total: sale.total || 0,
        discount: sale.discount || 0,
        paymentMethod: sale.paymentMethod || 'cash',
        employee: sale.user?.name || '-',
      })
    }

    for (const entry of manualEntries) {
      transactions.push({
        date: entry.date ? new Date(entry.date).toISOString().split('T')[0] : '',
        type: 'Manual',
        customer: '-',
        items: entry.productName || 'Unknown',
        quantity: entry.quantity || 0,
        total: entry.amount || 0,
        discount: 0,
        paymentMethod: 'manual',
        employee: entry.user?.name || '-',
      })
    }

    for (const entry of creditEntries) {
      transactions.push({
        date: entry.date ? new Date(entry.date).toISOString().split('T')[0] : '',
        type: 'Credit',
        customer: '-',
        items: entry.productName || 'Unknown',
        quantity: entry.quantity || 0,
        total: entry.amount || 0,
        discount: 0,
        paymentMethod: 'credit',
        employee: entry.user?.name || '-',
      })
    }

    transactions.sort((a, b) => b.date.localeCompare(a.date))

    // Employee breakdown
    const employeeMap: Record<string, { sales: number; revenue: number }> = {}
    for (const tx of transactions) {
      const emp = tx.employee || 'Unknown'
      if (!employeeMap[emp]) employeeMap[emp] = { sales: 0, revenue: 0 }
      employeeMap[emp].sales++
      employeeMap[emp].revenue += tx.total
    }
    const employeeBreakdown = Object.entries(employeeMap).map(([name, data]) => ({
      employee: name,
      sales: data.sales,
      revenue: data.revenue,
    }))

    const exportMeta = {
      totalSales, totalRevenue, posRevenue, manualRevenue, creditRevenue,
      periodLabel, dateRange, salesByPayment, creditOrders,
    }

    if (format === 'csv') return exportCSV(transactions, employeeBreakdown, exportMeta)
    if (format === 'xlsx') return exportXLSX(transactions, employeeBreakdown, exportMeta)
    if (format === 'pdf') return exportPDF(transactions, employeeBreakdown, exportMeta)

    return NextResponse.json({ error: 'Invalid format. Use pdf, xlsx, or csv.' }, { status: 400 })
  } catch (error) {
    console.error('Report export error:', error)
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 })
  }
}

// ─── CSV Export ───
function exportCSV(transactions: any[], employeeBreakdown: any[], meta: any): NextResponse {
  const lines: string[] = []

  lines.push('TRENDZ BUSINESS REPORT')
  lines.push(`Period,${meta.periodLabel}`)
  lines.push(`Date Range,${meta.dateRange}`)
  lines.push(`Generated,"${new Date().toLocaleString()}"`)
  lines.push('')
  lines.push('SUMMARY')
  lines.push('Metric,Value')
  lines.push(`Total Sales,${meta.totalSales}`)
  lines.push(`Total Revenue,KES ${meta.totalRevenue.toLocaleString()}`)
  lines.push(`POS Revenue,KES ${meta.posRevenue.toLocaleString()}`)
  lines.push(`Manual Revenue,KES ${meta.manualRevenue.toLocaleString()}`)
  lines.push(`Credit Revenue,KES ${meta.creditRevenue.toLocaleString()}`)
  lines.push('')
  lines.push('PAYMENT METHODS')
  lines.push('Method,Count,Total (KES)')
  for (const pm of meta.salesByPayment || []) {
    lines.push(`${pm.paymentMethod || 'unknown'},${pm._count || 0},${(pm._sum?.total || 0).toLocaleString()}`)
  }
  lines.push('')
  lines.push('EMPLOYEE BREAKDOWN')
  lines.push('Employee,Sales,Revenue (KES)')
  for (const emp of employeeBreakdown) {
    lines.push(`"${emp.employee}",${emp.sales},${emp.revenue.toLocaleString()}`)
  }
  lines.push('')
  lines.push('TRANSACTION DETAILS')
  lines.push('Date,Type,Customer,Items,Quantity,Total (KES),Discount (KES),Payment Method,Employee')
  for (const tx of transactions) {
    lines.push(`${tx.date},${tx.type},"${tx.customer}","${tx.items}",${tx.quantity},${tx.total.toLocaleString()},${tx.discount},${tx.paymentMethod},"${tx.employee}"`)
  }

  if (meta.creditOrders && meta.creditOrders.length > 0) {
    lines.push('')
    lines.push('CREDIT ORDERS')
    lines.push('Customer,Phone,Total (KES),Paid (KES),Balance (KES),Status,Due Date,Staff')
    for (const order of meta.creditOrders) {
      lines.push(`"${order.customerName}","${order.customerPhone || ''}",${(order.totalAmount || 0).toLocaleString()},${(order.depositAmount || 0).toLocaleString()},${(order.remainingBalance || 0).toLocaleString()},${order.paymentStatus},${order.dueDate ? new Date(order.dueDate).toLocaleDateString() : '-'},"${order.user?.name || '-'}"`)
    }
  }

  const csvContent = lines.join('\n')
  const filename = `trendz-report-${meta.periodLabel.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.csv`

  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}

// ─── XLSX Export ───
async function exportXLSX(transactions: any[], employeeBreakdown: any[], meta: any): Promise<NextResponse> {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()

  // Summary sheet
  const summaryData = [
    ['TRENDZ BUSINESS REPORT'],
    ['Period', meta.periodLabel],
    ['Date Range', meta.dateRange],
    ['Generated', new Date().toLocaleString()],
    [],
    ['SUMMARY'],
    ['Metric', 'Value'],
    ['Total Sales', meta.totalSales],
    ['Total Revenue (KES)', meta.totalRevenue],
    ['POS Revenue (KES)', meta.posRevenue],
    ['Manual Revenue (KES)', meta.manualRevenue],
    ['Credit Revenue (KES)', meta.creditRevenue],
    [],
    ['PAYMENT METHODS'],
    ['Method', 'Count', 'Total (KES)'],
    ...(meta.salesByPayment || []).map((pm: any) => [pm.paymentMethod || 'unknown', pm._count || 0, pm._sum?.total || 0]),
  ]
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData)
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary')

  // Transactions sheet
  const txData = [
    ['Date', 'Type', 'Customer', 'Items', 'Quantity', 'Total (KES)', 'Discount (KES)', 'Payment Method', 'Employee'],
    ...transactions.map(tx => [tx.date, tx.type, tx.customer, tx.items, tx.quantity, tx.total, tx.discount, tx.paymentMethod, tx.employee]),
  ]
  const wsTransactions = XLSX.utils.aoa_to_sheet(txData)
  wsTransactions['!cols'] = [
    { wch: 12 }, { wch: 8 }, { wch: 20 }, { wch: 30 }, { wch: 10 },
    { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 20 },
  ]
  XLSX.utils.book_append_sheet(wb, wsTransactions, 'Transactions')

  // Employee Breakdown sheet
  const empData = [
    ['Employee', 'Sales Count', 'Revenue (KES)'],
    ...employeeBreakdown.map(emp => [emp.employee, emp.sales, emp.revenue]),
  ]
  const wsEmployees = XLSX.utils.aoa_to_sheet(empData)
  XLSX.utils.book_append_sheet(wb, wsEmployees, 'Employee Breakdown')

  // Credit Orders sheet
  if (meta.creditOrders && meta.creditOrders.length > 0) {
    const creditData = [
      ['Customer', 'Phone', 'Total (KES)', 'Paid (KES)', 'Balance (KES)', 'Status', 'Due Date', 'Staff', 'Created'],
      ...meta.creditOrders.map((order: any) => [
        order.customerName,
        order.customerPhone || '',
        order.totalAmount || 0,
        order.depositAmount || 0,
        order.remainingBalance || 0,
        order.paymentStatus,
        order.dueDate ? new Date(order.dueDate).toLocaleDateString() : '-',
        order.user?.name || '-',
        new Date(order.createdAt).toLocaleDateString(),
      ]),
    ]
    const wsCredits = XLSX.utils.aoa_to_sheet(creditData)
    XLSX.utils.book_append_sheet(wb, wsCredits, 'Credit Orders')
  }

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  const filename = `trendz-report-${meta.periodLabel.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.xlsx`

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}

// ─── PDF Export ───
async function exportPDF(transactions: any[], employeeBreakdown: any[], meta: any): Promise<NextResponse> {
  const { jsPDF } = await import('jspdf')

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 15
  const contentWidth = pageWidth - 2 * margin
  let y = margin

  // Helper: add new page if needed
  const checkPage = (needed = 30) => {
    if (y + needed > doc.internal.pageSize.getHeight() - margin) {
      doc.addPage()
      y = margin
    }
  }

  // Title
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text('TRENDZ', pageWidth / 2, y, { align: 'center' })
  y += 8
  doc.setFontSize(12)
  doc.setFont('helvetica', 'normal')
  doc.text('Business Report', pageWidth / 2, y, { align: 'center' })
  y += 6
  doc.setFontSize(9)
  doc.text(`Period: ${meta.periodLabel} | ${meta.dateRange}`, pageWidth / 2, y, { align: 'center' })
  y += 4
  doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth / 2, y, { align: 'center' })
  y += 10

  // Summary
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.text('Summary', margin, y)
  y += 7
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  const summaryItems = [
    ['Total Sales', `${meta.totalSales}`],
    ['Total Revenue', `KES ${meta.totalRevenue.toLocaleString()}`],
    ['POS Revenue', `KES ${meta.posRevenue.toLocaleString()}`],
    ['Manual Revenue', `KES ${meta.manualRevenue.toLocaleString()}`],
    ['Credit Revenue', `KES ${meta.creditRevenue.toLocaleString()}`],
  ]
  for (const [label, value] of summaryItems) {
    doc.text(`${label}:  ${value}`, margin + 5, y)
    y += 5
  }
  y += 5

  // Payment Methods
  if (meta.salesByPayment && meta.salesByPayment.length > 0) {
    checkPage(30)
    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    doc.text('Payment Methods', margin, y)
    y += 7
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    for (const pm of meta.salesByPayment) {
      doc.text(`${(pm.paymentMethod || 'unknown').toUpperCase()}: ${pm._count || 0} transactions, KES ${(pm._sum?.total || 0).toLocaleString()}`, margin + 5, y)
      y += 5
    }
    y += 5
  }

  // Employee Breakdown
  if (employeeBreakdown.length > 0) {
    checkPage(30)
    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    doc.text('Employee Breakdown', margin, y)
    y += 7

    // Table header
    doc.setFillColor(240, 240, 240)
    doc.rect(margin, y - 3, contentWidth, 7, 'F')
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.text('Employee', margin + 2, y + 1)
    doc.text('Sales', margin + 80, y + 1)
    doc.text('Revenue (KES)', margin + 130, y + 1, { align: 'right' })
    y += 7

    doc.setFont('helvetica', 'normal')
    for (const emp of employeeBreakdown) {
      checkPage()
      doc.text(emp.employee, margin + 2, y + 1)
      doc.text(`${emp.sales}`, margin + 80, y + 1)
      doc.text(`${emp.revenue.toLocaleString()}`, margin + 130, y + 1, { align: 'right' })
      y += 5
    }
    y += 5
  }

  // Transaction Details
  checkPage(30)
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.text('Transaction Details', margin, y)
  y += 7

  // Table header
  doc.setFillColor(240, 240, 240)
  doc.rect(margin, y - 3, contentWidth, 7, 'F')
  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.text('Date', margin + 2, y + 1)
  doc.text('Type', margin + 25, y + 1)
  doc.text('Items', margin + 38, y + 1)
  doc.text('Qty', margin + 110, y + 1, { align: 'right' })
  doc.text('Total', margin + 130, y + 1, { align: 'right' })
  doc.text('Payment', margin + 135, y + 1)
  y += 7

  doc.setFont('helvetica', 'normal')
  const maxTxRows = Math.min(transactions.length, 80)
  for (let i = 0; i < maxTxRows; i++) {
    checkPage()
    const tx = transactions[i]
    doc.text(tx.date, margin + 2, y + 1)
    doc.text(tx.type, margin + 25, y + 1)
    doc.text(tx.items?.substring(0, 35) || '', margin + 38, y + 1)
    doc.text(`${tx.quantity}`, margin + 110, y + 1, { align: 'right' })
    doc.text(`${tx.total.toLocaleString()}`, margin + 130, y + 1, { align: 'right' })
    doc.text(tx.paymentMethod, margin + 135, y + 1)
    y += 4
  }
  if (transactions.length > maxTxRows) {
    y += 3
    doc.setFontSize(7)
    doc.setFont('helvetica', 'italic')
    doc.text(`... and ${transactions.length - maxTxRows} more transactions (export as XLSX or CSV for full data)`, margin, y)
    y += 5
  }

  // Credit Orders
  if (meta.creditOrders && meta.creditOrders.length > 0) {
    doc.addPage()
    y = margin
    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    doc.text('Credit Orders', margin, y)
    y += 7

    // Table header
    doc.setFillColor(240, 240, 240)
    doc.rect(margin, y - 3, contentWidth, 7, 'F')
    doc.setFontSize(8)
    doc.text('Customer', margin + 2, y + 1)
    doc.text('Total', margin + 60, y + 1, { align: 'right' })
    doc.text('Paid', margin + 85, y + 1, { align: 'right' })
    doc.text('Balance', margin + 115, y + 1, { align: 'right' })
    doc.text('Status', margin + 120, y + 1)
    y += 7

    doc.setFont('helvetica', 'normal')
    for (const order of meta.creditOrders) {
      checkPage()
      doc.text(order.customerName?.substring(0, 25) || '', margin + 2, y + 1)
      doc.text(`KES ${(order.totalAmount || 0).toLocaleString()}`, margin + 60, y + 1, { align: 'right' })
      doc.text(`KES ${(order.depositAmount || 0).toLocaleString()}`, margin + 85, y + 1, { align: 'right' })
      doc.text(`KES ${(order.remainingBalance || 0).toLocaleString()}`, margin + 115, y + 1, { align: 'right' })
      doc.text(order.paymentStatus, margin + 120, y + 1)
      y += 5
    }
  }

  // Page numbers
  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'italic')
    doc.text(
      `Trendz Report | Page ${i} of ${totalPages} | Generated ${new Date().toLocaleString()}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 8,
      { align: 'center' }
    )
  }

  const buffer = Buffer.from(doc.output('arraybuffer'))
  const filename = `trendz-report-${meta.periodLabel.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
