import { defineAction } from 'astro:actions';
import { z } from 'astro:schema';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import QRCode from 'qrcode';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { insightXPro } from '@/lib/insightxpro/client';
import { calculateRetailPriceIdr, getDynamicPricingConfig } from '@/lib/pricing/engine';
import { getLiveUsdtRate } from '@/lib/pricing/fx-service';
import { getPaymentGateway } from '@/lib/payment/adapter';
import { getSystemConfig, updateSystemSection } from '@/lib/settings/service';
import { getRealBrandLogoUrl } from '@/lib/brand/logos';
import { syncRealtimeCatalog } from '@/lib/catalog/service';
import { executeOrderFulfillment } from '@/lib/order/fulfillment';
import { 
  ADMIN_COOKIE_NAME, 
  verifyAdminPin, 
  createAdminSessionToken, 
  verifyAdminSessionToken 
} from '@/lib/auth/admin';

function cleanName(raw: string): string {
  return raw.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();
}

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

export const server = {
  /**
   * Action: Checkout & generate QRIS payment invoice with realtime FX pricing
   */
  checkout: defineAction({
    input: z.object({
      productId: z.number().int().positive(),
      quantity: z.number().int().min(1).default(1),
      email: z.string().optional().default('guest@sigmastore.com'),
      whatsapp: z.string().optional().default('081200000000'),
    }),
    handler: async (input) => {
      const customerEmail = (input.email && input.email.includes('@')) ? input.email.trim() : 'guest@sigmastore.com';
      const customerWhatsapp = (input.whatsapp && input.whatsapp.trim().length >= 8) ? input.whatsapp.trim() : '081200000000';

      const config = await getSystemConfig();
      const dynamicPricing = await getDynamicPricingConfig();

      if (!config.store.isStoreOpen) {
        throw new Error('Toko sedang dalam pemeliharaan sistem. Silakan coba kembali nanti.');
      }

      if (input.quantity > config.orders.maxQuantityPerOrder) {
        throw new Error(`Maksimal pembelian adalah ${config.orders.maxQuantityPerOrder} lisensi per transaksi.`);
      }

      // 1. Fetch product from local DB cache
      const cachedProducts = await db
        .select()
        .from(schema.productsCache)
        .where(eq(schema.productsCache.id, input.productId));

      let product = cachedProducts[0];

      // If not yet in cache, fetch catalog from InsightXPro and seed
      if (!product) {
        try {
          const supplierProducts = await insightXPro.getProducts();
          const found = supplierProducts.find((p) => p.id === input.productId);
          if (!found) {
            throw new Error('Produk tidak ditemukan di katalog supplier');
          }

          const baseUsdt = Number(found.price ?? 0);
          const pricing = calculateRetailPriceIdr(baseUsdt, 1, dynamicPricing);

          const stockCount = typeof found.stock === 'number' ? found.stock : (found.available ? 99 : 0);

          const inserted = await db
            .insert(schema.productsCache)
            .values({
              supplierProductId: found.id,
              name: found.name,
              category: categorizeProduct(found.name),
              description: found.description || '',
              basePriceUsdt: baseUsdt,
              retailPriceIdr: pricing.unitPriceIdr,
              stock: stockCount,
              inStock: stockCount > 0,
            })
            .returning();

          product = inserted[0];
        } catch (err) {
          throw new Error(`Gagal mengambil data produk: ${(err as Error).message}`);
        }
      }

      // 2. Pre-flight check: Storefront stock and supplier balance validation
      if (product.inStock === false || (product.stock !== null && product.stock !== undefined && product.stock < input.quantity)) {
        throw new Error(`Stok produk tidak mencukupi untuk jumlah pembelian ini. Sisa stok: ${product.stock ?? 0} unit.`);
      }

      const requiredUsdt = product.basePriceUsdt * input.quantity;
      try {
        const balanceInfo = await insightXPro.getBalance();
        if (balanceInfo.balance < requiredUsdt) {
          throw new Error('Stok sedang dipersiapkan ulang oleh sistem. Silakan coba beberapa saat lagi.');
        }
      } catch (err) {
        console.warn('Pre-flight balance check warning:', (err as Error).message);
      }

      // 3. Dynamic Realtime IDR calculation
      const pricing = calculateRetailPriceIdr(product.basePriceUsdt, input.quantity, dynamicPricing);
      const prefix = config.store.storeName.replace(/[^A-Za-z0-9]/g, '').slice(0, 5).toUpperCase() || 'SIGMA';
      const orderNumber = `${prefix}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      const idempotencyKey = crypto.randomUUID();

      // 4. Request QRIS Invoice from Payment Gateway
      const paymentGateway = getPaymentGateway();
      const invoice = await paymentGateway.createQRISInvoice({
        orderNumber,
        amountIdr: pricing.totalAmountIdr,
        customerEmail: customerEmail,
        customerWhatsapp: customerWhatsapp,
        productName: `${product.name} (x${input.quantity})`,
        expiryMinutes: config.orders.expiryMinutes,
      });

      const orderId = crypto.randomUUID();
      const paymentId = crypto.randomUUID();

      // 5. Atomic database insertion
      await db.insert(schema.orders).values({
        id: orderId,
        orderNumber,
        customerEmail: customerEmail,
        customerWhatsapp: customerWhatsapp,
        productId: product.id,
        productName: product.name,
        quantity: input.quantity,
        basePriceUsdt: product.basePriceUsdt,
        exchangeRateIdr: pricing.exchangeRate,
        marginPercent: pricing.marginPercent,
        totalAmountIdr: pricing.totalAmountIdr,
        status: 'PENDING_PAYMENT',
        idempotencyKey,
      });

      await db.insert(schema.payments).values({
        id: paymentId,
        orderId,
        gatewayProvider: invoice.gatewayProvider,
        gatewayReference: invoice.gatewayReference,
        paymentMethod: 'QRIS',
        qrCodeString: invoice.qrCodeString,
        paymentUrl: invoice.paymentUrl,
        amountIdr: pricing.totalAmountIdr,
        status: 'UNPAID',
        expiresAt: invoice.expiresAt,
      });

      let qrCodeDataUrl = invoice.qrCodeDataUrl;

      // If gateway gave a direct image URL but no data URL, fetch server-side and convert
      if (!qrCodeDataUrl && invoice.qrCodeImageUrl) {
        try {
          const imgRes = await fetch(invoice.qrCodeImageUrl, { signal: AbortSignal.timeout(3500) });
          if (imgRes.ok) {
            const contentType = imgRes.headers.get('content-type') || 'image/png';
            const buf = Buffer.from(await imgRes.arrayBuffer());
            qrCodeDataUrl = `data:${contentType};base64,${buf.toString('base64')}`;
          }
        } catch {}
      }

      // If still no qrCodeDataUrl, generate authentic QR code bitmap from qrCodeString or paymentUrl
      if (!qrCodeDataUrl && (invoice.qrCodeString || invoice.paymentUrl)) {
        try {
          qrCodeDataUrl = await QRCode.toDataURL(invoice.qrCodeString || invoice.paymentUrl!, {
            width: 320,
            margin: 1,
            errorCorrectionLevel: 'M',
          });
        } catch {}
      }

      return {
        orderNumber,
        productName: product.name,
        quantity: input.quantity,
        amountIdr: pricing.totalAmountIdr,
        qrCodeString: invoice.qrCodeString,
        paymentUrl: invoice.paymentUrl,
        qrCodeImageUrl: invoice.qrCodeImageUrl,
        qrCodeDataUrl,
        gatewayProvider: invoice.gatewayProvider,
        expiresAt: invoice.expiresAt,
      };
    },
  }),

  /**
   * Action: Check order status and retrieve license codes if completed
   */
  getOrderStatus: defineAction({
    input: z.object({
      orderNumber: z.string().min(5),
    }),
    handler: async ({ orderNumber }) => {
      const records = await db
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.orderNumber, orderNumber));

      if (records.length === 0) {
        throw new Error('Pesanan tidak ditemukan');
      }

      let order = records[0];

      // Live verification with payment gateway if pending
      if (order.status === 'PENDING_PAYMENT') {
        const payments = await db
          .select()
          .from(schema.payments)
          .where(eq(schema.payments.orderId, order.id));

        const payment = payments[0];
        if (payment?.gatewayProvider === 'tako' && payment.gatewayReference) {
          const gateway = getPaymentGateway();
          if ('checkTransactionStatus' in gateway) {
            const liveStatus = await (gateway as any).checkTransactionStatus(payment.gatewayReference);
            if (liveStatus?.status === 'success') {
              // Atomic race-free fulfillment (prevents duplicate fulfillment with webhook)
              await executeOrderFulfillment(order.id, 'client_polling');

              const updatedRecords = await db
                .select()
                .from(schema.orders)
                .where(eq(schema.orders.id, order.id));

              if (updatedRecords[0]) {
                order = updatedRecords[0];
              }
            }
          }
        }
      }

      let licenseCodes: string[] = [];
      if (order.licenseCodes) {
        try {
          licenseCodes = JSON.parse(order.licenseCodes);
        } catch {
          licenseCodes = [order.licenseCodes];
        }
      }

      return {
        orderNumber: order.orderNumber,
        productName: order.productName,
        quantity: order.quantity,
        totalAmountIdr: order.totalAmountIdr,
        status: order.status,
        licenseCodes,
        customerEmail: order.customerEmail,
        createdAt: order.createdAt,
        failureReason: order.failureReason,
      };
    },
  }),

  /**
   * Action: Simulate instant sandbox payment (testing & demo)
   */
  simulatePayment: defineAction({
    input: z.object({
      orderNumber: z.string().min(5),
    }),
    handler: async ({ orderNumber }) => {
      const records = await db
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.orderNumber, orderNumber));

      if (records.length === 0) {
        throw new Error('Pesanan tidak ditemukan');
      }

      const order = records[0];
      if (order.status === 'COMPLETED') {
        return { success: true, message: 'Pesanan sudah selesai' };
      }

      // Transition to FULFILLING
      await db
        .update(schema.orders)
        .set({ status: 'FULFILLING', paidAt: new Date().toISOString() })
        .where(eq(schema.orders.id, order.id));

      try {
        // Lookup product from SQLite cache to resolve real supplierProductId
        const productRecord = await db
          .select()
          .from(schema.productsCache)
          .where(eq(schema.productsCache.id, order.productId));

        const supplierProductId = productRecord[0]?.supplierProductId ?? order.productId;

        const apiKey = process.env.INSIGHTXPRO_API_KEY;

        try {
          if (apiKey) {
            const supplierRes = await insightXPro.placeOrder(
              {
                product_id: supplierProductId,
                quantity: order.quantity,
              },
              order.idempotencyKey
            );

            const supplierOrderId = String(supplierRes.order_id);
            const codes = supplierRes.codes || [];

            if (codes.length > 0) {
              await db
                .update(schema.orders)
                .set({
                  status: 'COMPLETED',
                  supplierOrderId,
                  licenseCodes: JSON.stringify(codes),
                  fulfilledAt: new Date().toISOString(),
                })
                .where(eq(schema.orders.id, order.id));

              return {
                success: true,
                status: 'COMPLETED',
                codes,
              };
            }
          }
        } catch (upstreamErr) {
          console.warn('Simulation upstream note (using sandbox activation link):', (upstreamErr as Error).message);
        }

        // Generate sandbox demo activation links for instant testing
        const sampleLinks = Array.from({ length: order.quantity }).map((_, i) => 
          `https://one.google.com/promo/claim/${crypto.randomBytes(6).toString('hex')}?ref=sigmastore_${order.orderNumber}`
        );

        await db
          .update(schema.orders)
          .set({
            status: 'COMPLETED',
            supplierOrderId: `SANDBOX-${Date.now()}`,
            licenseCodes: JSON.stringify(sampleLinks),
            fulfilledAt: new Date().toISOString(),
          })
          .where(eq(schema.orders.id, order.id));

        return {
          success: true,
          status: 'COMPLETED',
          codes: sampleLinks,
        };
      } catch (err) {
        const failureMessage = (err as Error).message;
        await db
          .update(schema.orders)
          .set({
            status: 'FAILED_SUPPLIER',
            failureReason: failureMessage,
          })
          .where(eq(schema.orders.id, order.id));

        throw new Error(`Pengadaan supplier gagal: ${failureMessage}`);
      }
    },
  }),

  /**
   * Action: Retrieve admin settings, live FX rate, and live supplier status
   */
  getAdminSettings: defineAction({
    handler: async () => {
      const config = await getSystemConfig();
      const liveFx = await getLiveUsdtRate(true);
      let supplierBalance = 0;
      let supplierStatus = 'offline';

      try {
        const balanceData = await insightXPro.getBalance();
        supplierBalance = balanceData.balance;
        supplierStatus = balanceData.status || 'active';
      } catch {
        supplierStatus = 'unreachable';
      }

      const products = await db.select().from(schema.productsCache);

      return {
        config,
        liveFx,
        supplier: {
          balanceUsdt: supplierBalance,
          status: supplierStatus,
          syncedProductCount: products.length,
        },
      };
    },
  }),

  /**
   * Action: Authenticate admin via Secret PIN
   */
  adminLogin: defineAction({
    input: z.object({
      pin: z.string().min(1, 'PIN tidak boleh kosong'),
    }),
    handler: async ({ pin }, context) => {
      if (!verifyAdminPin(pin)) {
        throw new Error('PIN Akses Admin tidak valid. Silakan periksa kembali.');
      }
      const token = createAdminSessionToken();
      context.cookies.set(ADMIN_COOKIE_NAME, token, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60,
        secure: process.env.NODE_ENV === 'production',
      });
      return { success: true };
    },
  }),

  /**
   * Action: Invalidate admin session
   */
  adminLogout: defineAction({
    handler: async (_, context) => {
      context.cookies.delete(ADMIN_COOKIE_NAME, { path: '/' });
      return { success: true };
    },
  }),

  /**
   * Action: Update pricing configuration in SQLite (Biaya operasional & Margin untung)
   * Note: Nilai tukar (FX) otomatis dikelola oleh sistem secara realtime.
   */
  updatePricingSettings: defineAction({
    input: z.object({
      fxBufferPercent: z.number().min(0).max(10).default(0.5),
      marginPercent: z.number().min(0).max(100),
      gatewayFeePercent: z.number().min(0).max(20).default(5.0), // Biaya penarikan saldo Tako (default 5.0%)
      fixedFeeIdr: z.number().int().min(0).max(50000).optional().default(0), // Opsional overhead tetap
    }),
    handler: async (input, context) => {
      const sessionToken = context.cookies.get(ADMIN_COOKIE_NAME)?.value;
      if (!verifyAdminSessionToken(sessionToken)) {
        throw new Error('Akses ditolak: Silakan masuk ke panel admin terlebih dahulu.');
      }

      // Update settings with automated FX rate permanently enabled
      const updatedPricing = await updateSystemSection('pricing', {
        ...input,
        autoFxRate: true,
      });
      const dynamicPricing = await getDynamicPricingConfig();

      // Recalculate all cached products in SQLite
      const products = await db.select().from(schema.productsCache);
      for (const p of products) {
        const recalculated = calculateRetailPriceIdr(p.basePriceUsdt, 1, dynamicPricing);
        await db
          .update(schema.productsCache)
          .set({ retailPriceIdr: recalculated.unitPriceIdr })
          .where(eq(schema.productsCache.id, p.id));
      }

      return { success: true, updatedPricing: dynamicPricing };
    },
  }),

  /**
   * Action: Trigger on-demand sync from InsightXPro wholesale catalog with realtime stock count
   */
  syncCatalogNow: defineAction({
    handler: async (_, context) => {
      const sessionToken = context.cookies.get(ADMIN_COOKIE_NAME)?.value;
      if (!verifyAdminSessionToken(sessionToken)) {
        throw new Error('Akses ditolak: Silakan masuk ke panel admin terlebih dahulu.');
      }

      const result = await syncRealtimeCatalog(true);
      return { success: true, count: result.count };
    },
  }),
};
