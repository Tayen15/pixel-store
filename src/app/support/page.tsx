import React from 'react';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { SupportChat, type ProductSupportContext } from '@/components/SupportChat';
import { StoreNavbar } from '@/components/layout/StoreNavbar';
import { StoreFooter } from '@/components/layout/StoreFooter';
import { getEffectiveUser } from '@/lib/auth/user';

export const revalidate = 0;

interface SupportPageProps {
  searchParams?: Promise<{
    productId?: string;
    productName?: string;
    source?: string;
    orderNumber?: string;
    order?: string;
  }>;
}

export default async function SupportPage({ searchParams }: SupportPageProps) {
  const user = await getEffectiveUser();
  const resolvedParams = searchParams ? await searchParams : {};

  const initialUser = user
    ? {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image || null,
      }
    : null;

  let productContext: ProductSupportContext | null = null;
  const productIdNum = resolvedParams.productId ? parseInt(resolvedParams.productId, 10) : null;

  if (productIdNum && !isNaN(productIdNum)) {
    try {
      const [prod] = await db
        .select({
          id: schema.productsCache.id,
          name: schema.productsCache.name,
          imageUrl: schema.productsCache.imageUrl,
          retailPriceIdr: schema.productsCache.retailPriceIdr,
          category: schema.productsCache.category,
        })
        .from(schema.productsCache)
        .where(eq(schema.productsCache.id, productIdNum))
        .limit(1);

      if (prod) {
        productContext = {
          id: prod.id,
          name: prod.name,
          imageUrl: prod.imageUrl,
          retailPriceIdr: prod.retailPriceIdr,
          category: prod.category,
          source: resolvedParams.source || 'restock',
        };
      }
    } catch {}
  }

  // Fallback if not found in DB but productName query is present
  if (!productContext && resolvedParams.productName) {
    productContext = {
      id: productIdNum || 0,
      name: decodeURIComponent(resolvedParams.productName),
      source: resolvedParams.source || 'restock',
    };
  }

  const initialOrderQuery = resolvedParams.orderNumber || resolvedParams.order || null;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100 flex flex-col font-sans transition-colors duration-200">
      <StoreNavbar activePage="support" />

      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 my-4">
        <SupportChat
          initialUser={initialUser}
          initialProductContext={productContext}
          initialOrderQuery={initialOrderQuery}
        />
      </main>

      <StoreFooter />
    </div>
  );
}
