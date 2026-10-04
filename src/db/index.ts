import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from './schema';
import fs from 'node:fs';
import path from 'node:path';

// Ensure local data directory exists
const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbUrl = process.env.DATABASE_URL || `file:${path.join(dataDir, 'sigma.db')}`;

export const rawClient = createClient({
  url: dbUrl,
});

export const db = drizzle(rawClient, { schema });

/**
 * Ensures required SQLite tables exist on startup.
 */
export async function ensureDatabaseTables(): Promise<void> {
  await rawClient.execute(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      description TEXT,
      updated_at TEXT DEFAULT (CURRENT_TIMESTAMP)
    );
  `);

  await rawClient.execute(`
    CREATE TABLE IF NOT EXISTS products_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_product_id INTEGER NOT NULL UNIQUE,
      name TEXT NOT NULL,
      category TEXT DEFAULT 'General',
      description TEXT,
      base_price_usdt REAL NOT NULL,
      retail_price_idr INTEGER NOT NULL,
      stock INTEGER DEFAULT 0,
      in_stock INTEGER DEFAULT 1,
      min_quantity INTEGER DEFAULT 1,
      max_quantity INTEGER DEFAULT 5,
      image_url TEXT,
      is_active INTEGER DEFAULT 1,
      last_synced_at TEXT DEFAULT (CURRENT_TIMESTAMP)
    );
  `);

  await rawClient.execute(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      order_number TEXT NOT NULL UNIQUE,
      customer_email TEXT NOT NULL,
      customer_whatsapp TEXT NOT NULL,
      product_id INTEGER NOT NULL,
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      base_price_usdt REAL NOT NULL,
      exchange_rate_idr INTEGER NOT NULL,
      margin_percent REAL NOT NULL,
      total_amount_idr INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING_PAYMENT',
      idempotency_key TEXT NOT NULL UNIQUE,
      supplier_order_id TEXT,
      license_codes TEXT,
      failure_reason TEXT,
      paid_at TEXT,
      fulfilled_at TEXT,
      created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
      updated_at TEXT DEFAULT (CURRENT_TIMESTAMP)
    );
  `);

  await rawClient.execute(`
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      gateway_provider TEXT NOT NULL,
      gateway_reference TEXT NOT NULL,
      payment_method TEXT DEFAULT 'QRIS',
      qr_code_string TEXT,
      payment_url TEXT,
      amount_idr INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'UNPAID',
      expires_at TEXT NOT NULL,
      paid_at TEXT,
      raw_webhook_payload TEXT,
      created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
    );
  `);

  try {
    await rawClient.execute(`ALTER TABLE payments ADD COLUMN payment_url TEXT;`);
  } catch {
    // Column already exists
  }

  try {
    await rawClient.execute(`ALTER TABLE products_cache ADD COLUMN stock INTEGER DEFAULT 0;`);
  } catch {
    // Column already exists
  }

  // Create performance indexes to avoid N+1 bottlenecks and race conditions
  await rawClient.execute(`CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);`);
  await rawClient.execute(`CREATE INDEX IF NOT EXISTS idx_orders_product_id ON orders(product_id);`);
  await rawClient.execute(`CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);`);
  await rawClient.execute(`CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);`);
  await rawClient.execute(`CREATE INDEX IF NOT EXISTS idx_payments_gateway_ref ON payments(gateway_reference);`);
}

// Automatically initialize schema
ensureDatabaseTables().catch((err) => {
  console.error('Failed to initialize SQLite tables:', err);
});

export { schema };
