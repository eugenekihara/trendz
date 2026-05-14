import { db } from './db'

const DEFAULT_SETTINGS: Record<string, string> = {
  shopName: 'Trendz',
  currency: 'KES',
  darkMode: 'false',
  businessPhone: '',
  businessEmail: '',
  businessAddress: '',
  timezone: 'Africa/Nairobi',
  dateFormat: 'DD/MM/YYYY',
  receiptFooter: 'Thank you for shopping with us!',
  taxEnabled: 'false',
  taxRate: '16',
  lowStockThreshold: '5',
  autoStockDeduction: 'true',
  barcodeEnabled: 'true',
  discountsEnabled: 'true',
  staffDiscountAllowed: 'false',
  receiptPrefix: 'INV',
  taxCalculationEnabled: 'false',
  paymentMethods: 'cash,mpesa,card,bank_transfer',
  refundsEnabled: 'true',
  defaultReportPeriod: 'month',
  exportFormats: 'pdf,excel',
  lowStockAlerts: 'true',
  dailySalesSummary: 'true',
  newSaleNotifications: 'true',
  sessionTimeout: '30',
  loginActivityTracking: 'true',
  autoBackupEnabled: 'false',
  autoBackupFrequency: 'daily',
  language: 'en',
  dashboardLayout: 'default',
}

const DEFAULT_CATEGORIES = [
  { name: 'Cosmetics', description: 'Beauty and makeup products', icon: 'Sparkles' },
  { name: 'Jackets', description: 'Jackets and coats', icon: 'CloudSnow' },
  { name: 'Dresses', description: 'Women dresses and gowns', icon: 'Shirt' },
  { name: 'Shoes', description: 'Footwear collection', icon: 'Footprints' },
  { name: 'Bags', description: 'Handbags and purses', icon: 'ShoppingBag' },
  { name: 'Perfumes', description: 'Fragrances and scents', icon: 'Droplets' },
  { name: 'Accessories', description: 'Jewelry and accessories', icon: 'Gem' },
  { name: 'Other', description: 'Other fashion items', icon: 'Package' },
]

export async function ensureDbSeeded() {
  // Seed settings
  const existingSettings = await db.setting.count()
  if (existingSettings === 0) {
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      await db.setting.upsert({
        where: { key },
        update: {},
        create: { key, value },
      })
    }
  }

  // Seed categories
  const existingCategories = await db.category.count()
  if (existingCategories === 0) {
    for (const cat of DEFAULT_CATEGORIES) {
      await db.category.create({ data: cat })
    }
  }

  // Seed default users
  const existingUsers = await db.user.count()
  if (existingUsers === 0) {
    await db.user.create({
      data: {
        email: 'admin@trendz.com',
        name: 'Admin User',
        password: 'admin123',
        role: 'admin',
        active: true,
        theme: 'light',
        language: 'en',
        notifySales: true,
        notifyInventory: true,
        notifyTasks: true,
      },
    })
    await db.user.create({
      data: {
        email: 'staff@trendz.com',
        name: 'Jane Staff',
        password: 'staff123',
        role: 'staff',
        active: true,
        theme: 'light',
        language: 'en',
        notifySales: true,
        notifyInventory: true,
        notifyTasks: true,
      },
    })
  }
}
