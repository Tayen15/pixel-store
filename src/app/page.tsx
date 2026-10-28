import React from 'react';
import { db, schema } from '@/db';
import { calculateRetailPriceIdr, getDynamicPricingConfig } from '@/lib/pricing/engine';
import { getSystemConfig } from '@/lib/settings/service';
import { StoreFront, type ProductItem } from '@/components/StoreFront';
import { syncRealtimeCatalog } from '@/lib/catalog/service';

// Incremental Static Regeneration (120s TTL): protects Neon database from compute exhaustion on page traffic
export const revalidate = 120;

export default async function HomePage() {
  const config = await getSystemConfig();
  const dynamicPricing = await getDynamicPricingConfig();

  let cached: Array<typeof schema.productsCache.$inferSelect> = [];

  try {
    cached = await db.select().from(schema.productsCache);

    // Cold start guard: if cache is totally empty, seed it once synchronously
    if (cached.length === 0) {
      try {
        await syncRealtimeCatalog(true);
        cached = await db.select().from(schema.productsCache);
      } catch (err) {
        console.warn('Initial cold-start catalog sync error:', (err as Error).message);
      }
    }
  } catch (err) {
    console.warn('[HomePage] Database unavailable during prerender, fallback to empty cache:', (err as Error).message);
  }

  const products: ProductItem[] = cached
    .filter((p) => p.isActive !== false)
    .map((p) => {
      const calibrated = calculateRetailPriceIdr(p.basePriceUsdt, 1, dynamicPricing);
      const stockCount = p.stock ?? 0;
      const effectivePrice =
        p.customRetailPriceIdr && p.customRetailPriceIdr > 0
          ? p.customRetailPriceIdr
          : p.retailPriceIdr || calibrated.unitPriceIdr;

      return {
        id: p.id,
        name: p.name,
        category: p.category || 'Digital',
        description: p.description || '',
        retailPriceIdr: effectivePrice,
        basePriceUsdt: p.basePriceUsdt,
        stock: stockCount,
        inStock: Boolean(stockCount > 0 && p.inStock),
        minQuantity: p.minQuantity || 1,
        maxQuantity: p.maxQuantity || config.orders.maxQuantityPerOrder,
        imageUrl: p.imageUrl || undefined,
        isTopProduct: Boolean(p.isTopProduct),
        customRetailPriceIdr: p.customRetailPriceIdr || undefined,
      };
    })
    .sort((a, b) => {
      if (a.isTopProduct && !b.isTopProduct) return -1;
      if (!a.isTopProduct && b.isTopProduct) return 1;
      return 0;
    });

  return (
    <StoreFront
      initialProducts={products}
      currentFxRate={dynamicPricing.usdtIdrRate}
      isPaymentEnabled={config.store.isPaymentEnabled !== false}
      paymentDisabledReason={config.store.paymentDisabledReason || undefined}
    />
  );
}
