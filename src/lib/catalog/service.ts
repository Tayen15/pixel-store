import { sql, notInArray } from 'drizzle-orm';
import { db, schema } from '@/db';
import { insightXPro, type InsightProduct } from '@/lib/insightxpro/client';
import { calculateRetailPriceIdr, getDynamicPricingConfig } from '@/lib/pricing/engine';
import { getRealBrandLogoUrl } from '@/lib/brand/logos';

export function categorizeProduct(name: string): string {
  const n = name.toLowerCase();
  if (
    n.includes('cursor') ||
    n.includes('manus') ||
    n.includes('lovable') ||
    n.includes('runway') ||
    n.includes('gemini') ||
    n.includes('replit') ||
    n.includes('eleven') ||
    n.includes('synthesia') ||
    n.includes('factory')
  ) {
    return 'AI & Coding';
  }
  if (
    n.includes('railway') ||
    n.includes('n8n') ||
    n.includes('warp') ||
    n.includes('posthog') ||
    n.includes('jam') ||
    n.includes('resend')
  ) {
    return 'Dev & Cloud';
  }
  if (
    n.includes('capcut') ||
    n.includes('descript') ||
    n.includes('adobe') ||
    n.includes('mobbin') ||
    n.includes('gamma') ||
    n.includes('magic pattern') ||
    n.includes('framer')
  ) {
    return 'Creative & Design';
  }
  if (n.includes('vpn') || n.includes('nord')) {
    return 'Security & VPN';
  }
  if (n.includes('duolingo')) {
    return 'Education';
  }
  return 'Productivity & SaaS';
}

export function cleanProductName(raw: string): string {
  return raw
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
    .trim();
}

let lastSyncTimestamp = 0;
let isSyncingInProgress = false;

// Throttle for pre-flight checks (checkout & price verification): 20 seconds
export const PREFLIGHT_CHECK_INTERVAL_MS = 20 * 1000;

// Throttle for automatic background storefront sync: 3 minutes (180 seconds)
export const BACKGROUND_AUTO_SYNC_INTERVAL_MS = 3 * 60 * 1000;

/**
 * Synchronizes catalog from InsightXPro live into products_cache.
 * Accurately updates active products and deactivates any products that are out of stock or withdrawn by supplier.
 * @param force If true, bypasses the throttle (used by Admin button or scheduled sync).
 */
