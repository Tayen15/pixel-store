import { ensureDatabaseTables, db, schema } from '../src/db';
import { insightXPro } from '../src/lib/insightxpro/client';
import { getDynamicPricingConfig } from '../src/lib/pricing/engine';
import { syncRealtimeCatalog } from '../src/lib/catalog/service';

async function sync() {
  console.log('🔄 Memulai sinkronisasi katalog dari InsightXPro...');
  await ensureDatabaseTables();

  try {
    const balance = await insightXPro.getBalance();
    console.log(`💰 Saldo Supplier: ${balance.balance} ${balance.currency} (Status: ${balance.status})`);

    const dynamicPricing = await getDynamicPricingConfig();
    console.log(`📈 Kurs Realtime Aktif: Rp ${dynamicPricing.usdtIdrRate.toLocaleString('id-ID')} / USDT (${dynamicPricing.fxSource || 'Indodax'})`);

    const result = await syncRealtimeCatalog(true);
    console.log(`📦 Berhasil menyinkronkan ${result.count} produk aktif dari InsightXPro.`);

    const allCached = await db.select().from(schema.productsCache);
    const activeProducts = allCached.filter((p) => p.isActive !== false && p.inStock && (p.stock ?? 0) > 0);
    const inactiveProducts = allCached.filter((p) => !p.inStock || p.stock === 0 || p.isActive === false);

    console.log(`📊 Status Database:`);
    console.log(`   - Total Produk Terdaftar: ${allCached.length}`);
    console.log(`   - Siap Dijual (Aktif & Stok Tersedia): ${activeProducts.length}`);
    console.log(`   - Nonaktif / Stok Habis: ${inactiveProducts.length}`);

    console.log('✅ Sinkronisasi katalog berhasil dengan real brand logos, realtime FX, dan proteksi stok akurat!');
  } catch (err) {
    console.error('❌ Gagal sinkronisasi:', (err as Error).message);
  }
}

sync().then(() => process.exit(0));
