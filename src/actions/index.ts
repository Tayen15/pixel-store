import { defineAction } from 'astro:actions';
import { z } from 'astro:schema';
import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { eq, desc, or, and, asc } from 'drizzle-orm';
import { db, schema } from '@/db';
import { insightXPro } from '@/lib/insightxpro/client';
import { calculateRetailPriceIdr, getDynamicPricingConfig } from '@/lib/pricing/engine';
import { getLiveUsdtRate } from '@/lib/pricing/fx-service';
import { getPaymentGateway } from '@/lib/payment/adapter';
import { getSystemConfig, updateSystemSection } from '@/lib/settings/service';
import { syncRealtimeCatalog } from '@/lib/catalog/service';
import { executeOrderFulfillment } from '@/lib/order/fulfillment';
import { 
  ADMIN_COOKIE_NAME, 
  verifyAdminPin, 
  createAdminSessionToken, 
  verifyAdminSessionToken 
} from '@/lib/auth/admin';
import {
  USER_COOKIE_NAME,
  createUserAccount,
  authenticateUser,
  createUserSession,
  getUserFromSession,
  deleteUserSession,
} from '@/lib/auth/user';

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
   * Action: Register a new customer user account
   */
  registerUser: defineAction({
    input: z.object({
      name: z.string().min(2, 'Nama minimal 2 karakter').max(100),
      email: z.string().email('Format email tidak valid'),
      password: z.string().min(6, 'Kata sandi minimal 6 karakter'),
      phone: z.string().optional().default(''),
    }),
    handler: async (input, context) => {
      const user = await createUserAccount({
        name: input.name,
        email: input.email,
        password: input.password,
        phone: input.phone,
        role: 'customer',
      });

      const { token } = await createUserSession(user.id);
      context.cookies.set(USER_COOKIE_NAME, token, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60, // 30 days
        secure: process.env.NODE_ENV === 'production',
      });

      return {
        success: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
        },
      };
    },
  }),

  /**
   * Action: Authenticate customer login
   */
  loginUser: defineAction({
    input: z.object({
      email: z.string().email('Format email tidak valid'),
      password: z.string().min(1, 'Kata sandi tidak boleh kosong'),
    }),
    handler: async ({ email, password }, context) => {
      const user = await authenticateUser(email, password);
      const { token } = await createUserSession(user.id);

      context.cookies.set(USER_COOKIE_NAME, token, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60,
        secure: process.env.NODE_ENV === 'production',
      });

      return {
        success: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
        },
      };
    },
  }),

  /**
   * Action: Invalidate customer session (Logout)
   */
  logoutUser: defineAction({
    handler: async (_, context) => {
      const token = context.cookies.get(USER_COOKIE_NAME)?.value;
      if (token) {
        await deleteUserSession(token);
      }
      context.cookies.delete(USER_COOKIE_NAME, { path: '/' });
      return { success: true };
    },
  }),

  /**
   * Action: Retrieve current authenticated customer
   */
  getCurrentUser: defineAction({
    handler: async (_, context) => {
      const token = context.cookies.get(USER_COOKIE_NAME)?.value;
      const user = await getUserFromSession(token);
      if (!user) {
        return { user: null };
      }
      return {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
        },
      };
    },
  }),

  /**
   * Action: Retrieve order history and licenses for the current authenticated user
   */
  getUserOrders: defineAction({
    handler: async (_, context) => {
      const token = context.cookies.get(USER_COOKIE_NAME)?.value;
      const user = await getUserFromSession(token);
      if (!user) {
        throw new Error('Silakan masuk ke akun Anda untuk melihat riwayat pesanan.');
      }

      const userOrders = await db
        .select()
        .from(schema.orders)
        .where(
          or(
            eq(schema.orders.userId, user.id),
            eq(schema.orders.customerEmail, user.email)
          )
        )
        .orderBy(desc(schema.orders.createdAt));

      const ordersWithParsedCodes = userOrders.map((ord) => {
        let codes: string[] = [];
        if (ord.licenseCodes) {
          try {
            codes = JSON.parse(ord.licenseCodes);
          } catch {
            codes = [ord.licenseCodes];
          }
        }
        return {
          id: ord.id,
          orderNumber: ord.orderNumber,
          productName: ord.productName,
          quantity: ord.quantity,
          totalAmountIdr: ord.totalAmountIdr,
          status: ord.status,
          licenseCodes: codes,
          paidAt: ord.paidAt,
          createdAt: ord.createdAt,
        };
      });

      return { orders: ordersWithParsedCodes };
    },
  }),

  /**
   * Action: Checkout & generate QRIS payment invoice with realtime FX pricing
   * Automatically associates with logged-in user if session exists.
   */
  checkout: defineAction({
    input: z.object({
      productId: z.number().int().positive(),
      quantity: z.number().int().min(1).default(1),
      email: z.string().optional().default('guest@sigmastore.com'),
      whatsapp: z.string().optional().default('081200000000'),
    }),
    handler: async (input, context) => {
      // Check if user is logged in
      const userToken = context.cookies.get(USER_COOKIE_NAME)?.value;
      const currentUser = await getUserFromSession(userToken);

      let customerEmail = (input.email && input.email.includes('@')) ? input.email.trim() : 'guest@pixelstore.com';
      let customerWhatsapp = (input.whatsapp && input.whatsapp.trim().length >= 8) ? input.whatsapp.trim() : '081200000000';

      if (currentUser) {
        if (customerEmail === 'guest@pixelstore.com') {
          customerEmail = currentUser.email;
        }
        if (customerWhatsapp === '081200000000' && currentUser.phone) {
          customerWhatsapp = currentUser.phone;
        }
      }

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
        if (typeof balanceInfo?.balance === 'number' && balanceInfo.balance < requiredUsdt) {
          throw new Error('Mohon maaf, saldo kuota produk sedang kosong (stok restock). Pembelian sementara tidak dapat diproses.');
        }
      } catch (err) {
        if ((err as Error).message.includes('saldo kuota produk')) {
          throw err;
        }
        console.warn('Pre-flight balance check warning:', (err as Error).message);
      }

      // 3. Dynamic Realtime IDR calculation from authoritative database product price
      const autoPricing = calculateRetailPriceIdr(product.basePriceUsdt, 1, dynamicPricing);
      const effectiveUnitPrice = (product.customRetailPriceIdr && product.customRetailPriceIdr > 0)
        ? product.customRetailPriceIdr
        : (product.retailPriceIdr || autoPricing.unitPriceIdr);
      const totalAmountIdr = effectiveUnitPrice * input.quantity;

      const prefix = config.store.storeName.replace(/[^A-Za-z0-9]/g, '').slice(0, 5).toUpperCase() || 'PIXEL';
      const orderNumber = `${prefix}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      const idempotencyKey = crypto.randomUUID();

      // 4. Request QRIS Invoice from Payment Gateway
      const paymentGateway = getPaymentGateway();
      const invoice = await paymentGateway.createQRISInvoice({
        orderNumber,
        amountIdr: totalAmountIdr,
        customerEmail: customerEmail,
        customerWhatsapp: customerWhatsapp,
        productName: `${product.name} (x${input.quantity})`,
        expiryMinutes: config.orders.expiryMinutes,
      });

      const orderId = crypto.randomUUID();
      const paymentId = crypto.randomUUID();

      // 5. Atomic database insertion (linking userId if logged in)
      await db.insert(schema.orders).values({
        id: orderId,
        orderNumber,
        userId: currentUser?.id || null,
        customerEmail: customerEmail,
        customerWhatsapp: customerWhatsapp,
        productId: product.id,
        productName: product.name,
        quantity: input.quantity,
        basePriceUsdt: product.basePriceUsdt,
        exchangeRateIdr: dynamicPricing.usdtIdrRate,
        marginPercent: dynamicPricing.marginPercent,
        totalAmountIdr: totalAmountIdr,
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
        amountIdr: totalAmountIdr,
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
        unitPriceIdr: effectiveUnitPrice,
        amountIdr: totalAmountIdr,
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
        // Lookup product from database cache to resolve real supplierProductId
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
          `https://one.google.com/promo/claim/${crypto.randomBytes(6).toString('hex')}?ref=pixelstore_${order.orderNumber}`
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
   * Action: Update pricing configuration in PostgreSQL (Biaya operasional & Margin untung)
   * Note: Nilai tukar (FX) otomatis dikelola oleh sistem secara realtime.
   */
  updatePricingSettings: defineAction({
    input: z.object({
      fxBufferPercent: z.number().min(0).max(10).default(0.5),
      marginPercent: z.number().min(0).max(100),
      gatewayFeePercent: z.number().min(0).max(20).default(5.0),
      fixedFeeIdr: z.number().int().min(0).max(50000).optional().default(0),
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

      // Recalculate all cached products in PostgreSQL (preserving manual custom prices)
      const products = await db.select().from(schema.productsCache);
      for (const p of products) {
        if (!p.customRetailPriceIdr || p.customRetailPriceIdr <= 0) {
          const recalculated = calculateRetailPriceIdr(p.basePriceUsdt, 1, dynamicPricing);
          await db
            .update(schema.productsCache)
            .set({ retailPriceIdr: recalculated.unitPriceIdr })
            .where(eq(schema.productsCache.id, p.id));
        }
      }

      return { success: true, updatedPricing: dynamicPricing };
    },
  }),

  /**
   * Action: Retrieve authoritative realtime product price and stock from database
   * Ensures checkout and purchase flows always have zero price discrepancy with dashboard.
   */
  getLatestProductPrice: defineAction({
    input: z.object({
      productId: z.number().int().positive(),
      quantity: z.number().int().min(1).default(1),
    }),
    handler: async ({ productId, quantity }) => {
      const dynamicPricing = await getDynamicPricingConfig();
      const product = await db
        .select()
        .from(schema.productsCache)
        .where(eq(schema.productsCache.id, productId))
        .then((r) => r[0]);

      if (!product) {
        throw new Error('Produk tidak ditemukan');
      }

      const autoPricing = calculateRetailPriceIdr(product.basePriceUsdt, 1, dynamicPricing);
      const effectiveUnitPrice = (product.customRetailPriceIdr && product.customRetailPriceIdr > 0)
        ? product.customRetailPriceIdr
        : (product.retailPriceIdr || autoPricing.unitPriceIdr);

      let canPurchase = Boolean(product.inStock && (product.stock === null || product.stock >= quantity));
      let unavailableReason: string | null = null;

      if (!canPurchase) {
        unavailableReason = 'Stok produk habis';
      } else {
        try {
          const balanceInfo = await insightXPro.getBalance();
          const requiredUsdt = product.basePriceUsdt * quantity;
          if (typeof balanceInfo?.balance === 'number' && balanceInfo.balance < requiredUsdt) {
            canPurchase = false;
            unavailableReason = 'Saldo kuota produk sedang kosong (restock)';
          }
        } catch {
          // If supplier balance check fails, allow normal flow
        }
      }

      return {
        productId: product.id,
        name: product.name,
        unitPriceIdr: effectiveUnitPrice,
        totalAmountIdr: effectiveUnitPrice * quantity,
        stock: product.stock ?? 0,
        inStock: Boolean(product.inStock && (product.stock === null || product.stock > 0)),
        isCustomPrice: Boolean(product.customRetailPriceIdr && product.customRetailPriceIdr > 0),
        canPurchase,
        unavailableReason,
      };
    },
  }),

  /**
   * Action: Admin update product retail price (manual custom override or reset to auto)
   */
  adminUpdateProductPrice: defineAction({
    input: z.object({
      productId: z.number().int(),
      customPriceIdr: z.number().int().nullable().optional(),
    }),
    handler: async ({ productId, customPriceIdr }, context) => {
      const sessionToken = context.cookies.get(ADMIN_COOKIE_NAME)?.value;
      if (!verifyAdminSessionToken(sessionToken)) {
        throw new Error('Akses ditolak: Silakan masuk ke panel admin terlebih dahulu.');
      }

      const product = await db
        .select()
        .from(schema.productsCache)
        .where(eq(schema.productsCache.id, productId))
        .then((r) => r[0]);

      if (!product) {
        throw new Error('Produk tidak ditemukan di database.');
      }

      let newCustomPrice: number | null = null;
      let effectiveRetailPrice = product.retailPriceIdr;

      if (customPriceIdr && customPriceIdr > 0) {
        newCustomPrice = customPriceIdr;
        effectiveRetailPrice = customPriceIdr;
      } else {
        // Reset to automatic formula pricing
        const dynamicPricing = await getDynamicPricingConfig();
        const auto = calculateRetailPriceIdr(product.basePriceUsdt, 1, dynamicPricing);
        effectiveRetailPrice = auto.unitPriceIdr;
      }

      await db
        .update(schema.productsCache)
        .set({
          customRetailPriceIdr: newCustomPrice,
          retailPriceIdr: effectiveRetailPrice,
        })
        .where(eq(schema.productsCache.id, productId));

      return {
        success: true,
        productId,
        customRetailPriceIdr: newCustomPrice,
        retailPriceIdr: effectiveRetailPrice,
      };
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

  /**
   * Action: Toggle product active/inactive visibility on the public storefront
   */
  adminToggleProductStatus: defineAction({
    input: z.object({
      productId: z.number().int(),
      isActive: z.boolean(),
    }),
    handler: async ({ productId, isActive }, context) => {
      const sessionToken = context.cookies.get(ADMIN_COOKIE_NAME)?.value;
      if (!verifyAdminSessionToken(sessionToken)) {
        throw new Error('Akses ditolak: Silakan masuk ke panel admin terlebih dahulu.');
      }
      await db
        .update(schema.productsCache)
        .set({ isActive })
        .where(eq(schema.productsCache.id, productId));
      return { success: true, isActive };
    },
  }),

  /**
   * Action: Toggle product Top Product (Featured) flag
   */
  adminToggleTopProduct: defineAction({
    input: z.object({
      productId: z.number().int(),
      isTopProduct: z.boolean(),
    }),
    handler: async ({ productId, isTopProduct }, context) => {
      const sessionToken = context.cookies.get(ADMIN_COOKIE_NAME)?.value;
      if (!verifyAdminSessionToken(sessionToken)) {
        throw new Error('Akses ditolak: Silakan masuk ke panel admin terlebih dahulu.');
      }
      await db
        .update(schema.productsCache)
        .set({ isTopProduct })
        .where(eq(schema.productsCache.id, productId));
      return { success: true, isTopProduct };
    },
  }),

  /**
   * Action: Retry upstream supplier fulfillment for a paid/failed order
   */
  adminRetryOrderFulfillment: defineAction({
    input: z.object({
      orderId: z.string().min(1),
    }),
    handler: async ({ orderId }, context) => {
      const sessionToken = context.cookies.get(ADMIN_COOKIE_NAME)?.value;
      if (!verifyAdminSessionToken(sessionToken)) {
        throw new Error('Akses ditolak: Silakan masuk ke panel admin terlebih dahulu.');
      }
      const order = await db
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.id, orderId))
        .then((rows) => rows[0]);

      if (!order) throw new Error('Pesanan tidak ditemukan.');

      const product = await db
        .select()
        .from(schema.productsCache)
        .where(eq(schema.productsCache.id, order.productId))
        .then((rows) => rows[0]);

      const supplierProductId = product?.supplierProductId ?? order.productId;
      try {
        const apiKey = process.env.INSIGHTXPRO_API_KEY;
        if (apiKey) {
          const supplierRes = await insightXPro.placeOrder(
            {
              product_id: supplierProductId,
              quantity: order.quantity,
            },
            order.idempotencyKey
          );

          if (supplierRes.codes && supplierRes.codes.length > 0) {
            await db
              .update(schema.orders)
              .set({
                status: 'COMPLETED',
                supplierOrderId: String(supplierRes.order_id),
                licenseCodes: JSON.stringify(supplierRes.codes),
                failureReason: null,
                fulfilledAt: new Date().toISOString(),
              })
              .where(eq(schema.orders.id, order.id));

            return { success: true, codes: supplierRes.codes };
          }
        }
      } catch (err) {
        throw new Error(`Upstream supplier gagal: ${(err as Error).message}`);
      }

      // If simulated / sandbox order
      const sampleLinks = Array.from({ length: order.quantity }).map(() =>
        `https://one.google.com/promo/claim/${crypto.randomBytes(6).toString('hex')}?ref=pixelstore_${order.orderNumber}`
      );
      await db
        .update(schema.orders)
        .set({
          status: 'COMPLETED',
          supplierOrderId: `MANUAL-RETRY-${Date.now()}`,
          licenseCodes: JSON.stringify(sampleLinks),
          failureReason: null,
          fulfilledAt: new Date().toISOString(),
        })
        .where(eq(schema.orders.id, order.id));

      return { success: true, codes: sampleLinks };
    },
  }),

  /**
   * Action: Mark order as REFUNDED with custom notes
   */
  adminMarkOrderRefunded: defineAction({
    input: z.object({
      orderId: z.string().min(1),
      reason: z.string().optional(),
    }),
    handler: async ({ orderId, reason }, context) => {
      const sessionToken = context.cookies.get(ADMIN_COOKIE_NAME)?.value;
      if (!verifyAdminSessionToken(sessionToken)) {
        throw new Error('Akses ditolak: Silakan masuk ke panel admin terlebih dahulu.');
      }
      await db
        .update(schema.orders)
        .set({
          status: 'REFUNDED',
          failureReason: reason ? `Refund: ${reason}` : 'Pesanan telah direfund oleh admin.',
        })
        .where(eq(schema.orders.id, orderId));
      return { success: true };
    },
  }),

  /**
   * Action: Cancel order by admin
   */
  adminCancelOrder: defineAction({
    input: z.object({
      orderId: z.string().min(1),
      reason: z.string().optional(),
    }),
    handler: async ({ orderId, reason }, context) => {
      const sessionToken = context.cookies.get(ADMIN_COOKIE_NAME)?.value;
      if (!verifyAdminSessionToken(sessionToken)) {
        throw new Error('Akses ditolak: Silakan masuk ke panel admin terlebih dahulu.');
      }
      await db
        .update(schema.orders)
        .set({
          status: 'CANCELED',
          failureReason: reason ? `Dibatalkan: ${reason}` : 'Pesanan dibatalkan oleh Admin.',
        })
        .where(eq(schema.orders.id, orderId));
      return { success: true };
    },
  }),

  /**
   * Action: Update store operational & profile settings
   */
  adminUpdateStoreSettings: defineAction({
    input: z.object({
      storeName: z.string().min(1),
      storeTagline: z.string().min(1),
      supportWhatsapp: z.string().min(1),
      announcement: z.string().default(''),
      isStoreOpen: z.boolean().default(true),
      qrisNmid: z.string().default('ID1020021303845'),
      expiryMinutes: z.number().int().min(5).max(120).default(15),
      maxQuantityPerOrder: z.number().int().min(1).max(20).default(5),
    }),
    handler: async (input, context) => {
      const sessionToken = context.cookies.get(ADMIN_COOKIE_NAME)?.value;
      if (!verifyAdminSessionToken(sessionToken)) {
        throw new Error('Akses ditolak: Silakan masuk ke panel admin terlebih dahulu.');
      }
      await updateSystemSection('store', {
        storeName: input.storeName,
        storeTagline: input.storeTagline,
        supportWhatsapp: input.supportWhatsapp,
        announcement: input.announcement,
        isStoreOpen: input.isStoreOpen,
        qrisNmid: input.qrisNmid,
      });
      await updateSystemSection('orders', {
        expiryMinutes: input.expiryMinutes,
        maxQuantityPerOrder: input.maxQuantityPerOrder,
      });
      return { success: true };
    },
  }),

  /**
   * Action: Update admin secret PIN
   */
  adminUpdatePin: defineAction({
    input: z.object({
      currentPin: z.string().min(1),
      newPin: z.string().min(4, 'PIN baru minimal 4 karakter'),
    }),
    handler: async ({ currentPin, newPin }, context) => {
      const sessionToken = context.cookies.get(ADMIN_COOKIE_NAME)?.value;
      if (!verifyAdminSessionToken(sessionToken)) {
        throw new Error('Akses ditolak: Silakan masuk ke panel admin terlebih dahulu.');
      }
      if (!verifyAdminPin(currentPin)) {
        throw new Error('PIN saat ini tidak valid.');
      }
      process.env.ADMIN_SECRET_PIN = newPin.trim();
      return { success: true };
    },
  }),

  /**
   * Action: Get or check buyer live support chat session (requires user login)
   */
  getOrCreateBuyerChat: defineAction({
    input: z.object({
      orderNumber: z.string().optional(),
    }),
    handler: async ({ orderNumber }, context) => {
      // 1. Mandatory customer login check
      const sessionToken = context.cookies.get(USER_COOKIE_NAME)?.value;
      const user = await getUserFromSession(sessionToken);
      if (!user) {
        return {
          isAuthenticated: false,
          user: null,
          conversation: null,
          messages: [],
        };
      }

      // 2. Find existing conversation for this user
      let conv = await db
        .select()
        .from(schema.supportConversations)
        .where(eq(schema.supportConversations.userId, user.id))
        .limit(1)
        .then((rows) => rows[0]);

      // If no conversation exists yet: do NOT insert anything!
      // This prevents empty conversations from showing up in admin dashboard before user chats.
      if (!conv) {
        return {
          isAuthenticated: true,
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
          },
          conversation: null,
          messages: [],
        };
      }

      // If conversation already exists, update orderNumber if provided and unread
      if (orderNumber && orderNumber.trim() && orderNumber !== conv.orderNumber) {
        await db
          .update(schema.supportConversations)
          .set({ orderNumber: orderNumber.trim() })
          .where(eq(schema.supportConversations.id, conv.id));
        conv.orderNumber = orderNumber.trim();
      }

      if (conv.unreadByBuyer > 0) {
        await db
          .update(schema.supportConversations)
          .set({ unreadByBuyer: 0 })
          .where(eq(schema.supportConversations.id, conv.id));
        conv.unreadByBuyer = 0;
      }

      const messages = await db
        .select()
        .from(schema.supportMessages)
        .where(eq(schema.supportMessages.conversationId, conv.id))
        .orderBy(asc(schema.supportMessages.createdAt));

      return {
        isAuthenticated: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
        conversation: conv,
        messages,
      };
    },
  }),

  /**
   * Action: Send message as buyer (requires user login, creates conversation on first message)
   */
  sendBuyerChatMessage: defineAction({
    input: z.object({
      conversationId: z.string().optional(),
      message: z.string().min(1, 'Pesan tidak boleh kosong').max(2000),
      orderNumber: z.string().optional(),
    }),
    handler: async ({ conversationId, message, orderNumber }, context) => {
      // 1. Mandatory customer login check
      const sessionToken = context.cookies.get(USER_COOKIE_NAME)?.value;
      const user = await getUserFromSession(sessionToken);
      if (!user) {
        throw new Error('Silakan masuk ke akun pelanggan Anda terlebih dahulu untuk mengirim pesan.');
      }

      const trimmedMsg = message.trim();
      const nowIso = new Date().toISOString();

      let conv = conversationId
        ? await db
            .select()
            .from(schema.supportConversations)
            .where(
              and(
                eq(schema.supportConversations.id, conversationId),
                eq(schema.supportConversations.userId, user.id)
              )
            )
            .limit(1)
            .then((rows) => rows[0])
        : null;

      // If user doesn't have an active conversation yet, create it on first message!
      if (!conv) {
        conv = await db
          .select()
          .from(schema.supportConversations)
          .where(eq(schema.supportConversations.userId, user.id))
          .limit(1)
          .then((rows) => rows[0]);

        if (!conv) {
          const convId = `conv_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
          await db.insert(schema.supportConversations).values({
            id: convId,
            userId: user.id,
            buyerSessionId: user.id,
            buyerName: user.name,
            buyerEmail: user.email,
            orderNumber: orderNumber?.trim() || null,
            status: 'OPEN',
            lastMessageText: trimmedMsg,
            lastMessageSender: 'BUYER',
            unreadByAdmin: 1,
            unreadByBuyer: 0,
            lastMessageAt: nowIso,
          });

          conv = await db
            .select()
            .from(schema.supportConversations)
            .where(eq(schema.supportConversations.id, convId))
            .limit(1)
            .then((rows) => rows[0]);
        }
      }

      if (!conv) {
        throw new Error('Gagal memuat sesi percakapan bantuan.');
      }

      const msgId = `msg_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

      const [newMsg] = await db
        .insert(schema.supportMessages)
        .values({
          id: msgId,
          conversationId: conv.id,
          senderType: 'BUYER',
          senderName: user.name,
          message: trimmedMsg,
          isRead: false,
          createdAt: nowIso,
        })
        .returning();

      // Check if buyer message mentions an order number e.g. PIXEL-20261004-XXXX
      let autoOrderNote: string | null = null;
      let detectedOrderNum: string | null = null;
      const orderMatch = trimmedMsg.match(/PIXEL-\d{8}-[A-Za-z0-9]+/i) || trimmedMsg.match(/PIXEL-[A-Za-z0-9-]+/i);
      if (orderMatch) {
        detectedOrderNum = orderMatch[0].toUpperCase();
        const order = await db
          .select()
          .from(schema.orders)
          .where(eq(schema.orders.orderNumber, detectedOrderNum))
          .limit(1)
          .then((rows) => rows[0]);

        if (order) {
          let statusBadge = order.status;
          if (order.status === 'COMPLETED') statusBadge = 'Selesai & Lisensi Aktif';
          else if (order.status === 'PENDING_PAYMENT') statusBadge = 'Menunggu Pembayaran';
          else if (order.status === 'CANCELED') statusBadge = 'Dibatalkan';
          else if (order.status === 'REFUNDED') statusBadge = 'Telah Direfund';

          autoOrderNote = `Sistem mencatat pesanan: ${order.orderNumber} (${order.productName} x${order.quantity}) - Status: ${statusBadge}. Admin sedang meninjau pesanan Anda.`;
        }
      }

      // Update conversation metadata
      await db
        .update(schema.supportConversations)
        .set({
          lastMessageText: trimmedMsg,
          lastMessageSender: 'BUYER',
          unreadByAdmin: (conv.unreadByAdmin || 0) + 1,
          lastMessageAt: nowIso,
          status: 'OPEN',
          ...(detectedOrderNum && !conv.orderNumber ? { orderNumber: detectedOrderNum } : {}),
        })
        .where(eq(schema.supportConversations.id, conv.id));

      if (autoOrderNote) {
        const sysMsgId = `msg_${Date.now() + 50}_${crypto.randomBytes(2).toString('hex')}`;
        await db.insert(schema.supportMessages).values({
          id: sysMsgId,
          conversationId: conv.id,
          senderType: 'SYSTEM',
          senderName: 'Sistem Pixel Store',
          message: autoOrderNote,
          isRead: true,
          createdAt: new Date().toISOString(),
        });
      }

      return { success: true, conversation: conv, message: newMsg };
    },
  }),

  /**
   * Action: Fetch buyer chat messages (for live polling)
   */
  getBuyerChatMessages: defineAction({
    input: z.object({
      conversationId: z.string().min(1),
    }),
    handler: async ({ conversationId }, context) => {
      const sessionToken = context.cookies.get(USER_COOKIE_NAME)?.value;
      const user = await getUserFromSession(sessionToken);
      if (!user) {
        throw new Error('Sesi tidak valid.');
      }

      const conv = await db
        .select()
        .from(schema.supportConversations)
        .where(
          and(
            eq(schema.supportConversations.id, conversationId),
            eq(schema.supportConversations.userId, user.id)
          )
        )
        .limit(1)
        .then((rows) => rows[0]);

      if (!conv) {
        throw new Error('Sesi percakapan tidak ditemukan.');
      }

      if (conv.unreadByBuyer > 0) {
        await db
          .update(schema.supportConversations)
          .set({ unreadByBuyer: 0 })
          .where(eq(schema.supportConversations.id, conv.id));
        conv.unreadByBuyer = 0;
      }

      const messages = await db
        .select()
        .from(schema.supportMessages)
        .where(eq(schema.supportMessages.conversationId, conv.id))
        .orderBy(asc(schema.supportMessages.createdAt));

      return {
        conversation: conv,
        messages,
      };
    },
  }),

  /**
   * Action: Admin fetch all active conversations
   */
  adminGetChatConversations: defineAction({
    input: z.object({
      status: z.enum(['ALL', 'OPEN', 'RESOLVED']).default('ALL'),
    }),
    handler: async ({ status }, context) => {
      const sessionToken = context.cookies.get(ADMIN_COOKIE_NAME)?.value;
      if (!verifyAdminSessionToken(sessionToken)) {
        throw new Error('Akses ditolak: Silakan masuk ke panel admin.');
      }

      // Count open and resolved conversations for tabs
      const allRows = await db
        .select({
          id: schema.supportConversations.id,
          status: schema.supportConversations.status,
          unreadByAdmin: schema.supportConversations.unreadByAdmin,
        })
        .from(schema.supportConversations);

      const openCount = allRows.filter((r) => r.status === 'OPEN').length;
      const resolvedCount = allRows.filter((r) => r.status === 'RESOLVED').length;
      const totalUnread = allRows.reduce((acc, c) => acc + (c.unreadByAdmin || 0), 0);

      // In tab 'ALL' (Semua) and 'OPEN', only active/open chats are returned.
      // Resolved chats ONLY exist in tab 'RESOLVED' (Selesai).
      let query = db.select().from(schema.supportConversations);
      if (status === 'RESOLVED') {
        query = query.where(eq(schema.supportConversations.status, 'RESOLVED')) as any;
      } else {
        query = query.where(eq(schema.supportConversations.status, 'OPEN')) as any;
      }

      const conversations = await query.orderBy(desc(schema.supportConversations.lastMessageAt));

      return {
        conversations,
        totalUnread,
        openCount,
        resolvedCount,
      };
    },
  }),

  /**
   * Action: Admin search registered users to start/open chat
   */
  adminSearchUsersForChat: defineAction({
    input: z.object({
      query: z.string().min(1),
    }),
    handler: async ({ query }, context) => {
      const sessionToken = context.cookies.get(ADMIN_COOKIE_NAME)?.value;
      if (!verifyAdminSessionToken(sessionToken)) {
        throw new Error('Akses ditolak: Silakan masuk ke panel admin.');
      }

      const q = query.trim().toLowerCase();
      const allUsers = await db
        .select({
          id: schema.users.id,
          name: schema.users.name,
          email: schema.users.email,
          phone: schema.users.phone,
        })
        .from(schema.users)
        .limit(30);

      const filtered = allUsers.filter(
        (u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
      );

      return { users: filtered };
    },
  }),

  /**
   * Action: Admin open/initiate chat with a registered user
   */
  adminOpenUserChat: defineAction({
    input: z.object({
      userId: z.string().min(1),
    }),
    handler: async ({ userId }, context) => {
      const sessionToken = context.cookies.get(ADMIN_COOKIE_NAME)?.value;
      if (!verifyAdminSessionToken(sessionToken)) {
        throw new Error('Akses ditolak: Silakan masuk ke panel admin.');
      }

      const user = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1)
        .then((rows) => rows[0]);

      if (!user) throw new Error('Pengguna tidak ditemukan.');

      let conv = await db
        .select()
        .from(schema.supportConversations)
        .where(eq(schema.supportConversations.userId, user.id))
        .limit(1)
        .then((rows) => rows[0]);

      if (!conv) {
        const convId = `conv_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
        await db.insert(schema.supportConversations).values({
          id: convId,
          userId: user.id,
          buyerSessionId: user.id,
          buyerName: user.name,
          buyerEmail: user.email,
          status: 'OPEN',
          lastMessageText: 'Percakapan dibuka oleh Admin.',
          lastMessageSender: 'ADMIN',
          unreadByAdmin: 0,
          unreadByBuyer: 0,
          lastMessageAt: new Date().toISOString(),
        });

        conv = await db
          .select()
          .from(schema.supportConversations)
          .where(eq(schema.supportConversations.id, convId))
          .limit(1)
          .then((rows) => rows[0]);
      } else if (conv.status === 'RESOLVED') {
        await db
          .update(schema.supportConversations)
          .set({
            status: 'OPEN',
            updatedAt: new Date().toISOString(),
          })
          .where(eq(schema.supportConversations.id, conv.id));
        conv.status = 'OPEN';
      }

      if (!conv) {
        throw new Error('Gagal menginisialisasi sesi percakapan.');
      }

      const messages = await db
        .select()
        .from(schema.supportMessages)
        .where(eq(schema.supportMessages.conversationId, conv.id))
        .orderBy(asc(schema.supportMessages.createdAt));

      return { conversation: conv, messages };
    },
  }),

  /**
   * Action: Admin fetch messages in a conversation
   */
  adminGetChatMessages: defineAction({
    input: z.object({
      conversationId: z.string().min(1),
    }),
    handler: async ({ conversationId }, context) => {
      const sessionToken = context.cookies.get(ADMIN_COOKIE_NAME)?.value;
      if (!verifyAdminSessionToken(sessionToken)) {
        throw new Error('Akses ditolak: Silakan masuk ke panel admin.');
      }

      const conv = await db
        .select()
        .from(schema.supportConversations)
        .where(eq(schema.supportConversations.id, conversationId))
        .limit(1)
        .then((rows) => rows[0]);

      if (!conv) {
        throw new Error('Percakapan tidak ditemukan.');
      }

      if (conv.unreadByAdmin > 0) {
        await db
          .update(schema.supportConversations)
          .set({ unreadByAdmin: 0 })
          .where(eq(schema.supportConversations.id, conv.id));
        conv.unreadByAdmin = 0;
      }

      const messages = await db
        .select()
        .from(schema.supportMessages)
        .where(eq(schema.supportMessages.conversationId, conv.id))
        .orderBy(asc(schema.supportMessages.createdAt));

      return {
        conversation: conv,
        messages,
      };
    },
  }),

  /**
   * Action: Admin send reply to buyer
   */
  adminSendChatMessage: defineAction({
    input: z.object({
      conversationId: z.string().min(1),
      message: z.string().min(1, 'Pesan tidak boleh kosong').max(2000),
      adminName: z.string().default('Admin CS Pixel Store'),
    }),
    handler: async ({ conversationId, message, adminName }, context) => {
      const sessionToken = context.cookies.get(ADMIN_COOKIE_NAME)?.value;
      if (!verifyAdminSessionToken(sessionToken)) {
        throw new Error('Akses ditolak: Silakan masuk ke panel admin.');
      }

      const conv = await db
        .select()
        .from(schema.supportConversations)
        .where(eq(schema.supportConversations.id, conversationId))
        .limit(1)
        .then((rows) => rows[0]);

      if (!conv) {
        throw new Error('Percakapan tidak ditemukan.');
      }

      const trimmedMsg = message.trim();
      const msgId = `msg_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      const nowIso = new Date().toISOString();

      const [newMsg] = await db
        .insert(schema.supportMessages)
        .values({
          id: msgId,
          conversationId: conv.id,
          senderType: 'ADMIN',
          senderName: adminName || 'Admin CS Pixel Store',
          message: trimmedMsg,
          isRead: false,
          createdAt: nowIso,
        })
        .returning();

      await db
        .update(schema.supportConversations)
        .set({
          lastMessageText: trimmedMsg,
          lastMessageSender: 'ADMIN',
          unreadByBuyer: (conv.unreadByBuyer || 0) + 1,
          lastMessageAt: nowIso,
          status: 'OPEN',
        })
        .where(eq(schema.supportConversations.id, conv.id));

      return { success: true, message: newMsg };
    },
  }),

  /**
   * Action: Admin toggle conversation status
   */
  adminUpdateChatStatus: defineAction({
    input: z.object({
      conversationId: z.string().min(1),
      status: z.enum(['OPEN', 'RESOLVED']),
    }),
    handler: async ({ conversationId, status }, context) => {
      const sessionToken = context.cookies.get(ADMIN_COOKIE_NAME)?.value;
      if (!verifyAdminSessionToken(sessionToken)) {
        throw new Error('Akses ditolak: Silakan masuk ke panel admin.');
      }

      await db
        .update(schema.supportConversations)
        .set({
          status,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(schema.supportConversations.id, conversationId));

      const statusText = status === 'RESOLVED' ? 'diselesaikan' : 'dibuka kembali';
      const sysMsgId = `msg_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;
      await db.insert(schema.supportMessages).values({
        id: sysMsgId,
        conversationId,
        senderType: 'SYSTEM',
        senderName: 'Sistem Pixel Store',
        message: `Tiket obrolan ini telah ditandai ${statusText.toUpperCase()} oleh Admin.`,
        isRead: true,
        createdAt: new Date().toISOString(),
      });

      return { success: true };
    },
  }),

  /**
   * Action: Admin delete chat conversation and all associated messages
   */
  adminDeleteChatConversation: defineAction({
    input: z.object({
      conversationId: z.string().min(1),
    }),
    handler: async ({ conversationId }, context) => {
      const sessionToken = context.cookies.get(ADMIN_COOKIE_NAME)?.value;
      if (!verifyAdminSessionToken(sessionToken)) {
        throw new Error('Akses ditolak: Silakan masuk ke panel admin.');
      }

      // Explicitly delete messages first
      await db
        .delete(schema.supportMessages)
        .where(eq(schema.supportMessages.conversationId, conversationId));

      // Delete the conversation
      await db
        .delete(schema.supportConversations)
        .where(eq(schema.supportConversations.id, conversationId));

      return { success: true };
    },
  }),
};

