import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';

export interface PricingSettings {
  usdtIdrRate: number;
  autoFxRate: boolean;
  fxBufferPercent: number;
  marginPercent: number;
  gatewayFeePercent: number; // Persentase biaya penarikan Tako (normal 5.0%, tiered 4.5% - 4.9%)
  fixedFeeIdr: number;
  roundingStep: number;
}

export interface StoreSettings {
  storeName: string;
  storeTagline: string;
  supportWhatsapp: string;
  announcement: string;
  isStoreOpen: boolean;
  qrisNmid: string;
}

export interface OrderSettings {
  expiryMinutes: number;
  maxQuantityPerOrder: number;
}

export interface SystemConfig {
  pricing: PricingSettings;
  store: StoreSettings;
  orders: OrderSettings;
}

// In-memory cache with 60s TTL to prevent DB query storm
let cachedConfig: SystemConfig | null = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 60 * 1000;

/**
 * Loads default settings from environment variables.
 */
function getDefaultConfig(): SystemConfig {
  return {
    pricing: {
      usdtIdrRate: Number(process.env.USDT_IDR_RATE || 17800),
      autoFxRate: true,
      fxBufferPercent: 0.5,
      marginPercent: Number(process.env.PROFIT_MARGIN_PERCENT || 20),
      gatewayFeePercent: Number(process.env.GATEWAY_FEE_PERCENT || 5.0),
      fixedFeeIdr: Number(process.env.FIXED_PAYMENT_FEE_IDR || 0),
      roundingStep: 1000,
    },
    store: {
      storeName: process.env.STORE_NAME || 'PIXEL STORE',
      storeTagline: process.env.STORE_TAGLINE || 'Akun Premium & Lisensi Digital. Bayar Sekali, Langsung Muncul.',
      supportWhatsapp: process.env.SUPPORT_WHATSAPP || '08123456789',
      announcement: process.env.STORE_ANNOUNCEMENT || 'Pengiriman otomatis 24/7 aktif via QRIS.',
      isStoreOpen: true,
      qrisNmid: process.env.QRIS_NMID || 'ID1020021303845',
    },
    orders: {
      expiryMinutes: Number(process.env.ORDER_EXPIRY_MINUTES || 15),
      maxQuantityPerOrder: Number(process.env.MAX_QTY_PER_ORDER || 5),
    },
  };
}

/**
 * Retrieves the unified system configuration from SQLite (with in-memory cache).
 */
export async function getSystemConfig(forceRefresh = false): Promise<SystemConfig> {
  const now = Date.now();
  if (!forceRefresh && cachedConfig && now - lastCacheTime < CACHE_TTL_MS) {
    return cachedConfig;
  }

  const defaults = getDefaultConfig();

  try {
    const rows = await db.select().from(schema.appSettings);
    const settingsMap = new Map(rows.map((r) => [r.key, r.value]));

    const pricing = settingsMap.has('pricing')
      ? { ...defaults.pricing, ...JSON.parse(settingsMap.get('pricing')!) }
      : defaults.pricing;

    const store = settingsMap.has('store')
      ? { ...defaults.store, ...JSON.parse(settingsMap.get('store')!) }
      : defaults.store;

    const orders = settingsMap.has('orders')
      ? { ...defaults.orders, ...JSON.parse(settingsMap.get('orders')!) }
      : defaults.orders;

    cachedConfig = { pricing, store, orders };
    lastCacheTime = now;
    return cachedConfig;
  } catch (err) {
    console.warn('Could not read settings from DB, using defaults:', (err as Error).message);
    return defaults;
  }
}

/**
 * Updates a specific configuration section in SQLite and invalidates memory cache.
 */
export async function updateSystemSection<K extends keyof SystemConfig>(
  section: K,
  data: Partial<SystemConfig[K]>
): Promise<SystemConfig[K]> {
  const currentConfig = await getSystemConfig(true);
  const updatedSection = { ...currentConfig[section], ...data };

  await db
    .insert(schema.appSettings)
    .values({
      key: section,
      value: JSON.stringify(updatedSection),
      updatedAt: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: schema.appSettings.key,
      set: {
        value: JSON.stringify(updatedSection),
        updatedAt: new Date().toISOString(),
      },
    });

  // Invalidate cache
  cachedConfig = null;
  return updatedSection;
}
