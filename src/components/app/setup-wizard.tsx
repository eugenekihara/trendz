'use client'

import { useState } from 'react'
import { TrendzLogo } from './trendz-logo'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { CheckCircle2, ArrowRight, Store, User, Lock, Mail } from 'lucide-react'
import { useAppStore } from '@/store'

export function SetupWizard() {
  const login = useAppStore((s) => s.login)
  const [step, setStep] = useState(0) // 0: welcome, 1: shop, 2: admin, 3: done
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [shopName, setShopName] = useState('')
  const [adminName, setAdminName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const handleNext = () => {
    setError('')
    if (step === 1 && !shopName.trim()) {
      setError('Shop name is required')
      return
    }
    if (step === 2) {
      if (!adminName.trim() || !adminEmail.trim() || !adminPassword) {
        setError('All fields are required')
        return
      }
      if (adminPassword.length < 6) {
        setError('Password must be at least 6 characters')
        return
      }
      if (adminPassword !== confirmPassword) {
        setError('Passwords do not match')
        return
      }
      handleSetup()
      return
    }
    setStep(step + 1)
  }

  const handleSetup = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: adminName,
          email: adminEmail,
          password: adminPassword,
          shopName: shopName || undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Setup failed')
        return
      }

      setStep(3) // Done

      // Auto-login after a moment
      setTimeout(() => {
        login({
          id: data.id,
          email: data.email,
          name: data.name,
          role: data.role,
        })
      }, 1500)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const steps = [
    { label: 'Welcome', icon: Store },
    { label: 'Shop Details', icon: Store },
    { label: 'Admin Account', icon: User },
    { label: 'Complete', icon: CheckCircle2 },
  ]

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 via-white to-rose-50 dark:from-gray-950 dark:via-gray-900 dark:to-purple-950 p-4">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-6">
          <div className="flex justify-center mb-3">
            <TrendzLogo size="xl" />
          </div>
          <p className="text-muted-foreground text-sm">Set up your store to get started</p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`flex items-center justify-center h-8 w-8 rounded-full text-xs font-medium transition-all ${
                i <= step
                  ? 'bg-purple-600 text-white'
                  : 'bg-muted text-muted-foreground'
              }`}>
                {i < step ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
              </div>
              {i < steps.length - 1 && (
                <div className={`w-8 h-0.5 ${i < step ? 'bg-purple-600' : 'bg-muted'}`} />
              )}
            </div>
          ))}
        </div>

        <Card className="shadow-xl border-0">
          <CardHeader className="text-center pb-2">
            <h2 className="text-lg font-semibold">{steps[step].label}</h2>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="text-sm text-red-600 dark:text-red-400 text-center bg-red-50 dark:bg-red-950/30 p-2 rounded mb-4">
                {error}
              </div>
            )}

            {/* Step 0: Welcome */}
            {step === 0 && (
              <div className="text-center space-y-4 py-4">
                <div className="p-6 bg-purple-50 dark:bg-purple-950/30 rounded-xl">
                  <Store className="h-12 w-12 mx-auto text-purple-600 mb-3" />
                  <h3 className="text-lg font-semibold">Welcome to Trendz!</h3>
                  <p className="text-sm text-muted-foreground mt-2">
                    Let&apos;s set up your fashion &amp; beauty store management system.
                    This quick setup will create your admin account and configure your shop.
                    All data you enter here will be real — no demo data will be added.
                  </p>
                </div>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>You will need to provide:</p>
                  <ul className="text-left inline-block space-y-1">
                    <li className="flex items-center gap-2"><Store className="h-3.5 w-3.5" /> Your shop name</li>
                    <li className="flex items-center gap-2"><User className="h-3.5 w-3.5" /> Admin account details</li>
                    <li className="flex items-center gap-2"><Lock className="h-3.5 w-3.5" /> A secure password</li>
                  </ul>
                </div>
              </div>
            )}

            {/* Step 1: Shop Details */}
            {step === 1 && (
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="shopName">Shop / Business Name *</Label>
                  <Input
                    id="shopName"
                    placeholder="e.g. Trendz Fashion Store"
                    value={shopName}
                    onChange={(e) => setShopName(e.target.value)}
                    className="h-11"
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground">
                    This name will appear on receipts, the dashboard, and throughout the system.
                  </p>
                </div>
              </div>
            )}

            {/* Step 2: Admin Account */}
            {step === 2 && (
              <div className="space-y-4 py-2">
                <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg text-sm text-muted-foreground">
                  This will be the primary administrator account with full access to all features.
                </div>
                <div className="space-y-2">
                  <Label htmlFor="adminName">Full Name *</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="adminName"
                      placeholder="e.g. John Doe"
                      value={adminName}
                      onChange={(e) => setAdminName(e.target.value)}
                      className="h-11 pl-9"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="adminEmail">Email Address *</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="adminEmail"
                      type="email"
                      placeholder="e.g. admin@yourshop.com"
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      className="h-11 pl-9"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="adminPassword">Password *</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="adminPassword"
                        type="password"
                        placeholder="Min 6 chars"
                        value={adminPassword}
                        onChange={(e) => setAdminPassword(e.target.value)}
                        className="h-11 pl-9"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm *</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="confirmPassword"
                        type="password"
                        placeholder="Re-enter"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="h-11 pl-9"
                      />
                    </div>
                  </div>
                </div>
                {adminPassword && confirmPassword && (
                  <div className="text-xs">
                    {adminPassword === confirmPassword ? (
                      <span className="text-green-600 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Passwords match
                      </span>
                    ) : (
                      <span className="text-red-600">Passwords do not match</span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Done */}
            {step === 3 && (
              <div className="text-center space-y-4 py-6">
                <CheckCircle2 className="h-16 w-16 mx-auto text-green-600" />
                <h3 className="text-xl font-semibold">Setup Complete!</h3>
                <p className="text-sm text-muted-foreground">
                  Your store <strong>{shopName || 'Trendz'}</strong> is ready.
                  You are being signed in automatically...
                </p>
              </div>
            )}

            {/* Navigation Buttons */}
            {step < 3 && (
              <div className="flex justify-between mt-6">
                <Button
                  variant="outline"
                  onClick={() => { setError(''); setStep(Math.max(0, step - 1)) }}
                  disabled={step === 0}
                >
                  Back
                </Button>
                <Button
                  onClick={handleNext}
                  disabled={loading}
                  className="bg-gradient-to-r from-purple-600 to-rose-500 hover:from-purple-700 hover:to-rose-600 text-white"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                      Setting up...
                    </span>
                  ) : step === 2 ? (
                    <span className="flex items-center gap-2">
                      Create & Sign In <ArrowRight className="h-4 w-4" />
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      Continue <ArrowRight className="h-4 w-4" />
                    </span>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
