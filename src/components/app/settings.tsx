'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAppStore, DataChangeEvent } from '@/store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { TrendzLogo } from './trendz-logo'
import { Settings as SettingsIcon, Building2, Users, Shield, Package, ShoppingCart, BarChart3, Bell, Lock, Database, Palette, FileText, Info, Plus, Edit2, Trash2, Download, Upload, AlertTriangle, RefreshCw, UserCheck, UserX, Clock, CheckCircle2, XCircle } from 'lucide-react'
import { toast } from 'sonner'

// Events that should trigger a Settings refresh
const SETTINGS_REFRESH_EVENTS: DataChangeEvent[] = [
  'user-changed',
  'settings-changed',
]

export function Settings() {
  const authFetch = useAppStore((s) => s.authFetch)
  const notifyDataChange = useAppStore((s) => s.notifyDataChange)
  const onDataChange = useAppStore((s) => s.onDataChange)
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [users, setUsers] = useState<any[]>([])
  const [auditLogs, setAuditLogs] = useState<any[]>([])
  const [userDialog, setUserDialog] = useState(false)
  const [editingUser, setEditingUser] = useState<any>(null)
  const [userForm, setUserForm] = useState({ name: '', email: '', password: '', role: 'staff', phone: '' })
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Approval state
  const [approvalData, setApprovalData] = useState<{ users: any[], summary: { pending: number, approved: number, rejected: number } }>({ users: [], summary: { pending: 0, approved: 0, rejected: 0 } })
  const [approvalFilter, setApprovalFilter] = useState<string>('pending')
  const [approvalLoading, setApprovalLoading] = useState(false)

  const loadAll = useCallback(async (showRefresh = false) => {
    try {
      if (showRefresh) setRefreshing(true)
      const [settingsRes, usersRes, logsRes, approvalsRes] = await Promise.all([
        authFetch('/api/settings'),
        authFetch('/api/users'),
        authFetch('/api/audit-logs'),
        authFetch('/api/users/approvals?status=pending'),
      ])
      if (settingsRes.ok) setSettings(await settingsRes.json())
      if (usersRes.ok) setUsers(await usersRes.json())
      if (logsRes.ok) setAuditLogs(await logsRes.json())
      if (approvalsRes.ok) {
        const approvalResult = await approvalsRes.json()
        setApprovalData(prev => ({
          ...prev,
          summary: {
            ...prev.summary,
            pending: approvalResult.summary?.pending ?? 0,
          },
        }))
      }
    } catch {
      toast.error('Failed to load settings')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [authFetch])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // Refresh data when tab becomes visible (covers SPA navigation)
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') loadAll()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [loadAll])

  // Subscribe to cross-module data changes for instant refresh
  useEffect(() => {
    const unsubscribe = onDataChange((event: DataChangeEvent) => {
      if (SETTINGS_REFRESH_EVENTS.includes(event)) {
        loadAll()
      }
    })
    return unsubscribe
  }, [onDataChange, loadAll])

  // Load approval data
  const loadApprovals = useCallback(async (filter?: string) => {
    try {
      setApprovalLoading(true)
      const statusParam = filter || approvalFilter
      const res = await authFetch(`/api/users/approvals${statusParam ? `?status=${statusParam}` : ''}`)
      if (res.ok) {
        setApprovalData(await res.json())
      }
    } catch {
      toast.error('Failed to load approval data')
    } finally {
      setApprovalLoading(false)
    }
  }, [authFetch, approvalFilter])

  // Handle approval action (approve/reject)
  const handleApproval = async (userId: string, action: 'approve' | 'reject') => {
    try {
      const res = await authFetch('/api/users/approvals', {
        method: 'PUT',
        body: JSON.stringify({ userId, action }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || `Failed to ${action} user`)
        return
      }
      toast.success(data.message || `User ${action === 'approve' ? 'approved' : 'rejected'} successfully`)
      // Refresh approvals and users lists
      loadApprovals()
      const usersRes2 = await authFetch('/api/users')
      if (usersRes2.ok) setUsers(await usersRes2.json())
      notifyDataChange('user-changed')
    } catch {
      toast.error(`Failed to ${action} user`)
    }
  }

  const updateSetting = async (key: string, value: string) => {
    try {
      const res = await authFetch('/api/settings', { method: 'PUT', body: JSON.stringify({ [key]: value }) })
      if (res.ok) {
        setSettings({ ...settings, [key]: value })
        toast.success('Setting updated')
        // Notify all other modules about settings change (currency, shop name, receipt footer, etc.)
        notifyDataChange('settings-changed')
      }
    } catch { toast.error('Failed to update') }
  }

  const openUserDialog = (user?: any) => {
    if (user) {
      setEditingUser(user)
      setUserForm({ name: user.name, email: user.email, password: '', role: user.role, phone: user.phone || '' })
    } else {
      setEditingUser(null)
      setUserForm({ name: '', email: '', password: '', role: 'staff', phone: '' })
    }
    setUserDialog(true)
  }

  const saveUser = async () => {
    try {
      const url = editingUser ? `/api/users/${editingUser.id}` : '/api/users'
      const method = editingUser ? 'PUT' : 'POST'
      const res = await authFetch(url, { method, body: JSON.stringify(userForm) })
      if (!res.ok) { const d = await res.json(); toast.error(d.error); return }
      toast.success(editingUser ? 'User updated' : 'User created')
      setUserDialog(false)
      // Reload users
      const usersRes2 = await authFetch('/api/users')
      if (usersRes2.ok) setUsers(await usersRes2.json())
      // Notify all other modules about user change
      notifyDataChange('user-changed')
    } catch { toast.error('Failed to save user') }
  }

  const deleteUser = async (id: string) => {
    if (!confirm('Delete this user?')) return
    try {
      const res = await authFetch(`/api/users/${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('User deleted')
        const usersRes2 = await authFetch('/api/users')
        if (usersRes2.ok) setUsers(await usersRes2.json())
        // Notify all other modules about user change
        notifyDataChange('user-changed')
      }
      else { const d = await res.json(); toast.error(d.error) }
    } catch { toast.error('Failed to delete user') }
  }

  const exportBackup = async () => {
    try {
      const res = await authFetch('/api/backup')
      if (res.ok) {
        const data = await res.json()
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = `trendz-backup-${new Date().toISOString().split('T')[0]}.json`
        a.click(); URL.revokeObjectURL(url)
        toast.success('Backup exported')
      }
    } catch { toast.error('Export failed') }
  }

  const importBackup = async () => {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = '.json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      try {
        const text = await file.text()
        const data = JSON.parse(text)
        const res = await authFetch('/api/backup', { method: 'POST', body: JSON.stringify(data) })
        if (res.ok) {
          toast.success('Backup restored')
          // Notify all modules that everything has changed
          notifyDataChange('settings-changed')
          notifyDataChange('user-changed')
          notifyDataChange('inventory-changed')
          notifyDataChange('supplier-changed')
          notifyDataChange('category-changed')
          window.location.reload()
        }
        else toast.error('Restore failed')
      } catch { toast.error('Invalid backup file') }
    }
    input.click()
  }

  const clearAllData = async () => {
    if (!confirm('⚠️ WARNING: This will permanently delete ALL business data including products, sales, suppliers, notifications, and audit logs. User accounts and settings will be preserved.\n\nAre you sure you want to continue?')) return
    if (!confirm('This action CANNOT be undone. Consider exporting a backup first.\n\nType "DELETE" in the next prompt to confirm.')) return
    const confirmation = prompt('Type DELETE to confirm:')
    if (confirmation !== 'DELETE') { toast.info('Data clear cancelled'); return }
    try {
      const res = await authFetch('/api/clear-data', { method: 'POST' })
      if (res.ok) {
        toast.success('All business data cleared')
        // Notify all modules that everything has changed
        notifyDataChange('settings-changed')
        notifyDataChange('inventory-changed')
        notifyDataChange('supplier-changed')
        notifyDataChange('category-changed')
        notifyDataChange('sale-created') // triggers refresh of sales-related views
        window.location.reload()
      }
      else { const d = await res.json(); toast.error(d.error || 'Failed to clear data') }
    } catch { toast.error('Failed to clear data') }
  }

  if (loading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading settings...</div>

  return (
    <div className="space-y-4">
      <Tabs defaultValue="business" className="space-y-4" onValueChange={(value) => { if (value === 'approvals') loadApprovals() }}>
        <ScrollArea className="w-full">
          <TabsList className="flex flex-nowrap gap-1 h-auto p-1">
            <TabsTrigger value="business" className="text-xs"><Building2 className="h-3.5 w-3.5 mr-1" />Business</TabsTrigger>
            <TabsTrigger value="approvals" className="text-xs"><UserCheck className="h-3.5 w-3.5 mr-1" />Approvals{approvalData.summary.pending > 0 && <Badge className="ml-1.5 h-5 min-w-5 px-1.5 bg-amber-500 text-white text-[10px]">{approvalData.summary.pending}</Badge>}</TabsTrigger>
            <TabsTrigger value="users" className="text-xs"><Users className="h-3.5 w-3.5 mr-1" />Users</TabsTrigger>
            <TabsTrigger value="roles" className="text-xs"><Shield className="h-3.5 w-3.5 mr-1" />Roles</TabsTrigger>
            <TabsTrigger value="inventory" className="text-xs"><Package className="h-3.5 w-3.5 mr-1" />Inventory</TabsTrigger>
            <TabsTrigger value="sales" className="text-xs"><ShoppingCart className="h-3.5 w-3.5 mr-1" />Sales</TabsTrigger>
            <TabsTrigger value="reports" className="text-xs"><BarChart3 className="h-3.5 w-3.5 mr-1" />Reports</TabsTrigger>
            <TabsTrigger value="notifications" className="text-xs"><Bell className="h-3.5 w-3.5 mr-1" />Notifications</TabsTrigger>
            <TabsTrigger value="security" className="text-xs"><Lock className="h-3.5 w-3.5 mr-1" />Security</TabsTrigger>
            <TabsTrigger value="backup" className="text-xs"><Database className="h-3.5 w-3.5 mr-1" />Backup</TabsTrigger>
            <TabsTrigger value="preferences" className="text-xs"><Palette className="h-3.5 w-3.5 mr-1" />Preferences</TabsTrigger>
            <TabsTrigger value="audit" className="text-xs"><FileText className="h-3.5 w-3.5 mr-1" />Audit Log</TabsTrigger>
            <TabsTrigger value="about" className="text-xs"><Info className="h-3.5 w-3.5 mr-1" />About</TabsTrigger>
          </TabsList>
        </ScrollArea>

        {/* Business Settings */}
        <TabsContent value="business">
          <Card><CardHeader className="flex flex-row items-center justify-between"><CardTitle>Business Settings</CardTitle>
            <Button variant="outline" size="icon" onClick={() => loadAll(true)} disabled={refreshing} title="Refresh">
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Shop Name</Label><Input value={settings.shopName || ''} onChange={(e) => setSettings({...settings, shopName: e.target.value})} onBlur={() => updateSetting('shopName', settings.shopName)} /></div>
              <div className="space-y-2"><Label>Currency</Label><Input value={settings.currency || ''} onChange={(e) => setSettings({...settings, currency: e.target.value})} onBlur={() => updateSetting('currency', settings.currency)} /></div>
              <div className="space-y-2"><Label>Business Phone</Label><Input value={settings.businessPhone || ''} onChange={(e) => setSettings({...settings, businessPhone: e.target.value})} onBlur={() => updateSetting('businessPhone', settings.businessPhone)} /></div>
              <div className="space-y-2"><Label>Business Email</Label><Input value={settings.businessEmail || ''} onChange={(e) => setSettings({...settings, businessEmail: e.target.value})} onBlur={() => updateSetting('businessEmail', settings.businessEmail)} /></div>
              <div className="space-y-2 sm:col-span-2"><Label>Business Address</Label><Input value={settings.businessAddress || ''} onChange={(e) => setSettings({...settings, businessAddress: e.target.value})} onBlur={() => updateSetting('businessAddress', settings.businessAddress)} /></div>
              <div className="space-y-2"><Label>Timezone</Label><Input value={settings.timezone || ''} onChange={(e) => setSettings({...settings, timezone: e.target.value})} onBlur={() => updateSetting('timezone', settings.timezone)} /></div>
              <div className="space-y-2"><Label>Date Format</Label>
                <Select value={settings.dateFormat || 'DD/MM/YYYY'} onValueChange={(v) => updateSetting('dateFormat', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                    <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                    <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent></Card>
        </TabsContent>

        {/* User Approvals */}
        <TabsContent value="approvals">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <UserCheck className="h-5 w-5 text-amber-700" />
                  User Approvals
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Review and manage new user registrations. Approved users can log in and access the system based on their role.
                </p>
              </div>
              <Button variant="outline" size="icon" onClick={() => loadApprovals()} disabled={approvalLoading} title="Refresh">
                <RefreshCw className={`h-4 w-4 ${approvalLoading ? 'animate-spin' : ''}`} />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Summary Cards */}
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => { setApprovalFilter('pending'); loadApprovals('pending') }}
                  className={`p-3 rounded-lg border-2 transition-all text-center ${
                    approvalFilter === 'pending' ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/30' : 'border-muted hover:border-muted-foreground/30'
                  }`}
                >
                  <div className="flex items-center justify-center gap-1.5 mb-1">
                    <Clock className="h-4 w-4 text-amber-600" />
                    <span className="text-2xl font-bold text-amber-700 dark:text-amber-400">{approvalData.summary.pending}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Pending</p>
                </button>
                <button
                  onClick={() => { setApprovalFilter('approved'); loadApprovals('approved') }}
                  className={`p-3 rounded-lg border-2 transition-all text-center ${
                    approvalFilter === 'approved' ? 'border-green-500 bg-green-50 dark:bg-green-950/30' : 'border-muted hover:border-muted-foreground/30'
                  }`}
                >
                  <div className="flex items-center justify-center gap-1.5 mb-1">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="text-2xl font-bold text-green-700 dark:text-green-400">{approvalData.summary.approved}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Approved</p>
                </button>
                <button
                  onClick={() => { setApprovalFilter('rejected'); loadApprovals('rejected') }}
                  className={`p-3 rounded-lg border-2 transition-all text-center ${
                    approvalFilter === 'rejected' ? 'border-red-500 bg-red-50 dark:bg-red-950/30' : 'border-muted hover:border-muted-foreground/30'
                  }`}
                >
                  <div className="flex items-center justify-center gap-1.5 mb-1">
                    <XCircle className="h-4 w-4 text-red-600" />
                    <span className="text-2xl font-bold text-red-700 dark:text-red-400">{approvalData.summary.rejected}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Rejected</p>
                </button>
              </div>

              <Separator />

              {/* User List */}
              {approvalLoading && approvalData.users.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">Loading approval data...</div>
              ) : approvalData.users.length === 0 ? (
                <div className="text-center py-8">
                  <UserCheck className="h-12 w-12 mx-auto mb-3 opacity-30 text-muted-foreground" />
                  <p className="text-muted-foreground">
                    {approvalFilter === 'pending' ? 'No pending registrations' :
                     approvalFilter === 'approved' ? 'No approved users yet' :
                     'No rejected users'}
                  </p>
                  {approvalFilter === 'pending' && (
                    <p className="text-xs text-muted-foreground mt-1">New user registrations will appear here for your review.</p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {approvalData.users.map((u) => (
                    <div key={u.id} className="flex items-center justify-between gap-3 p-4 rounded-lg border bg-card hover:bg-accent/30 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar className="h-10 w-10 shrink-0">
                          <AvatarFallback className={`text-sm font-medium ${
                            u.approvalStatus === 'pending' ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300' :
                            u.approvalStatus === 'approved' ? 'bg-green-100 dark:bg-green-950 text-green-800 dark:text-green-300' :
                            'bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-300'
                          }`}>
                            {u.name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{u.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{u.email}{u.phone ? ` · ${u.phone}` : ''}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-[10px] capitalize">{u.role}</Badge>
                            <Badge className={`text-[10px] ${
                              u.approvalStatus === 'pending' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' :
                              u.approvalStatus === 'approved' ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300' :
                              'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                            }`}>
                              {u.approvalStatus === 'pending' && <Clock className="h-2.5 w-2.5 mr-1" />}
                              {u.approvalStatus === 'approved' && <CheckCircle2 className="h-2.5 w-2.5 mr-1" />}
                              {u.approvalStatus === 'rejected' && <XCircle className="h-2.5 w-2.5 mr-1" />}
                              {u.approvalStatus}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">
                              Registered {new Date(u.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        {u.approvalStatus === 'pending' && (
                          <>
                            <Button
                              size="sm"
                              className="bg-green-700 hover:bg-green-800 text-white h-8"
                              onClick={() => handleApproval(u.id, 'approve')}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-8"
                              onClick={() => {
                                if (confirm(`Reject registration for ${u.name}? They will not be able to log in.`)) {
                                  handleApproval(u.id, 'reject')
                                }
                              }}
                            >
                              <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                            </Button>
                          </>
                        )}
                        {u.approvalStatus === 'rejected' && (
                          <Button
                            size="sm"
                            className="bg-green-700 hover:bg-green-800 text-white h-8"
                            onClick={() => handleApproval(u.id, 'approve')}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Re-approve
                          </Button>
                        )}
                        {u.approvalStatus === 'approved' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                            onClick={() => {
                              if (confirm(`Revoke access for ${u.name}? They will no longer be able to log in.`)) {
                                handleApproval(u.id, 'reject')
                              }
                            }}
                          >
                            <UserX className="h-3.5 w-3.5 mr-1" /> Revoke
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Users & Staff */}
        <TabsContent value="users">
          <Card><CardHeader className="flex flex-row items-center justify-between"><CardTitle>Users & Staff</CardTitle>
            <Button onClick={() => openUserDialog()} className="bg-amber-800 hover:bg-amber-900 text-white"><Plus className="h-4 w-4 mr-2" />Add User</Button></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead>Approval</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell><div className="flex items-center gap-2"><Avatar className="h-7 w-7"><AvatarFallback className="text-xs bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300">{u.name?.split(' ').map((n:string) => n[0]).join('')}</AvatarFallback></Avatar>{u.name}</div></TableCell>
                      <TableCell>{u.email}</TableCell>
                      <TableCell><Badge variant="outline" className="capitalize">{u.role}</Badge></TableCell>
                      <TableCell><Badge className={`text-[10px] ${
                        u.approvalStatus === 'pending' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' :
                        u.approvalStatus === 'approved' ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300' :
                        'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                      }`}>{u.approvalStatus || 'approved'}</Badge></TableCell>
                      <TableCell><Badge className={u.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>{u.active ? 'Active' : 'Inactive'}</Badge></TableCell>
                      <TableCell className="text-right"><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openUserDialog(u)}><Edit2 className="h-3.5 w-3.5" /></Button><Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={() => deleteUser(u.id)}><Trash2 className="h-3.5 w-3.5" /></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent></Card>
        </TabsContent>

        {/* Roles & Permissions */}
        <TabsContent value="roles">
          <Card><CardHeader><CardTitle>Roles & Permissions</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 border rounded-lg"><h3 className="font-medium mb-2">Admin</h3><p className="text-sm text-muted-foreground">Full access to all features: Dashboard, Inventory, Sales, Suppliers, Reports, Settings, Users, and System Configuration.</p></div>
            <div className="p-4 border rounded-lg"><h3 className="font-medium mb-2">Staff</h3><p className="text-sm text-muted-foreground">Limited access: Inventory (view/sell), Sales POS, Sales Tracking (own data), Notifications, and My Settings. Cannot access Dashboard, Reports, Suppliers, or System Settings.</p></div>
          </CardContent></Card>
        </TabsContent>

        {/* Inventory Settings */}
        <TabsContent value="inventory">
          <Card><CardHeader><CardTitle>Inventory Settings</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Low Stock Threshold</Label><Input type="number" value={settings.lowStockThreshold || '5'} onChange={(e) => setSettings({...settings, lowStockThreshold: e.target.value})} onBlur={() => updateSetting('lowStockThreshold', settings.lowStockThreshold)} /></div>
              <div className="flex items-center justify-between p-3 border rounded-lg"><div><Label>Barcode Enabled</Label><p className="text-xs text-muted-foreground">Enable barcode scanning</p></div><Switch checked={settings.barcodeEnabled === 'true'} onCheckedChange={(v) => updateSetting('barcodeEnabled', String(v))} /></div>
              <div className="flex items-center justify-between p-3 border rounded-lg"><div><Label>Auto Stock Deduction</Label><p className="text-xs text-muted-foreground">Deduct stock on sale</p></div><Switch checked={settings.autoStockDeduction === 'true'} onCheckedChange={(v) => updateSetting('autoStockDeduction', String(v))} /></div>
            </div>
          </CardContent></Card>
        </TabsContent>

        {/* Sales Settings */}
        <TabsContent value="sales">
          <Card><CardHeader><CardTitle>Sales Settings</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Receipt Prefix</Label><Input value={settings.receiptPrefix || 'INV'} onChange={(e) => setSettings({...settings, receiptPrefix: e.target.value})} onBlur={() => updateSetting('receiptPrefix', settings.receiptPrefix)} /></div>
              <div className="space-y-2"><Label>Receipt Footer</Label><Input value={settings.receiptFooter || ''} onChange={(e) => setSettings({...settings, receiptFooter: e.target.value})} onBlur={() => updateSetting('receiptFooter', settings.receiptFooter)} /></div>
              <div className="flex items-center justify-between p-3 border rounded-lg"><div><Label>Discounts Enabled</Label></div><Switch checked={settings.discountsEnabled === 'true'} onCheckedChange={(v) => updateSetting('discountsEnabled', String(v))} /></div>
              <div className="flex items-center justify-between p-3 border rounded-lg"><div><Label>Refunds Enabled</Label></div><Switch checked={settings.refundsEnabled === 'true'} onCheckedChange={(v) => updateSetting('refundsEnabled', String(v))} /></div>
              <div className="flex items-center justify-between p-3 border rounded-lg"><div><Label>Staff Discount Allowed</Label></div><Switch checked={settings.staffDiscountAllowed === 'true'} onCheckedChange={(v) => updateSetting('staffDiscountAllowed', String(v))} /></div>
            </div>
          </CardContent></Card>
        </TabsContent>

        {/* Reports Settings */}
        <TabsContent value="reports">
          <Card><CardHeader><CardTitle>Reports Settings</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Default Report Period</Label>
                <Select value={settings.defaultReportPeriod || 'month'} onValueChange={(v) => updateSetting('defaultReportPeriod', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="week">Week</SelectItem><SelectItem value="month">Month</SelectItem><SelectItem value="quarter">Quarter</SelectItem><SelectItem value="year">Year</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Export Formats</Label><Input value={settings.exportFormats || 'pdf,excel'} onChange={(e) => setSettings({...settings, exportFormats: e.target.value})} onBlur={() => updateSetting('exportFormats', settings.exportFormats)} /></div>
            </div>
          </CardContent></Card>
        </TabsContent>

        {/* Notification Settings */}
        <TabsContent value="notifications">
          <Card><CardHeader><CardTitle>Notification Settings</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 border rounded-lg"><div><Label>Low Stock Alerts</Label><p className="text-xs text-muted-foreground">Get notified when products run low</p></div><Switch checked={settings.lowStockAlerts === 'true'} onCheckedChange={(v) => updateSetting('lowStockAlerts', String(v))} /></div>
            <div className="flex items-center justify-between p-3 border rounded-lg"><div><Label>Daily Sales Summary</Label><p className="text-xs text-muted-foreground">Receive daily sales summary</p></div><Switch checked={settings.dailySalesSummary === 'true'} onCheckedChange={(v) => updateSetting('dailySalesSummary', String(v))} /></div>
            <div className="flex items-center justify-between p-3 border rounded-lg"><div><Label>New Sale Notifications</Label><p className="text-xs text-muted-foreground">Get notified on new sales</p></div><Switch checked={settings.newSaleNotifications === 'true'} onCheckedChange={(v) => updateSetting('newSaleNotifications', String(v))} /></div>
          </CardContent></Card>
        </TabsContent>

        {/* Security Settings */}
        <TabsContent value="security">
          <Card><CardHeader><CardTitle>Security Settings</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Session Timeout (minutes)</Label><Input type="number" value={settings.sessionTimeout || '30'} onChange={(e) => setSettings({...settings, sessionTimeout: e.target.value})} onBlur={() => updateSetting('sessionTimeout', settings.sessionTimeout)} /></div>
              <div className="flex items-center justify-between p-3 border rounded-lg"><div><Label>Login Activity Tracking</Label></div><Switch checked={settings.loginActivityTracking === 'true'} onCheckedChange={(v) => updateSetting('loginActivityTracking', String(v))} /></div>
            </div>
          </CardContent></Card>
        </TabsContent>

        {/* Backup & Restore */}
        <TabsContent value="backup">
          <Card><CardHeader><CardTitle>Backup & Restore</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 border rounded-lg"><div><Label>Auto Backup</Label><p className="text-xs text-muted-foreground">Automatically backup database</p></div><Switch checked={settings.autoBackupEnabled === 'true'} onCheckedChange={(v) => updateSetting('autoBackupEnabled', String(v))} /></div>
            <div className="space-y-2"><Label>Backup Frequency</Label>
              <Select value={settings.autoBackupFrequency || 'daily'} onValueChange={(v) => updateSetting('autoBackupFrequency', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="daily">Daily</SelectItem><SelectItem value="weekly">Weekly</SelectItem><SelectItem value="monthly">Monthly</SelectItem></SelectContent>
              </Select>
            </div>
            <Separator />
            <div className="flex gap-3">
              <Button onClick={exportBackup} className="bg-amber-800 hover:bg-amber-900 text-white"><Download className="h-4 w-4 mr-2" />Export Backup</Button>
              <Button variant="outline" onClick={importBackup}><Upload className="h-4 w-4 mr-2" />Restore Backup</Button>
            </div>
            <Separator />
            <div className="p-4 border border-red-200 dark:border-red-900/50 rounded-lg bg-red-50/50 dark:bg-red-950/20">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium text-red-700 dark:text-red-400 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" /> Danger Zone
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">Clear all business data (products, sales, suppliers, notifications). User accounts and settings are preserved.</p>
                </div>
                <Button variant="destructive" size="sm" onClick={clearAllData}>
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Clear All Data
                </Button>
              </div>
            </div>
          </CardContent></Card>
        </TabsContent>

        {/* Preferences */}
        <TabsContent value="preferences">
          <Card><CardHeader><CardTitle>Preferences</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-center justify-between p-3 border rounded-lg"><div><Label>Dark Mode</Label></div><Switch checked={settings.darkMode === 'true'} onCheckedChange={(v) => { updateSetting('darkMode', String(v)); document.documentElement.classList.toggle('dark', v) }} /></div>
              <div className="space-y-2"><Label>Language</Label>
                <Select value={settings.language || 'en'} onValueChange={(v) => updateSetting('language', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="en">English</SelectItem><SelectItem value="sw">Swahili</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
          </CardContent></Card>
        </TabsContent>

        {/* Audit Logs */}
        <TabsContent value="audit">
          <Card><CardHeader><CardTitle>Audit Logs</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Action</TableHead><TableHead>Entity</TableHead><TableHead>User</TableHead><TableHead>Details</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
                <TableBody>
                  {auditLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell><Badge variant="outline" className="capitalize">{log.action}</Badge></TableCell>
                      <TableCell>{log.entity}</TableCell>
                      <TableCell>{log.userName || '-'}</TableCell>
                      <TableCell className="max-w-xs truncate text-sm text-muted-foreground">{log.details || '-'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{new Date(log.createdAt).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                  {auditLogs.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No audit logs yet</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </CardContent></Card>
        </TabsContent>

        {/* About */}
        <TabsContent value="about">
          <Card><CardHeader><CardTitle>About</CardTitle></CardHeader>
          <CardContent className="text-center space-y-4 py-8">
            <TrendzLogo size="xl" />
            <p className="text-muted-foreground">Fashion & Beauty Stock Management System</p>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>Version 1.0.0</p>
              <p>Built with Next.js, Prisma, and shadcn/ui</p>
            </div>
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      {/* User Dialog */}
      <Dialog open={userDialog} onOpenChange={setUserDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingUser ? 'Edit' : 'Add'} User</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2"><Label>Name *</Label><Input value={userForm.name} onChange={(e) => setUserForm({...userForm, name: e.target.value})} /></div>
            <div className="space-y-2"><Label>Email *</Label><Input type="email" value={userForm.email} onChange={(e) => setUserForm({...userForm, email: e.target.value})} /></div>
            <div className="space-y-2"><Label>{editingUser ? 'New Password (leave empty to keep)' : 'Password *'}</Label><Input type="password" value={userForm.password} onChange={(e) => setUserForm({...userForm, password: e.target.value})} /></div>
            <div className="space-y-2"><Label>Role</Label>
              <Select value={userForm.role} onValueChange={(v) => setUserForm({...userForm, role: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="admin">Admin</SelectItem><SelectItem value="staff">Staff</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Phone</Label><Input value={userForm.phone} onChange={(e) => setUserForm({...userForm, phone: e.target.value})} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUserDialog(false)}>Cancel</Button>
            <Button onClick={saveUser} className="bg-amber-800 hover:bg-amber-900 text-white">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
