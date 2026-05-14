'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAppStore } from '@/store'
import { TrendzLogo } from './trendz-logo'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  TrendingUp,
  Truck,
  BarChart3,
  Settings,
  Bell,
  Menu,
  LogOut,
  UserCog,
  X,
} from 'lucide-react'

interface NavItem {
  id: string
  label: string
  icon: React.ElementType
  adminOnly?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, adminOnly: true },
  { id: 'inventory', label: 'Inventory', icon: Package },
  { id: 'sales-pos', label: 'Sales POS', icon: ShoppingCart },
  { id: 'sales-tracking', label: 'Sales Tracking', icon: TrendingUp },
  { id: 'suppliers', label: 'Suppliers', icon: Truck, adminOnly: true },
  { id: 'reports', label: 'Reports', icon: BarChart3, adminOnly: true },
  { id: 'settings', label: 'Settings', icon: Settings, adminOnly: true },
  { id: 'staff-settings', label: 'My Settings', icon: UserCog, adminOnly: false },
  { id: 'notifications', label: 'Notifications', icon: Bell },
]

interface SidebarContentProps {
  onClose: () => void
  notifCount: number
}

function SidebarContent({ onClose, notifCount }: SidebarContentProps) {
  const user = useAppStore((s) => s.user)
  const currentPage = useAppStore((s) => s.currentPage)
  const setCurrentPage = useAppStore((s) => s.setCurrentPage)
  const logout = useAppStore((s) => s.logout)

  const filteredNav = NAV_ITEMS.filter(
    (item) => !item.adminOnly || user?.role === 'admin'
  )

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-4 flex items-center justify-between">
        <TrendzLogo size="lg" />
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <Separator />

      {/* Navigation */}
      <ScrollArea className="flex-1 px-2 py-4">
        <nav className="space-y-1">
          {filteredNav.map((item) => {
            const isActive = currentPage === item.id
            return (
              <Button
                key={item.id}
                variant={isActive ? 'secondary' : 'ghost'}
                className={`w-full justify-start gap-3 h-10 ${
                  isActive
                    ? 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 font-medium'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => {
                  setCurrentPage(item.id as any)
                  onClose()
                }}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
                {item.id === 'notifications' && notifCount > 0 && (
                  <Badge className="ml-auto h-5 min-w-5 text-xs bg-red-500 text-white">
                    {notifCount}
                  </Badge>
                )}
              </Button>
            )
          })}
        </nav>
      </ScrollArea>

      <Separator />

      {/* User Info */}
      <div className="p-3">
        <div className="flex items-center gap-3 p-2">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 text-xs">
              {user?.name?.split(' ').map((n) => n[0]).join('') || 'U'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.name}</p>
            <p className="text-xs text-muted-foreground truncate capitalize">{user?.role}</p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={logout}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

interface AppLayoutProps {
  children: React.ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  const currentPage = useAppStore((s) => s.currentPage)
  const setCurrentPage = useAppStore((s) => s.setCurrentPage)
  const sidebarOpen = useAppStore((s) => s.sidebarOpen)
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen)
  const [notifCount, setNotifCount] = useState(0)
  const notifCountRef = useRef(0)

  useEffect(() => {
    const fetchNotifCount = async () => {
      try {
        const res = await fetch('/api/notifications')
        if (res.ok) {
          const data = await res.json()
          const count = data.filter((n: any) => !n.read).length
          notifCountRef.current = count
          setNotifCount(count)
        }
      } catch {}
    }

    fetchNotifCount()
    const interval = setInterval(fetchNotifCount, 30000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="min-h-screen flex bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 border-r bg-card flex-col fixed inset-y-0 z-50">
        <SidebarContent onClose={() => {}} notifCount={notifCount} />
      </aside>

      {/* Mobile Sidebar */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="p-0 w-64">
          <SidebarContent onClose={() => setSidebarOpen(false)} notifCount={notifCount} />
        </SheetContent>
      </Sheet>

      {/* Main Content */}
      <main className="flex-1 lg:ml-64">
        {/* Top Bar */}
        <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex h-14 items-center gap-4 px-4">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-lg font-semibold capitalize">
                {currentPage.replace(/-/g, ' ').replace('pos', 'POS')}
              </h1>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="relative"
              onClick={() => setCurrentPage('notifications')}
            >
              <Bell className="h-5 w-5" />
              {notifCount > 0 && (
                <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center">
                  {notifCount}
                </span>
              )}
            </Button>
          </div>
        </header>

        {/* Page Content */}
        <div className="p-4 md:p-6">
          {children}
        </div>
      </main>
    </div>
  )
}
