import { db, schema, ensureDatabaseTables } from '../src/db';
import { insightXPro } from '../src/lib/insightxpro/client';
import { calculateRetailPriceIdr, getDynamicPricingConfig } from '../src/lib/pricing/engine';
import { getRealBrandLogoUrl } from '../src/lib/brand/logos';

function categorizeProduct(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('cursor') || n.includes('manus') || n.includes('lovable') || n.includes('runway') || n.includes('gemini') || n.includes('replit') || n.includes('eleven') || n.includes('synthesia') || n.includes('factory')) {
    return 'AI & Coding';
  }
  if (n.includes('railway') || n.includes('n8n') || n.includes('warp') || n.includes('posthog') || n.includes('jam') || n.includes('resend')) {
    return 'Dev & Cloud';
  }
  if (n.includes('capcut') || n.includes('descript') || n.includes('adobe') || n.includes('mobbin') || n.includes('gamma') || n.includes('magic pattern') || n.includes('framer')) {
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

function cleanName(raw: string): string {
  return raw.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();
}

async function sync() {
  console.log('🔄 Memulai sinkronisasi katalog dari InsightXPro...');
  await ensureDatabaseTables();

  try {
    const balance = await insightXPro.getBalance();
    console.log(`💰 Saldo Supplier: ${balance.balance} ${balance.currency} (Status: ${balance.status})`);

    const dynamicPricing = await getDynamicPricingConfig();
    console.log(`📈 Kurs Realtime Aktif: Rp ${dynamicPricing.usdtIdrRate.toLocaleString('id-ID')} / USDT (${dynamicPricing.fxSource || 'Indodax'})`);

    const res = await fetch(`${process.env.INSIGHTXPRO_BASE_URL || 'https://api.insightxpro.store'}/api/v1/products`, {
      headers: { Authorization: `Bearer ${process.env.INSIGHTXPRO_API_KEY}` },
    });

    const data = await res.json();
    const products = Array.isArray(data) ? data : data.products || [];

    console.log(`📦 Ditemukan ${products.length} produk aktif di InsightXPro.`);

    // Clear old records
    await db.delete(schema.productsCache);

    for (const item of products) {
      const baseUsdt = Number(item.price_usdt ?? item.price ?? item.base_price_usdt ?? 0);
      const pricing = calculateRetailPriceIdr(baseUsdt, 1, dynamicPricing);
      const category = categorizeProduct(item.name);
      const name = cleanName(item.name);
      const cleanDescription = item.description_text || item.description || 'Lisensi original resmi siap aktivasi.';
      const logoUrl = getRealBrandLogoUrl(name);
      const stockCount = typeof item.stock === 'number' ? item.stock : (item.available ? 99 : 0);

      await db.insert(schema.productsCache).values({
        supplierProductId: item.id,
        name,
        category,
        description: cleanDescription,
        basePriceUsdt: baseUsdt,
        retailPriceIdr: pricing.unitPriceIdr,
        imageUrl: logoUrl,
        stock: stockCount,
        inStock: stockCount > 0,
      });

      console.log(`  ✓ Synced: [ID ${item.id}] [${category}] ${name} -> Rp ${pricing.unitPriceIdr.toLocaleString('id-ID')} (Stok: ${stockCount})`);
    }

    console.log('✅ Sinkronisasi katalog berhasil dengan real brand logos & realtime FX!');
  } catch (err) {
    console.error('❌ Gagal sinkronisasi:', (err as Error).message);
  }
}

sync().then(() => process.exit(0));
