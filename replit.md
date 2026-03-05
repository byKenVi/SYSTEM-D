# SYSTEM D - Client Portal & Admin Panel

## Overview
Full-stack web application for a warehousing and storage business. Two interfaces: Admin Panel and Client Portal. Uses Replit Auth for authentication.

## Tech Stack
- **Frontend**: React + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Express.js + Node.js
- **Database**: PostgreSQL (Neon) with Drizzle ORM
- **Auth**: Replit Auth (OpenID Connect)

## Project Architecture
```
client/src/
  pages/
    landing.tsx         - Landing page for unauthenticated users
    admin/
      contacts.tsx      - Admin contact management
      products.tsx      - Admin products & inventory
      restock-requests.tsx - Admin restock monitoring
      settings.tsx      - Shopify & Zoho integration settings
    portal/
      profile.tsx       - Client profile
      products.tsx      - Client products view
      restock.tsx       - Client restock requests
  components/
    app-sidebar.tsx     - Sidebar navigation
    theme-provider.tsx  - Dark/light mode
    theme-toggle.tsx    - Theme toggle button
    ui/                 - shadcn components

server/
  index.ts             - Express server entry
  routes.ts            - All API routes
  storage.ts           - Database storage layer
  db.ts                - Database connection
  seed.ts              - Seed data
  resend.ts            - Email sending via Resend integration
  zoho-auth.ts         - Zoho OAuth 2.0 flow (auth URL, token exchange, refresh)
  zoho-api.ts          - Zoho Inventory API calls (items, contacts, sales orders)
  shopify-sync.ts      - Background auto-sync scheduler for Shopify products
  replit_integrations/auth/ - Replit Auth integration

shared/
  schema.ts            - Drizzle schemas (contacts, products, restockRequests, shopifyIntegrations, adminSettings)
  models/auth.ts       - Auth-related schemas (users, sessions)
```

## Key Routes
- `/api/auth/user` - Get authenticated user
- `/api/auth/role` - Get user role (admin/client)
- `/api/contacts` - CRUD contacts
- `/api/webhooks/zoho-crm` - Inbound webhook for contact creation (auto-sends invite email)
- `/api/products` - Products management
- `/api/shopify-integrations` - Shopify store connections
- `/api/admin-settings` - Admin settings (Zoho org info)
- `/api/auth/zoho/connect` - Start Zoho OAuth flow (returns redirect URL)
- `/api/auth/zoho/callback` - OAuth callback from Zoho (stores tokens)
- `/api/auth/zoho/disconnect` - Disconnect Zoho Inventory
- `/api/auth/zoho/test` - Test Zoho connection
- `/api/zoho/sync-items/:contactId` - Sync Zoho items into app for a contact
- `/api/zoho/push-item/:productId` - Push a product to Zoho Inventory
- `/api/zoho/sync-inventory` - Sync Zoho inventory levels for all pushed products
- `/api/portal/*` - Client-specific endpoints

## Zoho Inventory Integration
- Uses OAuth 2.0 Authorization Code flow with regional domain support (US/EU/IN/AU/JP/CA)
- `ZOHO_CLIENT_ID` and `ZOHO_CLIENT_SECRET` stored as Replit secrets
- Refresh token, access token, org ID stored in `admin_settings` DB table
- Auto-refreshes access token before every API call
- Redirect URI: `https://{domain}/api/auth/zoho/callback`

## Shopify Integration
- Uses OAuth 2.0 flow via `server/shopify-api.ts`
- Admin configures Shopify app credentials (Client ID, Client Secret) in Settings → App Settings
- Shopify app credentials stored in `admin_settings` table (`shopifyAppClientId`, `shopifyAppClientSecret`)
- Per-client store connections use OAuth redirect → Shopify authorization → callback with access token
- OAuth routes: `/api/auth/shopify/connect` (initiate), `/api/auth/shopify/callback` (exchange code for token)
- Redirect URI: `https://{domain}/api/auth/shopify/callback`
- Access tokens stored in `shopify_integrations` table per client (`accessToken`, `storeUrl`, `shopName`, `scope`)
- Products capture full details: name, SKU, barcode, description, image, vendor, product type, tags, weight, price, compare-at price, status, handle
- Each variant is a separate product row; upserted by `(contactId, shopifyVariantId)` to avoid duplicates
- Variant-specific images are used when available
- Pagination handled via Link header for stores with 250+ products
- Products table shows "Source" column; clicking a product row opens detail dialog with image and all fields
- Auto-sync: per-integration `syncFrequencyMinutes` (0=disabled, 15/30/60/360/720/1440 minutes)
- Background scheduler (`server/shopify-sync.ts`) checks every 60s for integrations due for sync
- Auto-sync only updates products that were previously imported (not all Shopify products)
- Auto-sync preserves Zoho state (pushedToZoho, zohoItemId, zohoInventoryQuantity) and uses Zoho inventory as source of truth when available
- `lastAutoSyncAt` tracked per integration

## Inventory Source of Truth
- `inventoryQuantity` = Shopify/local stock count
- `zohoInventoryQuantity` = Zoho Inventory stock (nullable, only set for pushed products)
- When a product is pushed to Zoho, Zoho becomes source of truth for inventory
- During Shopify sync/import, if product has Zoho inventory, Zoho quantity is used instead of Shopify's
- "Sync Zoho Inventory" button on Products page fetches latest stock from Zoho for all pushed products
- Products table shows separate "Zoho Stock" column for pushed products
- Auto-sync: `zohoSyncFrequencyMinutes` stored in `admin_settings` (0=disabled, 15/30/60/360/720/1440 min)
- Background scheduler (`server/zoho-sync.ts`) checks every 60s for when Zoho sync is due
- `zohoLastAutoSyncAt` tracked in `admin_settings` to determine sync cadence
- Auto-sync frequency configurable in Settings → Zoho Inventory card (shown when connected)

## Activity Log
- New `activity_logs` DB table tracks all significant events
- Logged events: Shopify auto-sync, Shopify import, Zoho push, Zoho inventory sync, contact invite/revoke/delete, product delete, restock requests
- Admin page at `/admin/logs` with search, type filter, and status filter
- Auto-refreshes every 30 seconds
- `GET /api/activity-logs` endpoint returns up to 500 most recent entries

## User Roles
- First authenticated user is Admin
- Users whose email matches a contact record become Clients
- Contacts are created via Zoho CRM webhook
