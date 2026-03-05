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
- Products imported from Shopify are stored with `shopifyProductId`, `shopifyVariantId`, `shopifyStoreUrl`
- Each variant is a separate product row; upserted by `(contactId, shopifyVariantId)` to avoid duplicates
- Pagination handled via Link header for stores with 250+ products
- Products table shows "Source" column with Shopify store link when imported from Shopify

## User Roles
- First authenticated user is Admin
- Users whose email matches a contact record become Clients
- Contacts are created via Zoho CRM webhook
