# StockVault - Client Portal & Admin Panel

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
  replit_integrations/auth/ - Replit Auth integration

shared/
  schema.ts            - Drizzle schemas (contacts, products, restockRequests, shopifyIntegrations, adminSettings)
  models/auth.ts       - Auth-related schemas (users, sessions)
```

## Key Routes
- `/api/auth/user` - Get authenticated user
- `/api/auth/role` - Get user role (admin/client)
- `/api/contacts` - CRUD contacts
- `/api/webhooks/zoho-crm` - Inbound webhook for contact creation
- `/api/products` - Products management
- `/api/products/push-to-zoho` - Push products to Zoho
- `/api/shopify-integrations` - Shopify store connections
- `/api/admin-settings` - Zoho Inventory credentials
- `/api/portal/*` - Client-specific endpoints

## User Roles
- First authenticated user is Admin
- Users whose email matches a contact record become Clients
- Contacts are created via Zoho CRM webhook
