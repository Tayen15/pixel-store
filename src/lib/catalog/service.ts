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
// Throttle background syncs to 30 seconds to respect rate limits (60 req/min)
const REALTIME_SYNC_INTERVAL_MS = 30 * 1000;

/**
 * Synchronizes catalog from InsightXPro live into products_cache.
 * Accurately updates active products and deactivates any products that are out of stock or withdrawn by supplier.
 * @param force If true, bypasses the 30-second throttle (used by Admin button).
 */
export async function syncRealtimeCatalog(force = false): Promise<{ count: number; products: InsightProduct[]; isFresh: boolean }> {
  const now = Date.now();
  if (!force && now - lastSyncTimestamp < REALTIME_SYNC_INTERVAL_MS) {
    return { count: 0, products: [], isFresh: false };
  }

  const dynamicPricing = await getDynamicPricingConfig();
  const rawProducts = await insightXPro.getProducts();

  if (!rawProducts || rawProducts.length === 0) {
    return { count: 0, products: [], isFresh: false };
  }

  // 1. Atomic upsert with fresh prices, logos, and realtime stock counts (avoids FK violation on orders)
  for (const item of rawProducts) {
    const baseUsdt = Number(item.price_usdt ?? item.price ?? (item as unknown as { base_price_usdt?: number | string }).base_price_usdt ?? 0);
    const pricing = calculateRetailPriceIdr(baseUsdt, 1, dynamicPricing);
    const category = categorizeProduct(item.name);
    const name = cleanProductName(item.name);
    const cleanDescription = (item as unknown as { description_text?: string }).description_text || item.description || 'Lisensi original resmi siap aktivasi.';
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

    await db
      .insert(schema.productsCache)
      .values({
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
      })
      .onConflictDoUpdate({
        target: schema.productsCache.supplierProductId,
        set: {
          name,
          category,
          description: cleanDescription,
          basePriceUsdt: baseUsdt,
          retailPriceIdr: sql`COALESCE(products_cache.custom_retail_price_idr, ${pricing.unitPriceIdr})`,
          imageUrl: logoUrl,
          stock: stockCount,
          inStock,
          isActive: inStock,
          lastSyncedAt: sql`CURRENT_TIMESTAMP`,
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
}

