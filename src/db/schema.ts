import { pgTable, text, varchar, integer, doublePrecision, boolean, timestamp, serial } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Global configuration settings (FX rate, profit margin, thresholds).
 */
export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(), // JSON string: { usdt_idr_rate: 16500, margin_percent: 15, fixed_fee_idr: 1500 }
  description: text('description'),
  updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true }).default(sql`CURRENT_TIMESTAMP`),
});

/**
 * Account users (customers and administrators).
 */
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

/**
 * Active authenticated user sessions.
 */
export const userSessions = pgTable('user_sessions', {
  id: text('id').primaryKey(), // UUID string
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { mode: 'string', withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).default(sql`CURRENT_TIMESTAMP`),
});

/**
 * Cached wholesale products from InsightXPro augmented with display metadata.
 */
export const productsCache = pgTable('products_cache', {
  id: serial('id').primaryKey(),
  supplierProductId: integer('supplier_product_id').notNull().unique(),
  name: text('name').notNull(),
  category: text('category').default('General'),
  description: text('description'),
  basePriceUsdt: doublePrecision('base_price_usdt').notNull(),
  retailPriceIdr: integer('retail_price_idr').notNull(),
  customRetailPriceIdr: integer('custom_retail_price_idr'), // Optional manual price override set by admin in dashboard
  stock: integer('stock').default(0), // Realtime wholesale stock count
  inStock: boolean('in_stock').default(true),
  minQuantity: integer('min_quantity').default(1),
  maxQuantity: integer('max_quantity').default(5),
  imageUrl: text('image_url'),
  isActive: boolean('is_active').default(true),
  isTopProduct: boolean('is_top_product').default(false),
  lastSyncedAt: timestamp('last_synced_at', { mode: 'string', withTimezone: true }).default(sql`CURRENT_TIMESTAMP`),
});

/**
 * Customer order records.
 */
export const orders = pgTable('orders', {
  id: text('id').primaryKey(), // UUID v4
  orderNumber: text('order_number').notNull().unique(), // e.g. SIGMA-20261002-8821
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }), // Optional link to registered user
  customerEmail: text('customer_email').notNull(),
  customerWhatsapp: text('customer_whatsapp').notNull(),

  productId: integer('product_id').notNull().references(() => productsCache.id),
  productName: text('product_name').notNull(),
  quantity: integer('quantity').notNull().default(1),

  // Pricing snapshot
  basePriceUsdt: doublePrecision('base_price_usdt').notNull(),
  exchangeRateIdr: integer('exchange_rate_idr').notNull(),
  marginPercent: doublePrecision('margin_percent').notNull(),
  totalAmountIdr: integer('total_amount_idr').notNull(),

  // Status: PENDING_PAYMENT | PAID | FULFILLING | COMPLETED | FAILED_SUPPLIER | EXPIRED
  status: text('status').notNull().default('PENDING_PAYMENT'),

  // Upstream fulfillment tracking
  idempotencyKey: text('idempotency_key').notNull().unique(),
  supplierOrderId: text('supplier_order_id'),
  licenseCodes: text('license_codes'), // JSON array of string keys
  failureReason: text('failure_reason'),

  paidAt: timestamp('paid_at', { mode: 'string', withTimezone: true }),
  fulfilledAt: timestamp('fulfilled_at', { mode: 'string', withTimezone: true }),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true }).default(sql`CURRENT_TIMESTAMP`),
});

/**
 * QRIS and payment invoice records.
 */
export const payments = pgTable('payments', {
  id: text('id').primaryKey(), // UUID v4
  orderId: text('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  gatewayProvider: text('gateway_provider').notNull(), // 'tripay' | 'midtrans' | 'tako' | 'mock'
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

/**
 * Customer Support Conversations (In-app Live Chat between Admin and Buyer)
 */
export const supportConversations = pgTable('support_conversations', {
  id: text('id').primaryKey(), // conv_...
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  buyerSessionId: text('buyer_session_id').notNull(), // persistent client session token
  buyerName: varchar('buyer_name', { length: 255 }).notNull().default('Pelanggan'),
  buyerEmail: varchar('buyer_email', { length: 255 }),
  orderNumber: text('order_number'),
  status: varchar('status', { length: 50 }).notNull().default('OPEN'), // 'OPEN' | 'RESOLVED'
  lastMessageText: text('last_message_text'),
  lastMessageSender: varchar('last_message_sender', { length: 20 }), // 'BUYER' | 'ADMIN' | 'SYSTEM'
  unreadByAdmin: integer('unread_by_admin').notNull().default(0),
  unreadByBuyer: integer('unread_by_buyer').notNull().default(0),
  lastMessageAt: timestamp('last_message_at', { mode: 'string', withTimezone: true }).default(sql`CURRENT_TIMESTAMP`),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true }).default(sql`CURRENT_TIMESTAMP`),
});

/**
 * Customer Support Messages
 */
export const supportMessages = pgTable('support_messages', {
  id: text('id').primaryKey(), // msg_...
  conversationId: text('conversation_id').notNull().references(() => supportConversations.id, { onDelete: 'cascade' }),
  senderType: varchar('sender_type', { length: 20 }).notNull(), // 'BUYER' | 'ADMIN' | 'SYSTEM'
  senderName: varchar('sender_name', { length: 255 }).notNull(),
  message: text('message').notNull(),
  isRead: boolean('is_read').default(false),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).default(sql`CURRENT_TIMESTAMP`),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserSession = typeof userSessions.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type Payment = typeof payments.$inferSelect;
export type ProductCache = typeof productsCache.$inferSelect;
export type AppSetting = typeof appSettings.$inferSelect;
export type SupportConversation = typeof supportConversations.$inferSelect;
export type SupportMessage = typeof supportMessages.$inferSelect;
