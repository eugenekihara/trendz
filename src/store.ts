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

// Debounce map: coalesce rapid-fire events of the same type within a window
const debounceTimers = new Map<DataChangeEvent, ReturnType<typeof setTimeout>>()
const DEBOUNCE_MS = 150 // ms — fast enough to feel instant, slow enough to coalesce rapid events

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

  // Emit a data change event to all subscribers (debounced to prevent rapid re-fetches)
  notifyDataChange: (event) => {
    // Always increment dataVersion immediately so Zustand subscribers react
    set((state) => ({ dataVersion: state.dataVersion + 1 }))

    // Debounce the listener notification to coalesce rapid events
    const existing = debounceTimers.get(event)
    if (existing) clearTimeout(existing)

    const timer = setTimeout(() => {
      debounceTimers.delete(event)
      dataChangeListeners.forEach((cb) => {
        try { cb(event) } catch (e) { console.error('Data change listener error:', e) }
      })
    }, DEBOUNCE_MS)

    debounceTimers.set(event, timer)
  },

  // Subscribe to data change events. Returns unsubscribe function.
  onDataChange: (callback) => {
    dataChangeListeners.add(callback)
    return () => { dataChangeListeners.delete(callback) }
  },
}))
