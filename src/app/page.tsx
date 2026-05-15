'use client'

import { useEffect } from 'react'
import { useAppStore } from '@/store'
import { Login } from '@/components/app/login'
import { AppLayout } from '@/components/app/app-layout'
import { Dashboard } from '@/components/app/dashboard'
import { Inventory } from '@/components/app/inventory'
import { SalesPOS } from '@/components/app/sales-pos'
import { SalesTracking } from '@/components/app/sales-tracking'
import { Suppliers } from '@/components/app/suppliers'
import { Reports } from '@/components/app/reports'
import { Notifications } from '@/components/app/notifications'
import { Settings } from '@/components/app/settings'
import { StaffSettings } from '@/components/app/staff-settings'

export default function Home() {
  const user = useAppStore((s) => s.user)
  const currentPage = useAppStore((s) => s.currentPage)

  // Seed database on first load
  useEffect(() => {
    fetch('/api/seed', { method: 'POST' }).catch(() => {})
  }, [])

  if (!user) {
    return <Login />
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return user.role === 'admin' ? <Dashboard /> : <Inventory />
      case 'inventory':
        return <Inventory />
      case 'sales-pos':
        return <SalesPOS />
      case 'sales-tracking':
        return <SalesTracking />
      case 'suppliers':
        return user.role === 'admin' ? <Suppliers /> : <Inventory />
      case 'reports':
        return user.role === 'admin' ? <Reports /> : <Inventory />
      case 'settings':
        return user.role === 'admin' ? <Settings /> : <StaffSettings />
      case 'staff-settings':
        return <StaffSettings />
      case 'notifications':
        return <Notifications />
      default:
        return user.role === 'admin' ? <Dashboard /> : <Inventory />
    }
  }

  return (
    <AppLayout>
      {renderPage()}
    </AppLayout>
  )
}
