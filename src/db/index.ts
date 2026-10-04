import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import '../lib/env'; // Ensure process.env is populated in Astro/Vite SSR
import fs from 'node:fs';
import path from 'node:path';

function resolveDatabaseUrl(): string {
  let url = (process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL)?.trim();

  if (!url || (!url.startsWith('postgres://') && !url.startsWith('postgresql://'))) {
    try {
      const envPath = path.resolve(process.cwd(), '.env');
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf-8');
        const matchPooled = content.match(/^DATABASE_URL_POOLED=["']?([^"'\r\n]+)["']?/m);
        const matchDirect = content.match(/^DATABASE_URL=["']?([^"'\r\n]+)["']?/m);
        const found = matchPooled?.[1] || matchDirect?.[1];
        if (found) {
          url = found.trim();
        }
      }
    } catch {}
  }

  if (url) {
    url = url.replace(/^['"]|['"]$/g, '').trim();
    process.env.DATABASE_URL = url;
    return url;
  }

  return 'postgresql://postgres:postgres@localhost:5432/sigma_store';
}

export const dbUrl = resolveDatabaseUrl();
const isPostgresUrl = Boolean(
  dbUrl &&
  (dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://')) &&
  !dbUrl.includes('localhost:5432')
);

const isSslRequired =
  dbUrl.includes('sslmode=require') ||
  dbUrl.includes('neon.tech') ||
  dbUrl.includes('supabase.co') ||
  dbUrl.includes('railway.app') ||
  dbUrl.includes('render.com');

export const sqlClient = postgres(dbUrl, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  ssl: isSslRequired ? 'require' : false,
  prepare: false, // Essential for Neon pooler / PgBouncer
  onnotice: () => {}, // Suppress benign PostgreSQL NOTICE messages (e.g. relation already exists)
});

export const db = drizzle(sqlClient, { schema });

let initPromise: Promise<void> | null = null;

/**
 * Ensures required PostgreSQL tables and indexes exist on startup.
 * Uses a singleton promise to avoid race condition collisions during parallel imports.
 */
export async function ensureDatabaseTables(): Promise<void> {
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    if (!isPostgresUrl) {
      console.warn(
        '[PostgreSQL] DATABASE_URL di .env belum diarahkan ke database PostgreSQL yang valid.'
      );
    }

    try {
      // 1. Application Settings
      try {
        await sqlClient`
          CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            description TEXT,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );
        `;
      } catch (err) {
        console.warn('app_settings table init notice:', (err as Error).message);
      }

      // 2. Account Users
      try {
        await sqlClient`
          CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email VARCHAR(255) NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            name VARCHAR(255) NOT NULL,
            phone VARCHAR(50),
            role VARCHAR(20) NOT NULL DEFAULT 'customer',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );
        `;
      } catch (err) {
        console.warn('users table init notice:', (err as Error).message);
      }

      // 3. User Sessions
      try {
        await sqlClient`
          CREATE TABLE IF NOT EXISTS user_sessions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            token TEXT NOT NULL UNIQUE,
            expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );
        `;
      } catch (err) {
        console.warn('user_sessions table init notice:', (err as Error).message);
      }

      // 4. Products Cache
      try {
        await sqlClient`
          CREATE TABLE IF NOT EXISTS products_cache (
            id SERIAL PRIMARY KEY,
            supplier_product_id INTEGER NOT NULL UNIQUE,
            name TEXT NOT NULL,
            category TEXT DEFAULT 'General',
            description TEXT,
            base_price_usdt DOUBLE PRECISION NOT NULL,
            retail_price_idr INTEGER NOT NULL,
            stock INTEGER DEFAULT 0,
            in_stock BOOLEAN DEFAULT TRUE,
            min_quantity INTEGER DEFAULT 1,
            max_quantity INTEGER DEFAULT 5,
            image_url TEXT,
            is_active BOOLEAN DEFAULT TRUE,
            last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );
        `;
      } catch (err) {
        console.warn('products_cache table init notice:', (err as Error).message);
      }

      // 5. Customer Orders
      try {
        await sqlClient`
          CREATE TABLE IF NOT EXISTS orders (
            id TEXT PRIMARY KEY,
            order_number TEXT NOT NULL UNIQUE,
            user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
            customer_email TEXT NOT NULL,
            customer_whatsapp TEXT NOT NULL,
            product_id INTEGER NOT NULL REFERENCES products_cache(id),
            product_name TEXT NOT NULL,
            quantity INTEGER NOT NULL DEFAULT 1,
            base_price_usdt DOUBLE PRECISION NOT NULL,
            exchange_rate_idr INTEGER NOT NULL,
            margin_percent DOUBLE PRECISION NOT NULL,
            total_amount_idr INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'PENDING_PAYMENT',
            idempotency_key TEXT NOT NULL UNIQUE,
            supplier_order_id TEXT,
            license_codes TEXT,
            failure_reason TEXT,
            paid_at TIMESTAMP WITH TIME ZONE,
            fulfilled_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );
        `;
      } catch (err) {
        console.warn('orders table init notice:', (err as Error).message);
      }

      // 6. Payments
      try {
        await sqlClient`
          CREATE TABLE IF NOT EXISTS payments (
            id TEXT PRIMARY KEY,
            order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
            gateway_provider TEXT NOT NULL,
            gateway_reference TEXT NOT NULL,
            payment_method TEXT DEFAULT 'QRIS',
            qr_code_string TEXT,
            payment_url TEXT,
            amount_idr INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'UNPAID',
            expires_at TEXT NOT NULL,
            paid_at TIMESTAMP WITH TIME ZONE,
            raw_webhook_payload TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );
        `;
      } catch (err) {
        console.warn('payments table init notice:', (err as Error).message);
      }

      // Safe column additions
      try {
        await sqlClient`ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id) ON DELETE SET NULL;`;
      } catch {}

      try {
        await sqlClient`ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_url TEXT;`;
      } catch {}

      try {
        await sqlClient`ALTER TABLE products_cache ADD COLUMN IF NOT EXISTS stock INTEGER DEFAULT 0;`;
      } catch {}

      try {
        await sqlClient`ALTER TABLE products_cache ADD COLUMN IF NOT EXISTS is_top_product BOOLEAN DEFAULT FALSE;`;
      } catch {}

      try {
        await sqlClient`ALTER TABLE products_cache ADD COLUMN IF NOT EXISTS custom_retail_price_idr INTEGER;`;
      } catch {}

      // 7. Support Conversations
      try {
        await sqlClient`
          CREATE TABLE IF NOT EXISTS support_conversations (
            id TEXT PRIMARY KEY,
            buyer_session_id TEXT NOT NULL,
            buyer_name VARCHAR(255) NOT NULL DEFAULT 'Pelanggan',
            buyer_email VARCHAR(255),
            order_number TEXT,
            status VARCHAR(50) NOT NULL DEFAULT 'OPEN',
            last_message_text TEXT,
            last_message_sender VARCHAR(20),
            unread_by_admin INTEGER NOT NULL DEFAULT 0,
            unread_by_buyer INTEGER NOT NULL DEFAULT 0,
            last_message_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );
        `;
      } catch (err) {
        console.warn('support_conversations table init notice:', (err as Error).message);
      }

      // 8. Support Messages
      try {
        await sqlClient`
          CREATE TABLE IF NOT EXISTS support_messages (
            id TEXT PRIMARY KEY,
            conversation_id TEXT NOT NULL REFERENCES support_conversations(id) ON DELETE CASCADE,
            sender_type VARCHAR(20) NOT NULL,
            sender_name VARCHAR(255) NOT NULL,
            message TEXT NOT NULL,
            is_read BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );
        `;
      } catch (err) {
        console.warn('support_messages table init notice:', (err as Error).message);
      }

      try {
        await sqlClient`ALTER TABLE support_conversations ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id) ON DELETE SET NULL;`;
      } catch {}

      // Performance Indexes
      try { await sqlClient`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`; } catch {}
      try { await sqlClient`CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token);`; } catch {}
      try { await sqlClient`CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);`; } catch {}
      try { await sqlClient`CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);`; } catch {}
      try { await sqlClient`CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);`; } catch {}
      try { await sqlClient`CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);`; } catch {}
      try { await sqlClient`CREATE INDEX IF NOT EXISTS idx_payments_gateway_ref ON payments(gateway_reference);`; } catch {}
      try { await sqlClient`CREATE INDEX IF NOT EXISTS idx_products_is_top ON products_cache(is_top_product);`; } catch {}
      try { await sqlClient`CREATE INDEX IF NOT EXISTS idx_support_conv_session ON support_conversations(buyer_session_id);`; } catch {}
      try { await sqlClient`CREATE INDEX IF NOT EXISTS idx_support_conv_user ON support_conversations(user_id);`; } catch {}
      try { await sqlClient`CREATE INDEX IF NOT EXISTS idx_support_conv_status ON support_conversations(status);`; } catch {}
      try { await sqlClient`CREATE INDEX IF NOT EXISTS idx_support_messages_conv ON support_messages(conversation_id);`; } catch {}

      console.log('[PostgreSQL] Database tables & indexes verified successfully.');
    } catch (err) {
      console.error('[PostgreSQL] Database initialization notice:', (err as Error).message);
    }
  })();

  return initPromise;
}

// Automatically initialize schema
ensureDatabaseTables().catch((err) => {
  console.error('[PostgreSQL] Table auto-creation notice:', err);
});

export { schema };
export * from './schema';