export async function syncRealtimeCatalog(force = false): Promise<{ count: number; products: InsightProduct[]; isFresh: boolean }> {
  if (isSyncingInProgress) {
    return { count: 0, products: [], isFresh: false };
  }

  const now = Date.now();
  if (!force && now - lastSyncTimestamp < PREFLIGHT_CHECK_INTERVAL_MS) {
    return { count: 0, products: [], isFresh: false };
  }

  isSyncingInProgress = true;
  try {
    const dynamicPricing = await getDynamicPricingConfig();
    const rawProducts = await insightXPro.getProducts();

    if (!rawProducts || rawProducts.length === 0) {
      return { count: 0, products: [], isFresh: false };
    }

    // 1. Single atomic batch upsert with fresh prices, logos, and realtime stock counts (1 query instead of N queries)
    const valuesToUpsert = rawProducts.map((item) => {
      const baseUsdt = Number(
        item.price_usdt ?? item.price ?? (item as unknown as { base_price_usdt?: number | string }).base_price_usdt ?? 0
      );
      const pricing = calculateRetailPriceIdr(baseUsdt, 1, dynamicPricing);
      const category = categorizeProduct(item.name);
      const name = cleanProductName(item.name);
      const cleanDescription =
        (item as unknown as { description_text?: string }).description_text ||
        item.description ||
        'Lisensi original resmi siap aktivasi.';
      const logoUrl = getRealBrandLogoUrl(name);

      // Rigorous stock & availability calculation
      const isExplicitlyUnavailable = item.available === false;
      let stockCount = 0;
      if (!isExplicitlyUnavailable) {
        if (typeof item.stock === 'number') {
          stockCount = Math.max(0, item.stock);
        } else if (item.stock === true || item.available === true) {
          stockCount = 99;
        }
      }
      const inStock = !isExplicitlyUnavailable && stockCount > 0;

      return {
        supplierProductId: item.id,
        name,
        category,
        description: cleanDescription,
        basePriceUsdt: baseUsdt,
        retailPriceIdr: pricing.unitPriceIdr,
        imageUrl: logoUrl,
        stock: stockCount,
        inStock,
        isActive: inStock,
      };
    });

    if (valuesToUpsert.length > 0) {
      await db
        .insert(schema.productsCache)
        .values(valuesToUpsert)
        .onConflictDoUpdate({
          target: schema.productsCache.supplierProductId,
          set: {
            name: sql.raw('EXCLUDED.name'),
            category: sql.raw('EXCLUDED.category'),
            description: sql.raw('EXCLUDED.description'),
            basePriceUsdt: sql.raw('EXCLUDED.base_price_usdt'),
            retailPriceIdr: sql.raw('COALESCE(products_cache.custom_retail_price_idr, EXCLUDED.retail_price_idr)'),
            imageUrl: sql.raw('EXCLUDED.image_url'),
            stock: sql.raw('EXCLUDED.stock'),
            inStock: sql.raw('EXCLUDED.in_stock'),
            isActive: sql.raw('EXCLUDED.is_active'),
            lastSyncedAt: sql.raw('CURRENT_TIMESTAMP'),
          },
        });
    }

  // 2. Mark products no longer provided by supplier as out-of-stock and inactive
  const activeSupplierIds = rawProducts
    .map((p) => p.id)
    .filter((id): id is number => typeof id === 'number' && id > 0);

  if (activeSupplierIds.length > 0) {
    await db
      .update(schema.productsCache)
      .set({
        stock: 0,
        inStock: false,
        isActive: false,
        lastSyncedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(notInArray(schema.productsCache.supplierProductId, activeSupplierIds));
  }

    lastSyncTimestamp = Date.now();
    return { count: rawProducts.length, products: rawProducts, isFresh: true };
  } catch (err) {
    console.warn('[Catalog Sync] Error during catalog sync:', (err as Error).message);
    throw err;
  } finally {
    isSyncingInProgress = false;
  }
}

/**
 * Triggers non-blocking background catalog synchronization if the cache is older than minIntervalMs (default: 3 minutes).
 * Designed for public SSR pages (e.g. HomePage, AdminOverview) to ensure zero latency for visitors.
 */
export function triggerBackgroundCatalogSyncIfNeeded(minIntervalMs = BACKGROUND_AUTO_SYNC_INTERVAL_MS): void {
  const now = Date.now();
  if (isSyncingInProgress || (lastSyncTimestamp > 0 && now - lastSyncTimestamp < minIntervalMs)) {
    return;
  }

  // Fire-and-forget in background without blocking the caller
  syncRealtimeCatalog(true)
    .then((result) => {
      if (result.isFresh) {
        console.log(`[Smart Hybrid Sync] Background catalog updated: ${result.count} products refreshed.`);
      }
    })
    .catch((err) => {
      console.warn('[Smart Hybrid Sync] Background sync notice:', (err as Error).message);
    });
}

let syncSchedulerTimer: NodeJS.Timeout | null = null;

/**
 * Starts a recurring background timer that runs
 * independently of visitor traffic to guarantee catalog freshness.
 * Disabled by default to protect Neon compute allowance (prevents 24/7 keep-alive).
 */
export function startAutoCatalogSyncScheduler(intervalMs = 15 * 60 * 1000): void {
  if (process.env.ENABLE_BACKGROUND_CATALOG_SYNC !== 'true') {
    return;
  }
  if (syncSchedulerTimer) return; // Prevent duplicate timers

  // Run initial background sync after 15 seconds of server boot
  setTimeout(() => {
    triggerBackgroundCatalogSyncIfNeeded(0);
  }, 15 * 1000);

  // Recurring interval
  syncSchedulerTimer = setInterval(() => {
    triggerBackgroundCatalogSyncIfNeeded(intervalMs - 15000);
  }, intervalMs);

  // Unref so it doesn't hold up process termination
  if (syncSchedulerTimer.unref) {
    syncSchedulerTimer.unref();
  }
}


