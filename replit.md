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
      dashboard.tsx     - Admin dashboard (stats, recent forms, status overview)
      contacts.tsx      - Admin contact management
      products.tsx      - Admin products & inventory
      orders.tsx        - Admin orders view (all orders across all Shopify stores)
      restock-requests.tsx - Admin restock monitoring
      forms.tsx         - Admin forms dashboard (list, create, delete)
      settings.tsx      - Shopify & Zoho integration settings
    portal/
      dashboard.tsx     - Client dashboard (stats, recent forms, quick actions)
      profile.tsx       - Client profile
      products.tsx      - Client products view
      restock.tsx       - Client restock requests
      forms.tsx         - Portal forms list (create, view)
    form-editor.tsx     - Shared form editor (auto-save, submit, status changes)
  components/
    app-sidebar.tsx     - Sidebar navigation
    theme-provider.tsx  - Dark/light mode
    theme-toggle.tsx    - Theme toggle button
    forms/
      file-upload.tsx   - Drag & drop file upload component
      tri-form.tsx      - TRI form (sorting request)
      inspection-form.tsx - Inspection form (work instructions)
    ui/                 - shadcn components
  hooks/
    use-auto-save.ts    - Auto-save hook for form drafts

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
  schema.ts            - Drizzle schemas (contacts, products, restockRequests, shopifyIntegrations, adminSettings, formSubmissions, formUploads)
  models/auth.ts       - Auth-related schemas (users, sessions)
