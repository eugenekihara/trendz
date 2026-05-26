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
  systemInitialized: 'false',
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

/**
 * Ensure essential system settings exist (called on first load).
 * Does NOT create any demo users or sample data.
 */
export async function ensureDbSeeded() {
  // Seed settings only if table is empty
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

  // Seed default categories only if table is empty
  const existingCategories = await db.category.count()
  if (existingCategories === 0) {
    for (const cat of DEFAULT_CATEGORIES) {
      await db.category.create({ data: cat })
    }
  }

  // NO demo users are created.
  // The first admin account must be created through the setup wizard.
}

/**
 * Check if the system has been initialized (first admin account created).
 */
export async function isSystemInitialized(): Promise<boolean> {
  const userCount = await db.user.count()
  if (userCount > 0) return true

  // Also check the systemInitialized setting
  const setting = await db.setting.findUnique({ where: { key: 'systemInitialized' } })
  return setting?.value === 'true'
}

/**
 * Create the initial admin account during setup.
 */
export async function createInitialAdmin(data: {
  name: string
  email: string
  password: string
  shopName?: string
}) {
  // Ensure settings exist first
  await ensureDbSeeded()

  // Create admin user
  const user = await db.user.create({
    data: {
      email: data.email,
      name: data.name,
      password: data.password,
      role: 'admin',
      active: true,
      theme: 'light',
      language: 'en',
      notifySales: true,
      notifyInventory: true,
      notifyTasks: true,
    },
  })

  // Update shop name if provided
  if (data.shopName) {
    await db.setting.upsert({
      where: { key: 'shopName' },
      update: { value: data.shopName },
      create: { key: 'shopName', value: data.shopName },
    })
  }

  // Mark system as initialized
  await db.setting.upsert({
    where: { key: 'systemInitialized' },
    update: { value: 'true' },
    create: { key: 'systemInitialized', value: 'true' },
  })

  return user
}

/**
 * Clear all business data from the database, keeping only user accounts and settings.
 * Used when an admin wants to start fresh with real data.
 */
export async function clearBusinessData() {
  await db.auditLog.deleteMany()
  await db.creditPayment.deleteMany()
  await db.creditOrderItem.deleteMany()
  await db.creditOrder.deleteMany()
  await db.stockMove.deleteMany()
  await db.salesEntry.deleteMany()
  await db.saleItem.deleteMany()
  await db.sale.deleteMany()
  await db.notification.deleteMany()
  await db.product.deleteMany()
  await db.purchaseOrder.deleteMany()
  await db.supplier.deleteMany()
  return { success: true }
}
