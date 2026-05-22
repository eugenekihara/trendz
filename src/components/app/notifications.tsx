'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '@/store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Bell, BellOff, Check, Package, AlertTriangle, Info } from 'lucide-react'
import { toast } from 'sonner'

const typeIcons: Record<string, React.ElementType> = {
  low_stock: AlertTriangle,
  sale: Info,
  info: Info,
  system: Package,
}

const typeColors: Record<string, string> = {
  low_stock: 'text-yellow-600 bg-yellow-50 dark:bg-yellow-950',
  sale: 'text-green-600 bg-green-50 dark:bg-green-950',
  info: 'text-blue-600 bg-blue-50 dark:bg-blue-950',
  system: 'text-amber-700 bg-amber-50 dark:bg-amber-950',
}

export function Notifications() {
  const authFetch = useAppStore((s) => s.authFetch)
  const [notifications, setNotifications] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const fetchNotifs = useCallback(async () => {
    try {
      const res = await authFetch('/api/notifications')
      if (res.ok) setNotifications(await res.json())
    } catch {} finally {
      setLoading(false)
    }
  }, [authFetch])

  useEffect(() => { fetchNotifs() }, [fetchNotifs])

  const markRead = async (id?: string) => {
    try {
      const res = await authFetch('/api/notifications', {
        method: 'PUT',
        body: JSON.stringify(id ? { id } : { markAll: true }),
      })
      if (res.ok) {
        toast.success(id ? 'Marked as read' : 'All marked as read')
        fetchNotifs()
      }
    } catch {}
  }

  const unread = notifications.filter((n) => !n.read)

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          <h2 className="text-lg font-semibold">Notifications</h2>
          {unread.length > 0 && <Badge className="bg-red-500 text-white">{unread.length} new</Badge>}
        </div>
        {unread.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => markRead()}>
            <Check className="h-4 w-4 mr-1" /> Mark all read
          </Button>
        )}
      </div>

      <ScrollArea className="h-[calc(100vh-14rem)]">
        <div className="space-y-2">
          {notifications.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <BellOff className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p>No notifications</p>
              </CardContent>
            </Card>
          ) : (
            notifications.map((n) => {
              const Icon = typeIcons[n.type] || Bell
              const color = typeColors[n.type] || 'text-gray-600 bg-gray-50'
              return (
                <Card key={n.id} className={`transition-all ${!n.read ? 'border-l-4 border-l-amber-600' : 'opacity-75'}`}>
                  <CardContent className="p-3 flex items-start gap-3">
                    <div className={`p-2 rounded-full ${color}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-sm">{n.title}</p>
                        <span className="text-xs text-muted-foreground">{new Date(n.createdAt).toLocaleString()}</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">{n.message}</p>
                    </div>
                    {!n.read && (
                      <Button variant="ghost" size="sm" onClick={() => markRead(n.id)}>
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )
            })
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