```

## Key Routes
- `/api/auth/user` - Get authenticated user
- `/api/auth/role` - Get user role (admin/client)
- `/api/contacts` - CRUD contacts
- `/api/webhooks/zoho-crm` - Inbound webhook for contact creation (auto-sends invite email)
- `/api/products` - Products management
- `/api/admin/orders` - GET all orders across all active Shopify integrations (aggregated, sorted by date desc)
- `/api/shopify-integrations` - Shopify store connections
- `/api/admin-settings` - Admin settings (Zoho org info)
- `/api/auth/zoho/connect` - Start Zoho OAuth flow (returns redirect URL)
- `/api/auth/zoho/callback` - OAuth callback from Zoho (stores tokens)
- `/api/auth/zoho/disconnect` - Disconnect Zoho Inventory
- `/api/auth/zoho/test` - Test Zoho connection
- `/api/zoho/inventory` - GET all Zoho Inventory items (with cf_client custom field), enriched with contact match
- `/api/zoho/sync-items/:contactId` - Sync Zoho items into app for a contact
- `/api/zoho/push-item/:productId` - Push a product to Zoho Inventory
- `/api/zoho/sync-inventory` - Sync Zoho inventory levels for all pushed products
- `/api/forms` - GET (list forms with filters), POST (create form)
- `/api/forms/:id` - GET/PUT/DELETE individual form
- `/api/forms/upload` - POST file upload (multer, 25MB limit)
- `/api/forms/:id/uploads` - POST create upload record
- `/api/uploads/:filename` - GET serve uploaded file
- `/api/portal/forms` - Client forms list
- `/api/portal/*` - Other client-specific endpoints

## Zoho Inventory Integration
- Uses OAuth 2.0 Authorization Code flow with regional domain support (US/EU/IN/AU/JP/CA)
- `ZOHO_CLIENT_ID` and `ZOHO_CLIENT_SECRET` stored as Replit secrets
- Refresh token, access token, org ID stored in `admin_settings` DB table
- Auto-refreshes access token before every API call
- Redirect URI: `https://{domain}/api/auth/zoho/callback`

## Shopify Integration
- Uses direct Admin API token connection (no OAuth required)
- Admin enters store URL + Admin API access token per client store in Settings → Shopify Integration
- Token is validated immediately via `GET shop.json` before saving
- Connect route: `POST /api/shopify-integrations/connect` with `{ contactId, storeUrl, accessToken }`
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

## Orders Sync (Shopify → DB)
- Orders are cached in a local `shopify_orders` table (no live fetch on page load)
- Background scheduler (`server/shopify-orders-sync.ts`) checks every 60s for integrations due for order sync
- `orderSyncFrequencyMinutes` stored per integration in `shopify_integrations` (0=disabled, 15/30/60/360/720/1440 min)
- `lastOrderSyncAt` tracked per integration
- `GET /api/admin/orders` reads from local DB (fast, no Shopify API call)
- `POST /api/admin/orders/sync` manual trigger (syncs all active integrations immediately)
- "Sync Now" button on Orders page + order sync frequency dropdown per integration in Settings → Shopify Integration card
- Activity logs recorded as type `shopify_orders_sync`

## Shopify Inventory Writeback (Zoho → Shopify)
- After Zoho inventory syncs to the app, those stock levels can be pushed back to Shopify
- Uses `shopifyInventoryItemId` stored per product (captured during Shopify import)
- Shopify API: `POST inventory_levels/set.json` with inventory_item_id, location_id, available
- Location ID cached per store (fetched once from `GET locations.json`)
- Background scheduler (`server/shopify-writeback.ts`) checks every 60s
- `shopifyWritebackFrequencyMinutes` stored in `admin_settings` (0=disabled, 15/30/60/360/720/1440 min)
- `shopifyWritebackLastSyncAt` tracked in `admin_settings`
- Only writes back products that are pushed to Zoho AND have a `shopifyInventoryItemId`
- Frequency configurable in Settings → Zoho Inventory card (shown when connected)
- Shopify OAuth scopes now include `write_inventory` for new connections
- Activity logs recorded as type `shopify_writeback`

## Activity Log
- `activity_logs` DB table tracks all significant events
- Logged events: Shopify auto-sync, Shopify import, Shopify writeback, Zoho push, Zoho inventory sync, contact invite/revoke/delete, product delete, restock requests, form submission, form status change
- Visible in Settings → Activity Log tab with search, type filter, and status filter
- Auto-refreshes every 30 seconds
- `GET /api/activity-logs` endpoint returns up to 500 most recent entries

## Service Request Approval & Zoho Work Orders
- When admin approves a form (in_review → approved), a dialog collects price (CAD) + quantity
- Quantity label adapts per form type: palettes/boîtes/bins/sacs/colis based on `typeEmballage`
- On approval, server automatically:
  1. Creates/finds the client contact in Zoho Inventory (`ensureZohoContact`)
  2. Creates a service-type Zoho Inventory item named `{formNumber} - {Type}`
  3. Creates a Sales Order with quantity/rate from the dialog
  4. Stores `zohoSalesOrderId`, `zohoSalesOrderNumber`, `zohoSalesOrderUrl` on the form
- `price` and `approvedQuantity` stored as admin-only decimals on `form_submissions`
- Admin form detail shows: orange price card + green Work Order card with "Voir dans Zoho" link
- Clients never see price, quantity, or Zoho SO info

## Forms System
- 5 form types: `entreposage` (ENT-xxx), `tri` (TRI-xxx), `inspection` (INS-xxx), `copacking` (F015-xxx), `livraison` (LIV-xxx)
- `form_submissions` table: formType, formNumber, contactId, status, data (JSON text), revision, linkedFormId, revisionHistory
- `form_uploads` table: formSubmissionId, fieldKey, fileName, fileUrl, fileType, fileSize
- Status flow: draft → submitted → in_review → approved → completed
- Server-enforced transitions: clients can only do draft→submitted; admin can advance through workflow
- Clients can only edit drafts; admin can edit any status
- Auto-save: `useAutoSave` hook saves draft data every 30 seconds
- File upload via multer to `uploads/` directory, max 25MB, supports jpg/png/heic/pdf/mp4/mov
- **TRI → Inspection auto-link**: when TRI form is submitted, server auto-creates a linked Inspection form with pre-filled header data
- Both forms get `linkedFormId` set pointing to each other
- `formSubmissions.data` and `revisionHistory` are stored as **jsonb** — no manual JSON.stringify/parse needed
- Email notifications: submission confirmation + status change emails (French)
- Activity log entry created on form submission
- Admin Forms page: table view with type/status filters, create new form for any client
- Portal Forms page: card list view, clients can create tri/entreposage/copacking/livraison forms

## PDF Generation
- `GET /api/forms/:id/pdf` generates and returns a PDF on demand
- Uses `pdfkit` library for server-side PDF generation
- Professional layout: Système-D header with branding, form metadata, section headings, styled tables, page footer with revision/page numbers
- All 5 form types have dedicated rendering: TRI (NC items, contacts table), Inspection (criteria with inline images, approvals), Entreposage (product/delivery sections), Co-packing (time tracking tables, picks, packers), Livraison (destinations, billing)
- Uploaded images (inspection criteria photos) are embedded inline in the PDF
- Permission checks: admin can download any form, client can download their own. Draft forms cannot be exported.
- "Download PDF" button visible in form editor for all submitted+ forms (both admin and client)
- PDF file: `server/pdf-generator.ts`

## User Roles
- First authenticated user is Admin
- Users whose email matches a contact record become Clients
- Contacts are created via Zoho CRM webhook
