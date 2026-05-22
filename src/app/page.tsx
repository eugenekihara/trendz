'use client'

import { useEffect, useState } from 'react'
import { useAppStore } from '@/store'
import { Login } from '@/components/app/login'
import { SetupWizard } from '@/components/app/setup-wizard'
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

type AppView = 'loading' | 'setup' | 'login' | 'app'

export default function Home() {
  const user = useAppStore((s) => s.user)
  const currentPage = useAppStore((s) => s.currentPage)
  const [view, setView] = useState<AppView>('loading')

  // Check if system needs initial setup
  useEffect(() => {
    const checkSetup = async () => {
      try {
        const res = await fetch('/api/setup')
        if (res.ok) {
          const data = await res.json()
          setView(data.initialized ? 'login' : 'setup')
        } else {
          setView('login')
        }
      } catch {
        setView('login')
      }
    }
    checkSetup()
  }, [])

  // If user is logged in, show the app
  if (user) {
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

  // Loading state
  if (view === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 via-white to-orange-50 dark:from-gray-950 dark:via-gray-900 dark:to-amber-950">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-700 mx-auto mb-3" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  // Setup wizard for first-time users
  if (view === 'setup') {
    return <SetupWizard />
  }

  // Login screen
  return <Login />
}
