# Technical Specification - Pixel Store (Astro + PostgreSQL)

## 1. Data Models & PostgreSQL Schema (Drizzle ORM + PostgreSQL)

Database connection is managed via `postgres.js` with SSL support (`sslmode=require`) connecting to a PostgreSQL instance (e.g. Supabase, Neon, Railway, or local).

### 1.1 Drizzle Schema Definition (`src/db/schema.ts`)

```typescript
import { pgTable, text, varchar, integer, doublePrecision, boolean, timestamp, serial } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Global application configuration (FX rates, profit margin, alert thresholds)
export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(), // JSON string: { usdt_idr_rate: 16500, margin_percent: 15, fixed_fee_idr: 1500 }
  description: text('description'),
  updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true }).default(sql`CURRENT_TIMESTAMP`),
});

// Account users (customers and administrators)
export const users = pgTable('users', {
  id: text('id').primaryKey(), // UUID string
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 50 }),
  role: varchar('role', { length: 20 }).notNull().default('customer'), // 'customer' | 'admin'
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true }).default(sql`CURRENT_TIMESTAMP`),
});

// User authenticated sessions
export const userSessions = pgTable('user_sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { mode: 'string', withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).default(sql`CURRENT_TIMESTAMP`),
});

// Cached supplier products augmented with local store metadata
export const productsCache = pgTable('products_cache', {
  id: serial('id').primaryKey(),
  supplierProductId: integer('supplier_product_id').notNull().unique(),
  name: text('name').notNull(),
  category: text('category').default('General'),
  description: text('description'),
  basePriceUsdt: doublePrecision('base_price_usdt').notNull(),
  retailPriceIdr: integer('retail_price_idr').notNull(),
  stock: integer('stock').default(0),
  inStock: boolean('in_stock').default(true),
  minQuantity: integer('min_quantity').default(1),
  maxQuantity: integer('max_quantity').default(5),
  imageUrl: text('image_url'),
  isActive: boolean('is_active').default(true),
  lastSyncedAt: timestamp('last_synced_at', { mode: 'string', withTimezone: true }).default(sql`CURRENT_TIMESTAMP`),
});

// Customer orders
export const orders = pgTable('orders', {
  id: text('id').primaryKey(), // UUID v4
  orderNumber: text('order_number').notNull().unique(), // e.g. PIXEL-20261004-XXXX
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }), // Optional link to registered account
  customerEmail: text('customer_email').notNull(),
  customerWhatsapp: text('customer_whatsapp').notNull(),
  
  productId: integer('product_id').notNull().references(() => productsCache.id),
  productName: text('product_name').notNull(),
  quantity: integer('quantity').notNull().default(1),
  
  // Financial snapshot at time of checkout
  basePriceUsdt: doublePrecision('base_price_usdt').notNull(),
  exchangeRateIdr: integer('exchange_rate_idr').notNull(),
  marginPercent: doublePrecision('margin_percent').notNull(),
  totalAmountIdr: integer('total_amount_idr').notNull(),
  
  // Status: PENDING_PAYMENT, PAID, FULFILLING, COMPLETED, FAILED_SUPPLIER, EXPIRED
  status: text('status').notNull().default('PENDING_PAYMENT'),
  
  // Upstream fulfillment & idempotency
  idempotencyKey: text('idempotency_key').notNull().unique(),
  supplierOrderId: text('supplier_order_id'),
  licenseCodes: text('license_codes'), // JSON array of string keys
  failureReason: text('failure_reason'),
  
  paidAt: timestamp('paid_at', { mode: 'string', withTimezone: true }),
  fulfilledAt: timestamp('fulfilled_at', { mode: 'string', withTimezone: true }),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true }).default(sql`CURRENT_TIMESTAMP`),
});

// Payment invoices and QRIS strings
export const payments = pgTable('payments', {
  id: text('id').primaryKey(), // UUID v4
  orderId: text('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  gatewayProvider: text('gateway_provider').notNull(), // 'tako' | 'midtrans' | 'mock'
  gatewayReference: text('gateway_reference').notNull(),
  paymentMethod: text('payment_method').default('QRIS'),
  qrCodeString: text('qr_code_string'),
  paymentUrl: text('payment_url'),
  amountIdr: integer('amount_idr').notNull(),
  status: text('status').notNull().default('UNPAID'), // 'UNPAID' | 'PAID' | 'EXPIRED'
  expiresAt: text('expires_at').notNull(),
  paidAt: timestamp('paid_at', { mode: 'string', withTimezone: true }),
  rawWebhookPayload: text('raw_webhook_payload'),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).default(sql`CURRENT_TIMESTAMP`),
});
```

---

## 2. API Integration Specifications

### 2.1 InsightXPro Wholesale Client (`src/lib/insightxpro/client.ts`)

