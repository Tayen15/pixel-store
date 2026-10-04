import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * Global configuration settings (FX rate, profit margin, thresholds).
 */
export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(), // JSON string: { usdt_idr_rate: 16500, margin_percent: 15, fixed_fee_idr: 1500 }
  description: text('description'),
  updatedAt: text('updated_at').default(sql`(CURRENT_TIMESTAMP)`),
});

/**
 * Cached wholesale products from InsightXPro augmented with display metadata.
 */
export const productsCache = sqliteTable('products_cache', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  supplierProductId: integer('supplier_product_id').notNull().unique(),
  name: text('name').notNull(),
  category: text('category').default('General'),
  description: text('description'),
  basePriceUsdt: real('base_price_usdt').notNull(),
  retailPriceIdr: integer('retail_price_idr').notNull(),
  stock: integer('stock').default(0), // Realtime wholesale stock count
  inStock: integer('in_stock', { mode: 'boolean' }).default(true),
  minQuantity: integer('min_quantity').default(1),
  maxQuantity: integer('max_quantity').default(5),
  imageUrl: text('image_url'),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  lastSyncedAt: text('last_synced_at').default(sql`(CURRENT_TIMESTAMP)`),
});

/**
 * Customer order records.
 */
export const orders = sqliteTable('orders', {
  id: text('id').primaryKey(), // UUID v4
  orderNumber: text('order_number').notNull().unique(), // e.g. SIGMA-20261002-8821
  customerEmail: text('customer_email').notNull(),
  customerWhatsapp: text('customer_whatsapp').notNull(),

  productId: integer('product_id').notNull().references(() => productsCache.id),
  productName: text('product_name').notNull(),
  quantity: integer('quantity').notNull().default(1),

  // Pricing snapshot
  basePriceUsdt: real('base_price_usdt').notNull(),
  exchangeRateIdr: integer('exchange_rate_idr').notNull(),
  marginPercent: real('margin_percent').notNull(),
  totalAmountIdr: integer('total_amount_idr').notNull(),

  // Status: PENDING_PAYMENT | PAID | FULFILLING | COMPLETED | FAILED_SUPPLIER | EXPIRED
  status: text('status').notNull().default('PENDING_PAYMENT'),

  // Upstream fulfillment tracking
  idempotencyKey: text('idempotency_key').notNull().unique(),
  supplierOrderId: text('supplier_order_id'),
  licenseCodes: text('license_codes'), // JSON array of string keys
  failureReason: text('failure_reason'),

  paidAt: text('paid_at'),
  fulfilledAt: text('fulfilled_at'),
  createdAt: text('created_at').default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text('updated_at').default(sql`(CURRENT_TIMESTAMP)`),
});

/**
 * QRIS and payment invoice records.
 */
export const payments = sqliteTable('payments', {
  id: text('id').primaryKey(), // UUID v4
  orderId: text('order_id').notNull().references(() => orders.id),
  gatewayProvider: text('gateway_provider').notNull(), // 'tripay' | 'midtrans' | 'mock'
  gatewayReference: text('gateway_reference').notNull(),
  paymentMethod: text('payment_method').default('QRIS'),
  qrCodeString: text('qr_code_string'),
  paymentUrl: text('payment_url'),
  amountIdr: integer('amount_idr').notNull(),
  status: text('status').notNull().default('UNPAID'), // 'UNPAID' | 'PAID' | 'EXPIRED'
  expiresAt: text('expires_at').notNull(),
  paidAt: text('paid_at'),
  rawWebhookPayload: text('raw_webhook_payload'),
  createdAt: text('created_at').default(sql`(CURRENT_TIMESTAMP)`),
});
