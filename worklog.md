---
Task ID: 1
Agent: Main Agent
Task: Remove all fake/demo/mock/sample data and prepare system for real-world usage

Work Log:
- Audited entire codebase for mock data sources - found 8 issues across 4 files
- Updated `src/lib/seed.ts`: Removed demo users (admin@trendz.com, staff@trendz.com), added `isSystemInitialized()`, `createInitialAdmin()`, and `clearBusinessData()` functions
- Created `src/app/api/setup/route.ts`: GET for checking setup status, POST for creating initial admin
- Created `src/app/api/public-settings/route.ts`: Public endpoint for shop name/receipt footer (no auth needed)
- Created `src/app/api/clear-data/route.ts`: Admin-only endpoint to clear all business data
- Created `src/components/app/setup-wizard.tsx`: 4-step setup wizard (Welcome → Shop Details → Admin Account → Complete)
- Updated `src/components/app/login.tsx`: Removed demo credentials display, removed auto-seed call, removed hardcoded email placeholder
- Updated `src/app/page.tsx`: Removed auto-seed on page load, added setup wizard detection flow, replaced direct Login rendering with loading → setup/login → app flow
- Updated `src/app/api/auth/route.ts`: Removed auto-seed call before login
- Updated `src/components/app/dashboard.tsx`: Added comprehensive empty state for no-data scenarios (welcome message + CTA), proper empty states for charts (daily sales, category pie), empty states for top products and recent sales
- Updated `src/components/app/sales-pos.tsx`: Replaced hardcoded "TRENDZ" with dynamic `shopSettings.shopName`, replaced hardcoded receipt footer with `shopSettings.receiptFooter`, added empty state for products grid, fetches settings from `/api/public-settings`
- Updated `src/components/app/sales-tracking.tsx`: Enhanced empty state with icon, message, and CTA button to navigate to Sales POS
- Updated `src/components/app/reports.tsx`: Added comprehensive empty state when no data exists, proper empty states for individual charts (sales trend, inventory by category)
- Updated `src/components/app/settings.tsx`: Added "Danger Zone" section with "Clear All Data" button in Backup tab, triple confirmation (confirm → confirm → type DELETE)
- Deleted old database and ran `npx prisma db push --accept-data-loss` for clean start
- Build test passed successfully with no errors

Stage Summary:
- System now starts completely clean with no demo data
- First-time users see a Setup Wizard to create their admin account
- All modules display proper empty states when no data exists
- Receipt uses dynamic shop name from settings
- Admin can clear all business data from Settings > Backup > Danger Zone
- Auto-seed on every page load removed - seed only creates default settings/categories on first load
- No demo credentials exposed anywhere in the UI
