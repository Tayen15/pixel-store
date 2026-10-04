# Technical Specification - Sigma Store (Astro + SQLite)

## 1. Embedded Data Models & Schema (Drizzle ORM + SQLite)

Database is stored in a local SQLite file (`./data/sigma.db`) with WAL mode enabled.

### 1.1 Drizzle Schema Definition (`src/db/schema.ts`)

```typescript
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// Global application configuration (FX rates, profit margin, alert thresholds)
export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(), // JSON string: { usdt_idr_rate: 16500, margin_percent: 15, fixed_fee_idr: 1500 }
  description: text('description'),
  updatedAt: text('updated_at').default(sql`(CURRENT_TIMESTAMP)`),
});

// Cached supplier products augmented with local store metadata
export const productsCache = sqliteTable('products_cache', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  supplierProductId: integer('supplier_product_id').notNull().unique(),
  name: text('name').notNull(),
  category: text('category').default('General'),
  description: text('description'),
  basePriceUsdt: real('base_price_usdt').notNull(),
  retailPriceIdr: integer('retail_price_idr').notNull(),
  inStock: integer('in_stock', { mode: 'boolean' }).default(true),
  minQuantity: integer('min_quantity').default(1),
  maxQuantity: integer('max_quantity').default(5),
  imageUrl: text('image_url'),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  lastSyncedAt: text('last_synced_at').default(sql`(CURRENT_TIMESTAMP)`),
});

// Customer orders
export const orders = sqliteTable('orders', {
  id: text('id').primaryKey(), // UUID v4
  orderNumber: text('order_number').notNull().unique(), // e.g. SIGMA-20261002-XXXX
  customerEmail: text('customer_email').notNull(),
  customerWhatsapp: text('customer_whatsapp').notNull(),
  
  productId: integer('product_id').notNull().references(() => productsCache.id),
  productName: text('product_name').notNull(),
  quantity: integer('quantity').notNull().default(1),
  
  // Financial snapshot at time of checkout
  basePriceUsdt: real('base_price_usdt').notNull(),
  exchangeRateIdr: integer('exchange_rate_idr').notNull(),
  marginPercent: real('margin_percent').notNull(),
  totalAmountIdr: integer('total_amount_idr').notNull(),
  
  // Status: PENDING_PAYMENT, PAID, FULFILLING, COMPLETED, FAILED_SUPPLIER, EXPIRED
  status: text('status').notNull().default('PENDING_PAYMENT'),
  
  // Upstream fulfillment & idempotency
  idempotencyKey: text('idempotency_key').notNull().unique(),
  supplierOrderId: text('supplier_order_id'),
  licenseCodes: text('license_codes'), // JSON array of string keys
  failureReason: text('failure_reason'),
  
  paidAt: text('paid_at'),
  fulfilledAt: text('fulfilled_at'),
  createdAt: text('created_at').default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text('updated_at').default(sql`(CURRENT_TIMESTAMP)`),
});

// Payment invoices and QRIS strings
export const payments = sqliteTable('payments', {
  id: text('id').primaryKey(), // UUID v4
  orderId: text('order_id').notNull().references(() => orders.id),
  gatewayProvider: text('gateway_provider').notNull(), // 'tripay' | 'midtrans' | 'mock'
  gatewayReference: text('gateway_reference').notNull(),
  paymentMethod: text('payment_method').default('QRIS'),
  qrCodeString: text('qr_code_string'),
  amountIdr: integer('amount_idr').notNull(),
  status: text('status').notNull().default('UNPAID'), // 'UNPAID' | 'PAID' | 'EXPIRED'
  expiresAt: text('expires_at').notNull(),
  paidAt: text('paid_at'),
  rawWebhookPayload: text('raw_webhook_payload'),
  createdAt: text('created_at').default(sql`(CURRENT_TIMESTAMP)`),
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

## 3. Astro Actions (`src/actions/index.ts`)

Astro Actions provide end-to-end typed Remote Procedure Calls (RPC) with automatic input validation using Zod.

```typescript
import { defineAction } from 'astro:actions';
import { z } from 'astro:schema';

export const server = {
  // Action 1: Create Checkout Order & Generate QRIS
  createCheckout: defineAction({
    input: z.object({
      productId: z.number().int().positive(),
      quantity: z.number().int().min(1).max(5).default(1),
      email: z.string().email('Email tidak valid'),
      whatsapp: z.string().regex(/^(\+62|62|08)[0-9]{8,13}$/, 'Nomor WhatsApp tidak valid'),
    }),
    handler: async (input, context) => {
      // 1. Pre-flight check upstream balance
      // 2. Calculate dynamic price (USDT -> IDR + Margin)
      // 3. Request QRIS invoice from Payment Gateway
      // 4. Record order into SQLite
      // 5. Return QRIS string and orderNumber
      return {
        orderNumber: 'SIGMA-20261002-8821',
        amountIdr: 149000,
        qrCodeString: '00020101021226...',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      };
    },
  }),

  // Action 2: Check Order Status (Real-time polling from frontend)
  checkOrderStatus: defineAction({
    input: z.object({
      orderNumber: z.string().min(5),
    }),
    handler: async ({ orderNumber }) => {
      // Returns order status and decrypted codes if COMPLETED
      return {
        orderNumber,
        status: 'COMPLETED',
        codes: ['WIN11-PRO-XXXX-YYYY-ZZZZ'],
      };
    },
  }),
};
```

---

## 4. Webhook Route Handler (`src/pages/api/webhooks/payment.ts`)

```typescript
import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
  try {
    const rawPayload = await request.text();
    const signature = request.headers.get('x-callback-signature') || '';

    // 1. Verify Payment Gateway HMAC signature
    // 2. Parse payload & fetch order from SQLite
    // 3. Atomic transition: PENDING_PAYMENT -> FULFILLING
    // 4. Call InsightXPro placeOrder with stored idempotency_key
    // 5. Save delivered keys and mark COMPLETED
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
```
