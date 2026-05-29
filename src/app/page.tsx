'use client'

import { useEffect, useState } from 'react'
import { useAppStore } from '@/store'
import { Login } from '@/components/app/login'
import { Register } from '@/components/app/register'
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
import { CreditManagement } from '@/components/app/credit-management'

type AppView = 'loading' | 'setup' | 'login' | 'register' | 'app'

export default function Home() {
  const user = useAppStore((s) => s.user)
  const login = useAppStore((s) => s.login)
  const currentPage = useAppStore((s) => s.currentPage)
  const [view, setView] = useState<AppView>('loading')

  // Check if system needs initial setup AND try to restore session from cookie
  useEffect(() => {
    const initializeApp = async () => {
      try {
        // First, check if there's an existing session
        const sessionRes = await fetch('/api/auth/session', { cache: 'no-store' })
        if (sessionRes.ok) {
          const sessionData = await sessionRes.json()
          if (sessionData.authenticated && sessionData.user) {
            // Restore session from cookie
            login(sessionData.user)
            return // login() will trigger the user state change, which shows the app
          }
        }

        // No valid session — check if system needs setup
        const setupRes = await fetch('/api/setup', { cache: 'no-store' })
        if (setupRes.ok) {
          const setupData = await setupRes.json()
          setView(setupData.initialized ? 'login' : 'setup')
        } else {
          setView('login')
        }
      } catch {
        setView('login')
      }
    }
    initializeApp()
  }, [login])

  // If user is logged in, show the app
  if (user) {
    const renderPage = () => {
      switch (currentPage) {
        case 'dashboard':
          return <Dashboard />
        case 'inventory':
          return <Inventory />
        case 'sales-pos':
          return <SalesPOS />
        case 'sales-tracking':
          return <SalesTracking />
        case 'suppliers':
          return user.role === 'admin' ? <Suppliers /> : <Dashboard />
        case 'credits':
          return <CreditManagement />
        case 'reports':
          return user.role === 'admin' ? <Reports /> : <Dashboard />
        case 'settings':
          return user.role === 'admin' ? <Settings /> : <StaffSettings />
        case 'staff-settings':
          return <StaffSettings />
        case 'notifications':
          return <Notifications />
        default:
          return <Dashboard />
      }
    }

    return (
      <AppLayout>
        <div key={currentPage}>
          {renderPage()}
        </div>
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

  // Registration page
  if (view === 'register') {
    return <Register onSwitchToLogin={() => setView('login')} />
  }

  // Login screen
  return <Login onSwitchToRegister={() => setView('register')} />
}
