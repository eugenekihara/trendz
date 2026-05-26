---
Task ID: 1
Agent: Main Agent
Task: Add Credit/Customer Deposit Management feature to Trendz

Work Log:
- Explored full codebase structure (Prisma schema, store, all 5 components, all API routes, auth, navigation)
- Added 3 new Prisma models: CreditOrder, CreditOrderItem, CreditPayment
- Added creditOrderId field to SalesEntry model
- Added relations to User, Product, SalesEntry models
- Ran prisma db push to apply schema changes
- Created 3 new API routes:
  - /api/credits (GET: list+summary, POST: create credit order with inventory reduction)
  - /api/credits/[id] (GET: single order, PUT: update order, DELETE: delete+restore stock)
  - /api/credits/[id]/payments (POST: add payment, auto-update status)
- Updated store.ts: Added 'credits' to ViewPage type, 'credit-changed' to DataChangeEvent
- Created credit-management.tsx UI component with:
  - Summary cards (Outstanding, Total Credit, Paid, Overdue)
  - Search/filter by customer name/phone and payment status
  - Create credit order dialog with product selection cart
  - Record payment dialog with balance tracking
  - Payment history dialog
  - Credit order detail dialog
  - Edit dialog (admin) and delete dialog with stock restoration
  - Access control (staff: own orders, admin: all)
- Added Credits navigation item to app-layout.tsx sidebar
- Added CreditManagement route to page.tsx
- Integrated credit data into Dashboard API (credit stats + credit SalesEntry source)
- Added Credit Summary Cards to Dashboard UI
- Integrated credit data into Reports API (credit analytics section)
- Added Credit Analytics Cards to Reports UI
- Updated Sales Tracking API to include credit source breakdown
- Added Credit Sales card to Sales Tracking UI summary
- Added 'credit' source badge (purple) to Sales Tracking entries
- Added credit-changed event to Dashboard, Reports, Sales Tracking, Inventory event lists
- Updated backup route to include credit tables (export + restore)
- Updated clear-data utility to include credit tables
- Changed PrismaClient log level from ['query'] to ['error', 'warn'] to prevent server crashes from query log flooding
- Successfully tested all API endpoints individually:
  - GET /api/credits - Returns credit orders with summary
  - POST /api/credits - Creates credit order, reduces inventory, creates SalesEntry mirrors
  - POST /api/credits/[id]/payments - Records payments, auto-updates status
  - Payment status progression: deposit_paid → partially_paid → fully_paid verified
  - Dashboard includes credit data (outstanding, paid, overdue)
  - Reports includes credit analytics section
  - Sales Tracking shows credit entries with purple source badge

Stage Summary:
- Complete Credit/Customer Deposit Management feature implemented
- All 5 modules (Dashboard, Sales POS, Sales Tracking, Inventory, Reports) are integrated with credit data
- Credit orders reduce inventory on creation and restore on deletion
- SalesEntry mirrors created for credit orders (source='credit')
- Payment history tracking with automatic status updates
- Access control: staff can create/view own, admin can view/edit/delete all
- Build succeeds cleanly with all new routes
