'use client'

import { create } from 'zustand'

interface User {
  id: string
  email: string
  name: string
  role: 'admin' | 'staff'
  avatar?: string | null
  phone?: string | null
}

type ViewPage = 'dashboard' | 'inventory' | 'sales-pos' | 'sales-tracking' | 'suppliers' | 'reports' | 'settings' | 'staff-settings' | 'notifications'

// Data change events that modules can emit to notify other modules
export type DataChangeEvent =
  | 'sale-created'
  | 'sale-deleted'
  | 'product-created'
  | 'product-updated'
  | 'product-deleted'
  | 'inventory-changed'
  | 'category-changed'
  | 'manual-entry-created'

interface AppState {
  user: User | null
  currentPage: ViewPage
  sidebarOpen: boolean
  dataVersion: number

  login: (user: User) => void
  logout: () => void
  setCurrentPage: (page: ViewPage) => void
  setSidebarOpen: (open: boolean) => void
  updateUser: (data: Partial<User>) => void

  authFetch: (url: string, options?: RequestInit) => Promise<Response>

  // Cross-module data synchronization
  notifyDataChange: (event: DataChangeEvent) => void
  onDataChange: (callback: (event: DataChangeEvent) => void) => () => void
}

// External listener registry for data change events
const dataChangeListeners = new Set<(event: DataChangeEvent) => void>()

export const useAppStore = create<AppState>((set, get) => ({
  user: null,
  currentPage: 'dashboard',
  sidebarOpen: false,
  dataVersion: 0,

  login: (user) => set({ user, currentPage: user.role === 'admin' ? 'dashboard' : 'inventory' }),
  logout: () => set({ user: null, currentPage: 'dashboard' }),
  setCurrentPage: (page) => set({ currentPage: page }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  updateUser: (data) => set((state) => ({
    user: state.user ? { ...state.user, ...data } : null,
  })),

  authFetch: async (url, options = {}) => {
    const { user } = get()
    const headers = new Headers(options.headers || {})
    if (user) {
      headers.set('x-user-id', user.id)
      headers.set('x-user-role', user.role)
    }
    if (options.body && typeof options.body === 'string') {
      headers.set('Content-Type', 'application/json')
    }
    // Always fetch fresh data — never use browser cache for API calls
    const cacheOpt = options.cache || 'no-store'
    return fetch(url, { ...options, headers, cache: cacheOpt })
  },

  // Emit a data change event to all subscribers
  notifyDataChange: (event) => {
    // Increment dataVersion to trigger Zustand re-renders for subscribers
    set((state) => ({ dataVersion: state.dataVersion + 1 }))
    // Notify all external listeners (useEffect-based subscribers)
    dataChangeListeners.forEach((cb) => {
      try { cb(event) } catch (e) { console.error('Data change listener error:', e) }
    })
  },

  // Subscribe to data change events. Returns unsubscribe function.
  onDataChange: (callback) => {
    dataChangeListeners.add(callback)
    return () => { dataChangeListeners.delete(callback) }
  },
}))
