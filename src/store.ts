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

interface AppState {
  user: User | null
  currentPage: ViewPage
  sidebarOpen: boolean

  login: (user: User) => void
  logout: () => void
  setCurrentPage: (page: ViewPage) => void
  setSidebarOpen: (open: boolean) => void
  updateUser: (data: Partial<User>) => void

  authFetch: (url: string, options?: RequestInit) => Promise<Response>
}

export const useAppStore = create<AppState>((set, get) => ({
  user: null,
  currentPage: 'dashboard',
  sidebarOpen: false,

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
    // This ensures newly created products, sales, etc. are immediately visible
    const cacheOpt = options.cache || 'no-store'
    return fetch(url, { ...options, headers, cache: cacheOpt })
  },
}))