```typescript
export interface InsightProduct {
  id: number;
  name: string;
  category?: string;
  price: string | number; // in USDT
  stock?: number | boolean;
  min_quantity?: number;
  max_quantity?: number;
}

export interface InsightBalance {
  balance: number; // in USDT
  currency: "USDT";
  recent_ledger?: Array<{
    id: string;
    amount: number;
    description: string;
    created_at: string;
  }>;
}

export interface PlaceOrderPayload {
  product_id: number;
  quantity: number;
}

export interface PlaceOrderResponse {
  order_id: number | string;
  status: "completed" | "processing" | "failed";
  product_id: number;
  quantity: number;
  total_usdt: number;
  codes?: string[]; // The delivered license keys/vouchers
  created_at: string;
}

export class InsightXProClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(apiKey: string, baseUrl = 'https://api.insightxpro.store') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async checkHealth(): Promise<boolean> {
    const res = await fetch(`${this.baseUrl}/api/v1/health`);
    return res.ok;
  }

  async getProducts(): Promise<InsightProduct[]> {
    const res = await fetch(`${this.baseUrl}/api/v1/products`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) throw new Error(`Failed to fetch catalog: ${res.statusText}`);
    return res.json();
  }

  async getBalance(): Promise<InsightBalance> {
    const res = await fetch(`${this.baseUrl}/api/v1/balance`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) throw new Error(`Failed to fetch balance: ${res.statusText}`);
    return res.json();
  }

  async placeOrder(payload: PlaceOrderPayload, idempotencyKey: string): Promise<PlaceOrderResponse> {
    const res = await fetch(`${this.baseUrl}/api/v1/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Upstream order failed: ${err}`);
    }
    return res.json();
  }
}
```

---

## 3. Next.js Server Actions (`src/app/actions.ts`)

Next.js Server Actions provide end-to-end typed RPC with automatic input validation using Zod schemas and async cookies.

```typescript
'use server';

import { z } from 'zod';
import type { ActionResponse } from '@/types/actions';

// Action 1: Create Checkout Order & Generate QRIS
export async function createCheckout(input: {
  productId: number;
  quantity?: number;
  email?: string;
  whatsapp?: string;
}): Promise<ActionResponse<{
  orderNumber: string;
  amountIdr: number;
  qrCodeString: string;
  paymentUrl: string;
  expiresAt: string;
}>> {
  // 1. Zod validation
  // 2. Pre-flight check upstream balance
  // 3. Request QRIS invoice from Doit.id
  // 4. Record order into PostgreSQL
  // 5. Return QRIS payload and orderNumber
}

// Action 2: Get Order Status (Real-time polling from frontend)
export async function getOrderStatus(input: {
  orderNumber: string;
}): Promise<ActionResponse<{
  orderNumber: string;
  status: string;
  licenseCodes: string[];
}>> {
  // Returns order status and decrypted codes if COMPLETED
}
```

---

## 4. Webhook Route Handler (`src/app/api/webhooks/doit/route.ts`)

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { executeOrderFulfillment } from '@/lib/order/fulfillment';

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('PayBridge-Signature') || req.headers.get('x-callback-signature') || '';

    // 1. Verify Doit.id HMAC signature
    // 2. Parse payload & fetch order by reference (orderNumber)
    // 3. Atomic lock & execute fulfillment: executeOrderFulfillment(order.id, 'webhook_doit', rawBody)
    // 4. Call InsightXPro placeOrder with stored idempotency_key
    // 5. Save delivered keys, mark COMPLETED, and send automated email receipt
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
```

---

## 5. Neon Managed Better Auth (`@neondatabase/auth`)

### 5.1 Environment Configuration
```bash
NEON_AUTH_BASE_URL=https://ep-steep-mode-b38excf1.neonauth.c-4.ap-southeast-1.aws.neon.tech/neondb/auth
NEON_AUTH_JWKS_URL=https://ep-steep-mode-b38excf1.neonauth.c-4.ap-southeast-1.aws.neon.tech/neondb/auth/.well-known/jwks.json
NEON_AUTH_COOKIE_SECRET=<32-byte-base64-secret>
```

### 5.2 Server & Client Modules
- **Server Instance (`src/lib/auth/server.ts`)**:
  ```typescript
  import { createNeonAuth } from '@neondatabase/auth/next/server';

  export const auth = createNeonAuth({
    baseUrl: process.env.NEON_AUTH_BASE_URL!,
    cookies: { secret: process.env.NEON_AUTH_COOKIE_SECRET! },
    logLevel: 'warn',
  });
  ```
- **Client Instance (`src/lib/auth/client.ts`)**:
  ```typescript
  'use client';
  import { createAuthClient } from '@neondatabase/auth/next';

  export const authClient = createAuthClient();
  ```
- **Proxy Route Handler (`src/app/api/auth/[...path]/route.ts`)**:
  ```typescript
  import { auth } from '@/lib/auth/server';

  export const { GET, POST } = auth.handler();
  ```

### 5.3 Server Actions Integration
- `registerUser`: Invokes `neonAuth.signUp.email`, synchronizes local PostgreSQL record (`users` table), generates session token.
- `loginUser`: Invokes `neonAuth.signIn.email`, validates customer credentials, sets 30-day session cookie.
- `logoutUser`: Invokes `neonAuth.signOut()`, purges active session token from cookie and database.
- `getCurrentUser`: Prioritizes `neonAuth.getSession()`, with transparent fallback to local session verification.

### 5.4 Admin Plugin Integration (`auth.admin`)
- `adminLogin`: Accepts `email` & `password`, verifies credentials via `neonAuth.signIn.email`, confirms `role: 'admin'`, and issues 7-day signed admin session.
- `adminRegister`: Registers new administrator account in Better Auth and local DB using Master Secret PIN validation.
- `adminSetUserRole`: Promotes customer account to admin or revokes role (`auth.admin.setRole({ userId, role })`).
- `adminBanUser`: Bans user account via `auth.admin.banUser({ userId, banReason })`.
- `getAdminSession`: Resolves authenticated admin identity across Neon Better Auth session and HTTP-only cookie tokens.
