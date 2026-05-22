'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '@/store'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  User,
  Lock,
  Palette,
  Bell,
  TrendingUp,
  Save,
  Eye,
  EyeOff,
  ShieldCheck,
  Moon,
  Sun,
  ShoppingBag,
  Package,
  CheckCircle2,
  Clock,
  BarChart3,
  DollarSign,
  Calendar,
} from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { toast } from 'sonner'

interface ProfileData {
  id: string
  email: string
  name: string
  role: string
  avatar?: string | null
  phone?: string | null
  theme: string
  language: string
  notifySales: boolean
  notifyInventory: boolean
  notifyTasks: boolean
  createdAt: string
}

interface SalesData {
  summary: {
    totalSales: number
    totalAmount: number
    avgSale: number
    todaySales: number
    todayAmount: number
    weekSales: number
    weekAmount: number
    monthSales: number
    monthAmount: number
    posCount: number
    manualCount: number
  }
  recentTransactions: any[]
  dailyTrend: { date: string; count: number; amount: number }[]
}

export function StaffSettings() {
  const user = useAppStore((s) => s.user)
  const updateUser = useAppStore((s) => s.updateUser)
  const authFetch = useAppStore((s) => s.authFetch)
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [salesData, setSalesData] = useState<SalesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Profile form
  const [profileForm, setProfileForm] = useState({
    name: '',
    email: '',
    phone: '',
    avatar: '',
  })

  // Password form
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)

  // Appearance
  const [theme, setTheme] = useState('light')
  const [language, setLanguage] = useState('en')

  // Notification prefs
  const [notifySales, setNotifySales] = useState(true)
  const [notifyInventory, setNotifyInventory] = useState(true)
  const [notifyTasks, setNotifyTasks] = useState(true)

  const fetchProfile = useCallback(async () => {
    try {
      const res = await authFetch('/api/staff-profile')
      if (res.ok) {
        const data = await res.json()
        setProfile(data)
        setProfileForm({
          name: data.name || '',
          email: data.email || '',
          phone: data.phone || '',
          avatar: data.avatar || '',
        })
        setTheme(data.theme || 'light')
        setLanguage(data.language || 'en')
        setNotifySales(data.notifySales ?? true)
        setNotifyInventory(data.notifyInventory ?? true)
        setNotifyTasks(data.notifyTasks ?? true)
      }
    } catch (error) {
      console.error('Fetch profile error:', error)
    }
  }, [authFetch])

  const fetchSalesData = useCallback(async () => {
    try {
      const res = await authFetch('/api/staff-sales')
      if (res.ok) {
        setSalesData(await res.json())
      }
    } catch (error) {
      console.error('Fetch sales data error:', error)
    }
  }, [authFetch])

  useEffect(() => {
    Promise.all([fetchProfile(), fetchSalesData()]).finally(() => setLoading(false))
  }, [fetchProfile, fetchSalesData])

  const saveProfile = async () => {
    setSaving(true)
    try {
      const res = await authFetch('/api/staff-profile', {
        method: 'PUT',
        body: JSON.stringify(profileForm),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to update profile')
        return
      }
      setProfile(data)
      updateUser({ name: data.name, email: data.email, avatar: data.avatar, phone: data.phone })
      toast.success('Profile updated successfully')
    } catch {
      toast.error('Failed to update profile')
    } finally {
      setSaving(false)
    }
  }

  const changePassword = async () => {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error('New passwords do not match')
      return
    }
    if (passwordForm.newPassword.length < 4) {
      toast.error('Password must be at least 4 characters')
      return
    }
    setChangingPassword(true)
    try {
      const res = await authFetch('/api/staff-profile/password', {
        method: 'PUT',
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to change password')
        return
      }
      toast.success('Password changed successfully')
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch {
      toast.error('Failed to change password')
    } finally {
      setChangingPassword(false)
    }
  }

  const saveAppearance = async (key: string, value: string) => {
    try {
      const res = await authFetch('/api/staff-profile', {
        method: 'PUT',
        body: JSON.stringify({ [key]: value }),
      })
      if (!res.ok) {
        toast.error('Failed to update preference')
        return
      }
      const data = await res.json()
      setProfile(data)
      toast.success('Preference updated')

      // Apply theme change
      if (key === 'theme') {
        document.documentElement.classList.toggle('dark', value === 'dark')
      }
    } catch {
      toast.error('Failed to update preference')
    }
  }

  const saveNotificationPref = async (key: string, value: boolean) => {
    try {
      const res = await authFetch('/api/staff-profile', {
        method: 'PUT',
        body: JSON.stringify({ [key]: value }),
      })
      if (!res.ok) {
        toast.error('Failed to update notification preference')
        return
      }
      toast.success('Notification preference updated')
    } catch {
      toast.error('Failed to update preference')
    }
  }

  const getInitials = (name: string) => {
    return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center text-muted-foreground">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-700 mx-auto mb-3" />
          <p>Loading your settings...</p>
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Failed to load profile data
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-4 mb-2">
        <Avatar className="h-16 w-16">
          <AvatarImage src={profile.avatar || undefined} />
          <AvatarFallback className="bg-gradient-to-br from-amber-700 to-amber-500 text-white text-xl font-bold">
            {getInitials(profile.name)}
          </AvatarFallback>
        </Avatar>
        <div>
          <h2 className="text-xl font-bold">{profile.name}</h2>
          <p className="text-muted-foreground capitalize">{profile.role} · {profile.email}</p>
          <p className="text-xs text-muted-foreground mt-1">Member since {new Date(profile.createdAt).toLocaleDateString()}</p>
        </div>
      </div>

      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList className="grid grid-cols-5 w-full">
          <TabsTrigger value="profile" className="text-xs sm:text-sm"><User className="h-3.5 w-3.5 sm:mr-1.5" /><span className="hidden sm:inline">Profile</span></TabsTrigger>
          <TabsTrigger value="security" className="text-xs sm:text-sm"><Lock className="h-3.5 w-3.5 sm:mr-1.5" /><span className="hidden sm:inline">Security</span></TabsTrigger>
          <TabsTrigger value="appearance" className="text-xs sm:text-sm"><Palette className="h-3.5 w-3.5 sm:mr-1.5" /><span className="hidden sm:inline">Appearance</span></TabsTrigger>
          <TabsTrigger value="notifications" className="text-xs sm:text-sm"><Bell className="h-3.5 w-3.5 sm:mr-1.5" /><span className="hidden sm:inline">Alerts</span></TabsTrigger>
          <TabsTrigger value="sales" className="text-xs sm:text-sm"><TrendingUp className="h-3.5 w-3.5 sm:mr-1.5" /><span className="hidden sm:inline">My Sales</span></TabsTrigger>
        </TabsList>

        {/* 1. Profile Settings */}
        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Profile Settings</CardTitle>
              <CardDescription>Manage your personal information. These details are visible across the system.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Avatar Section */}
              <div className="flex items-center gap-6">
                <Avatar className="h-20 w-20">
                  <AvatarImage src={profileForm.avatar || undefined} />
                  <AvatarFallback className="bg-gradient-to-br from-amber-700 to-amber-500 text-white text-2xl font-bold">
                    {getInitials(profileForm.name || 'U')}
                  </AvatarFallback>
                </Avatar>
                <div className="space-y-2 flex-1">
                  <Label htmlFor="avatar">Profile Picture URL</Label>
                  <Input
                    id="avatar"
                    placeholder="Enter image URL for your avatar"
                    value={profileForm.avatar}
                    onChange={(e) => setProfileForm({ ...profileForm, avatar: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">Paste a URL to an image to use as your profile picture</p>
                </div>
              </div>

              <Separator />

              {/* Personal Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    value={profileForm.name}
                    onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                    placeholder="Enter your full name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={profileForm.email}
                    onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                    placeholder="Enter your email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    value={profileForm.phone}
                    onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                    placeholder="e.g. +254 700 000 000"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Input value={profile.role} disabled className="bg-muted" />
                  <p className="text-xs text-muted-foreground">Your role is assigned by an administrator</p>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button onClick={saveProfile} disabled={saving} className="bg-amber-800 hover:bg-amber-900 text-white">
                  <Save className="h-4 w-4 mr-2" />
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 2. Password & Security */}
        <TabsContent value="security">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Change Password</CardTitle>
                <CardDescription>Update your password to keep your account secure. You must enter your current password to make changes.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">Current Password</Label>
                  <div className="relative">
                    <Input
                      id="currentPassword"
                      type={showCurrent ? 'text' : 'password'}
                      value={passwordForm.currentPassword}
                      onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                      placeholder="Enter your current password"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                      onClick={() => setShowCurrent(!showCurrent)}
                    >
                      {showCurrent ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="newPassword">New Password</Label>
                    <div className="relative">
                      <Input
                        id="newPassword"
                        type={showNew ? 'text' : 'password'}
                        value={passwordForm.newPassword}
                        onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                        placeholder="Enter new password"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                        onClick={() => setShowNew(!showNew)}
                      >
                        {showNew ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm New Password</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      value={passwordForm.confirmPassword}
                      onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                      placeholder="Confirm new password"
                    />
                  </div>
                </div>
                {passwordForm.newPassword && passwordForm.confirmPassword && (
                  <div className="flex items-center gap-2 text-sm">
                    {passwordForm.newPassword === passwordForm.confirmPassword ? (
                      <><CheckCircle2 className="h-4 w-4 text-green-600" /><span className="text-green-600">Passwords match</span></>
                    ) : (
                      <><span className="text-red-600">Passwords do not match</span></>
                    )}
                  </div>
                )}
                <div className="flex justify-end pt-2">
                  <Button
                    onClick={changePassword}
                    disabled={changingPassword || !passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword}
                    className="bg-amber-800 hover:bg-amber-900 text-white"
                  >
                    <Lock className="h-4 w-4 mr-2" />
                    {changingPassword ? 'Changing...' : 'Change Password'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Security Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-green-600" />
                  Security Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Last Password Change</p>
                      <p className="text-xs text-muted-foreground">Not available</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <ShieldCheck className="h-4 w-4 text-green-600" />
                    <div>
                      <p className="text-sm font-medium">Account Status</p>
                      <p className="text-xs text-muted-foreground">Active and in good standing</p>
                    </div>
                  </div>
                  <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Active</Badge>
                </div>
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Lock className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Two-Factor Authentication</p>
                      <p className="text-xs text-muted-foreground">Contact admin to enable</p>
                    </div>
                  </div>
                  <Badge variant="outline">Not Enabled</Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* 3. Appearance Preferences */}
        <TabsContent value="appearance">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Appearance Preferences</CardTitle>
              <CardDescription>Customize how Trendz looks and feels for you. These settings only affect your account.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Theme Toggle */}
              <div className="space-y-3">
                <Label className="text-base font-medium">Theme</Label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => { setTheme('light'); saveAppearance('theme', 'light') }}
                    className={`p-4 rounded-lg border-2 transition-all flex flex-col items-center gap-2 ${
                      theme === 'light' ? 'border-amber-700 bg-amber-50 dark:bg-amber-950' : 'border-muted hover:border-muted-foreground/30'
                    }`}
                  >
                    <Sun className="h-8 w-8 text-amber-500" />
                    <span className="text-sm font-medium">Light</span>
                    {theme === 'light' && <CheckCircle2 className="h-4 w-4 text-amber-700" />}
                  </button>
                  <button
                    onClick={() => { setTheme('dark'); saveAppearance('theme', 'dark') }}
                    className={`p-4 rounded-lg border-2 transition-all flex flex-col items-center gap-2 ${
                      theme === 'dark' ? 'border-amber-700 bg-amber-50 dark:bg-amber-950' : 'border-muted hover:border-muted-foreground/30'
                    }`}
                  >
                    <Moon className="h-8 w-8 text-blue-500" />
                    <span className="text-sm font-medium">Dark</span>
                    {theme === 'dark' && <CheckCircle2 className="h-4 w-4 text-amber-700" />}
                  </button>
                </div>
              </div>

              <Separator />

              {/* Language */}
              <div className="space-y-3">
                <Label className="text-base font-medium">Language</Label>
                <Select value={language} onValueChange={(v) => { setLanguage(v); saveAppearance('language', v) }}>
                  <SelectTrigger className="w-full max-w-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="sw">Swahili</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Choose your preferred language. More languages coming soon.</p>
              </div>

              <Separator />

              {/* Quick Actions */}
              <div className="space-y-3">
                <Label className="text-base font-medium">Quick Actions</Label>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setTheme('light'); saveAppearance('theme', 'light') }}>
                    <Sun className="h-3.5 w-3.5 mr-1.5" /> Switch to Light
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => { setTheme('dark'); saveAppearance('theme', 'dark') }}>
                    <Moon className="h-3.5 w-3.5 mr-1.5" /> Switch to Dark
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 4. Notification Preferences */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Notification Preferences</CardTitle>
              <CardDescription>Choose which notifications you want to receive. These only affect your account notifications.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="p-2.5 rounded-full bg-green-50 dark:bg-green-950">
                    <ShoppingBag className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="font-medium">Sales Confirmations</p>
                    <p className="text-sm text-muted-foreground">Get notified when a sale is completed successfully</p>
                  </div>
                </div>
                <Switch
                  checked={notifySales}
                  onCheckedChange={(v) => { setNotifySales(v); saveNotificationPref('notifySales', v) }}
                />
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="p-2.5 rounded-full bg-yellow-50 dark:bg-yellow-950">
                    <Package className="h-5 w-5 text-yellow-600" />
                  </div>
                  <div>
                    <p className="font-medium">Inventory Alerts</p>
                    <p className="text-sm text-muted-foreground">Get alerted when products are running low on stock</p>
                  </div>
                </div>
                <Switch
                  checked={notifyInventory}
                  onCheckedChange={(v) => { setNotifyInventory(v); saveNotificationPref('notifyInventory', v) }}
                />
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="p-2.5 rounded-full bg-blue-50 dark:bg-blue-950">
                    <Bell className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium">Task Updates</p>
                    <p className="text-sm text-muted-foreground">Receive notifications about assigned tasks and updates</p>
                  </div>
                </div>
                <Switch
                  checked={notifyTasks}
                  onCheckedChange={(v) => { setNotifyTasks(v); saveNotificationPref('notifyTasks', v) }}
                />
              </div>

              <Separator />

              <div className="p-4 bg-muted/30 rounded-lg">
                <p className="text-sm text-muted-foreground">
                  <strong>Note:</strong> These settings control only the notifications you see in the Trendz app. System-wide notification settings are managed by your administrator.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 5. Personal Sales Information */}
        <TabsContent value="sales">
          <div className="space-y-4">
            {/* Sales Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <DollarSign className="h-4 w-4 text-green-600" />
                    <p className="text-xs text-muted-foreground">Total Sales</p>
                  </div>
                  <p className="text-xl font-bold">KES {salesData?.summary?.totalAmount?.toLocaleString() || 0}</p>
                  <p className="text-xs text-muted-foreground">{salesData?.summary?.totalSales || 0} transactions</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <BarChart3 className="h-4 w-4 text-amber-700" />
                    <p className="text-xs text-muted-foreground">Average Sale</p>
                  </div>
                  <p className="text-xl font-bold">KES {salesData?.summary?.avgSale?.toLocaleString(undefined, { maximumFractionDigits: 0 }) || 0}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Calendar className="h-4 w-4 text-blue-600" />
                    <p className="text-xs text-muted-foreground">This Month</p>
                  </div>
                  <p className="text-xl font-bold">KES {salesData?.summary?.monthAmount?.toLocaleString() || 0}</p>
                  <p className="text-xs text-muted-foreground">{salesData?.summary?.monthSales || 0} sales</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="h-4 w-4 text-orange-600" />
                    <p className="text-xs text-muted-foreground">This Week</p>
                  </div>
                  <p className="text-xl font-bold">KES {salesData?.summary?.weekAmount?.toLocaleString() || 0}</p>
                  <p className="text-xs text-muted-foreground">{salesData?.summary?.weekSales || 0} sales</p>
                </CardContent>
              </Card>
            </div>

            {/* Performance by Source */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Sales by Source</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-4">
                  <div className="flex-1 p-3 bg-amber-50 dark:bg-amber-950 rounded-lg text-center">
                    <p className="text-2xl font-bold text-amber-800 dark:text-amber-300">{salesData?.summary?.posCount || 0}</p>
                    <p className="text-xs text-muted-foreground">POS Sales</p>
                  </div>
                  <div className="flex-1 p-3 bg-rose-50 dark:bg-rose-950 rounded-lg text-center">
                    <p className="text-2xl font-bold text-rose-700 dark:text-rose-300">{salesData?.summary?.manualCount || 0}</p>
                    <p className="text-xs text-muted-foreground">Manual Entries</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Sales Trend Chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Your Sales Trend (Last 7 Days)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-48">
                  {salesData?.dailyTrend && salesData.dailyTrend.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={salesData.dailyTrend}>
                        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(value: number, name: string) => [
                          name === 'amount' ? `KES ${value.toLocaleString()}` : value,
                          name === 'amount' ? 'Amount' : 'Count'
                        ]} />
                        <Bar dataKey="amount" fill="#92400e" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      <p>No sales data yet</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Recent Transactions */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Your Recent Transactions</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {salesData?.recentTransactions?.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell className="font-medium text-sm">{entry.productName}</TableCell>
                          <TableCell className="text-right">{entry.quantity}</TableCell>
                          <TableCell className="text-right font-medium">KES {entry.amount.toLocaleString()}</TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={`text-xs capitalize ${
                                entry.source === 'pos' ? 'border-amber-300 text-amber-800 dark:text-amber-300' : 'border-orange-300 text-orange-700 dark:text-orange-300'
                              }`}
                            >
                              {entry.source}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{new Date(entry.date).toLocaleDateString()}</TableCell>
                        </TableRow>
                      ))}
                      {(!salesData?.recentTransactions || salesData.recentTransactions.length === 0) && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                            No transactions yet
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Today's Performance */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Today&apos;s Performance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950 dark:to-orange-950 rounded-lg">
                    <p className="text-sm text-muted-foreground mb-1">Sales Today</p>
                    <p className="text-2xl font-bold">{salesData?.summary?.todaySales || 0}</p>
                    <p className="text-xs text-muted-foreground mt-1">KES {salesData?.summary?.todayAmount?.toLocaleString() || 0}</p>
                  </div>
                  <div className="p-4 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950 rounded-lg">
                    <p className="text-sm text-muted-foreground mb-1">This Week</p>
                    <p className="text-2xl font-bold">{salesData?.summary?.weekSales || 0}</p>
                    <p className="text-xs text-muted-foreground mt-1">KES {salesData?.summary?.weekAmount?.toLocaleString() || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
