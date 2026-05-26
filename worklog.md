---
Task ID: 1
Agent: Main Agent
Task: Full system-wide data alignment and synchronization across all 5 modules

Work Log:
- Read all 13+ source files (5 components, 10+ API routes, schema, store)
- Mapped complete data flow: Sale → SalesEntry, SaleItem → Product quantity, Dashboard ← Sale + SalesEntry
- Identified 6 synchronization gaps
- FIX 1: Changed POS SalesEntry creation from single aggregated record to individual records per SaleItem with proportional discount distribution
- FIX 2: Created /api/sales/[id]/route.ts DELETE endpoint with full rollback (restore inventory, delete SalesEntry mirrors, create stock moves, audit log)
- FIX 3: Created /api/sales-tracking/[id]/route.ts DELETE endpoint for manual entries with admin-only access
- FIX 4: Updated Dashboard API to include manual entries in recent sales list + added outOfStockProducts stat
- FIX 5: Updated Sales Tracking UI with delete functionality (manual entries deleted individually, POS entries deleted via sale deletion with stock restore)
- FIX 6: Verified all CRUD operations emit proper notifyDataChange events and all modules listen for relevant events
- Build passes successfully with all new routes registered

Stage Summary:
- All 5 modules now derive data from the same Prisma/SQLite database
- POS sales create individual SalesEntry records per item (not aggregated) — Sales Tracking shows per-product detail
- Discount is proportionally distributed across items so sum of POS SalesEntry amounts = Sale.total (data alignment preserved)
- Sale deletion fully reverses effects: inventory restored, SalesEntry mirrors deleted, audit trail created
- Manual entry deletion available for admins
- Dashboard recent sales now includes both POS and manual entries
- All modules refresh instantly via notifyDataChange/onDataChange event system
- All API routes have force-dynamic + Cache-Control: no-store
- All components have visibilitychange + onDataChange listeners
