'use server';

import { z } from 'zod';
import { cookies } from 'next/headers';
import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { eq, desc, or, and, asc, sql } from 'drizzle-orm';
import { db, schema, sqlClient } from '@/db';
import { insightXPro } from '@/lib/insightxpro/client';
import { calculateRetailPriceIdr, getDynamicPricingConfig } from '@/lib/pricing/engine';
import { getLiveUsdtRate } from '@/lib/pricing/fx-service';
import { getPaymentGateway } from '@/lib/payment/adapter';
import { getSystemConfig, updateSystemSection } from '@/lib/settings/service';
import { syncRealtimeCatalog } from '@/lib/catalog/service';
import { executeOrderFulfillment } from '@/lib/order/fulfillment';
import { auth as neonAuth } from '@/lib/auth/server';
import { 
  ADMIN_COOKIE_NAME, 
  verifyAdminPin, 
  createAdminSessionToken, 
  verifyAdminSessionToken,
  getAdminSession,
} from '@/lib/auth/admin';
import {
  USER_COOKIE_NAME,
  createUserAccount,
  authenticateUser,
  createUserSession,
  getUserFromSession,
  deleteUserSession,
  getEffectiveUser,
  syncNeonOAuthUser,
  createPasswordResetCode,
  verifyAndApplyPasswordReset,
  adminDirectResetUserPassword,
} from '@/lib/auth/user';
import {
  verifySmtpConnection,
  sendTestEmail,
  sendOrderFulfillmentEmail,
  sendPasswordResetEmail,
} from '@/lib/email/mailer';
import {
  sendTelegramNotification,
  sendTelegramPurchaseNotification,
  sendTelegramMessage,
  setTelegramWebhook,
  getTelegramConfig,
} from '@/lib/telegram/bot';

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

// -------------------------------------------------------------
// USER & AUTHENTICATION ACTIONS (NEON MANAGED BETTER AUTH)
// -------------------------------------------------------------

export async function registerUser(input: {
  name: string;
  email: string;
  password: string;
  phone?: string;
}) {
  try {
    const parsed = z.object({
      name: z.string().min(2, 'Nama minimal 2 karakter').max(100),
      email: z.string().email('Format email tidak valid'),
      password: z.string().min(6, 'Kata sandi minimal 6 karakter'),
      phone: z.string().optional().default(''),
    }).parse(input);

    let neonUserId: string | undefined;

    // 1. Neon Managed Better Auth registration
    try {
      const neonRes = await neonAuth.signUp.email({
        email: parsed.email,
        name: parsed.name,
        password: parsed.password,
      });

      if (neonRes?.data?.user) {
        neonUserId = neonRes.data.user.id;
      } else if (neonRes?.error) {
        const msg = neonRes.error.message || '';
        // If it is an explicit auth validation/conflict error, throw it
        if (!msg.includes('fetch failed') && !msg.includes('ENOTFOUND') && !msg.includes('ECONNREFUSED')) {
          throw new Error(msg);
        }
      }
    } catch (neonErr) {
      const errMsg = (neonErr as Error).message || '';
      if (!errMsg.includes('fetch failed') && !errMsg.includes('ENOTFOUND') && !errMsg.includes('ECONNREFUSED')) {
        throw neonErr;
      }
      console.warn('[NeonAuth] Upstream sign-up notice (using local sync):', errMsg);
    }

    // 2. Synchronize user in local schema for relational integrity
    const user = await createUserAccount({
      id: neonUserId,
      name: parsed.name,
      email: parsed.email,
      password: parsed.password,
      phone: parsed.phone,
      role: 'customer',
    });

    const { token } = await createUserSession(user.id);
    const cookieStore = await cookies();
    cookieStore.set(USER_COOKIE_NAME, token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60,
      secure: process.env.NODE_ENV === 'production',
    });

    return {
      success: true,
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
        },
      },
    };
  } catch (err) {
    return { success: false, error: { message: (err as Error).message } };
  }
}

export async function loginUser(input: { email: string; password: string }) {
  try {
    const parsed = z.object({
      email: z.string().email('Format email tidak valid'),
      password: z.string().min(1, 'Kata sandi tidak boleh kosong'),
    }).parse(input);

    let user: any = null;

    // 1. Neon Managed Better Auth login attempt
    try {
      const neonRes = await neonAuth.signIn.email({
        email: parsed.email,
        password: parsed.password,
      });
      if (neonRes?.data?.user) {
        user = await syncNeonOAuthUser(neonRes.data.user);
      }
    } catch (neonErr) {
      console.warn('[NeonAuth] Upstream sign-in notice:', (neonErr as Error).message);
    }

    // 2. Fall back to local authentication verification
    if (!user) {
      user = await authenticateUser(parsed.email, parsed.password);
    }

    const { token } = await createUserSession(user.id);

    const cookieStore = await cookies();
    cookieStore.set(USER_COOKIE_NAME, token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60,
      secure: process.env.NODE_ENV === 'production',
    });

    return {
      success: true,
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
        },
      },
    };
  } catch (err) {
    return { success: false, error: { message: (err as Error).message } };
  }
}

export async function logoutUser() {
  try {
    try {
      await neonAuth.signOut();
    } catch {}

    const cookieStore = await cookies();
    const token = cookieStore.get(USER_COOKIE_NAME)?.value;
    if (token) {
      await deleteUserSession(token);
    }
    cookieStore.delete(USER_COOKIE_NAME);
    return { success: true, data: { success: true } };
  } catch (err) {
    return { success: false, error: { message: (err as Error).message } };
  }
}

export async function getCurrentUser() {
  try {
    const user = await getEffectiveUser();
    if (!user) {
      return { success: true, data: { user: null } };
    }
    return {
      success: true,
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone || '',
          role: user.role,
          image: user.image || null,
        },
      },
    };
  } catch (err) {
    return { success: false, error: { message: (err as Error).message } };
  }
}

export async function requestPasswordReset(input: { email: string }) {
  try {
    const parsed = z.object({
      email: z.string().email('Format alamat email tidak valid'),
    }).parse(input);

    const { code, name, email } = await createPasswordResetCode(parsed.email);

    // Send email with verification code
    const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://pixelstore.oktaa.my.id'}/reset-password?email=${encodeURIComponent(email)}`;
    
    let emailSent = false;
    try {
      const emailRes = await sendPasswordResetEmail({
        customerEmail: email,
        customerName: name,
        resetCode: code,
        resetUrl,
      });
      emailSent = emailRes.success;
      if (!emailRes.success) {
        console.warn('[requestPasswordReset] Email notice:', emailRes.error);
      }
    } catch (mailErr) {
      console.error('[requestPasswordReset] Email sending failed:', mailErr);
    }

    return {
      success: true,
      data: {
        email,
        message: 'Kode verifikasi 6 digit telah dikirim ke email Anda. Silakan periksa kotak masuk atau folder spam.',
        emailSent,
      },
    };
  } catch (err) {
    return { success: false, error: { message: (err as Error).message } };
  }
}

export async function resetPasswordWithCode(input: {
  email: string;
  code: string;
  newPassword: string;
}) {
  try {
    const parsed = z.object({
      email: z.string().email('Format email tidak valid'),
      code: z.string().min(6, 'Kode verifikasi minimal 6 digit').max(6, 'Kode verifikasi maksimal 6 digit'),
      newPassword: z.string().min(6, 'Kata sandi baru minimal 6 karakter'),
    }).parse(input);

    const user = await verifyAndApplyPasswordReset(
      parsed.email,
      parsed.code,
      parsed.newPassword
    );

    // Automatically establish new user session
    const { token } = await createUserSession(user.id);
    const cookieStore = await cookies();
    cookieStore.set(USER_COOKIE_NAME, token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60,
      secure: process.env.NODE_ENV === 'production',
    });

    return {
      success: true,
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone || '',
          role: user.role,
        },
        message: 'Kata sandi berhasil diperbarui dan Anda telah masuk.',
      },
    };
  } catch (err) {
    return { success: false, error: { message: (err as Error).message } };
  }
}

export async function adminResetUserPassword(input: {
  userId: string;
  newPassword: string;
}) {
  try {
    const session = await getAdminSession();
    if (!session.isAuthenticated) {
      return { success: false, error: { message: 'Akses ditolak. Sesi admin diperlukan.' } };
    }

    const parsed = z.object({
      userId: z.string().min(1, 'ID Pengguna wajib diisi'),
      newPassword: z.string().min(6, 'Kata sandi baru minimal 6 karakter'),
    }).parse(input);

    const user = await adminDirectResetUserPassword(parsed.userId, parsed.newPassword);

    return {
      success: true,
      data: {
        userId: user.id,
        email: user.email,
        message: `Kata sandi untuk pengguna ${user.name} (${user.email}) berhasil diatur ulang.`,
      },
    };
  } catch (err) {
    return { success: false, error: { message: (err as Error).message } };
  }
}

export async function getUserOrders() {
  try {
    const user = await getEffectiveUser();
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

    return { success: true, data: { orders: ordersWithParsedCodes } };
  } catch (err) {
    return { success: false, error: { message: (err as Error).message } };
  }
}

// -------------------------------------------------------------
// CHECKOUT & PAYMENT ACTIONS
// -------------------------------------------------------------

export async function checkout(rawInput: {
  productId: number;
  quantity?: number;
  email?: string;
  whatsapp?: string;
}) {
  try {
    const input = z.object({
      productId: z.number().int().positive(),
      quantity: z.number().int().min(1).default(1),
      email: z.string().optional().default('guest@pixelstore.com'),
      whatsapp: z.string().optional().default('081200000000'),
    }).parse(rawInput);

    const currentUser = await getEffectiveUser();
    if (!currentUser) {
      throw new Error('Silakan masuk ke akun Anda terlebih dahulu sebelum melakukan pembelian agar lisensi digital tersimpan aman dan terkirim ke email Anda.');
    }

    let customerEmail = currentUser.email;
    let customerWhatsapp = (input.whatsapp && input.whatsapp.trim().length >= 8) 
      ? input.whatsapp.trim() 
      : (currentUser.phone || '081200000000');

    const config = await getSystemConfig();
    const dynamicPricing = await getDynamicPricingConfig();

    if (!config.store.isStoreOpen) {
      throw new Error('Toko sedang dalam pemeliharaan sistem. Silakan coba kembali nanti.');
    }

    if (config.store.isPaymentEnabled === false) {
      throw new Error(
        config.store.paymentDisabledReason?.trim() ||
          'Sistem pembayaran sedang dinonaktifkan sementara untuk pemeliharaan/migrasi gateway. Silakan hubungi CS atau coba beberapa saat lagi.'
      );
    }

    if (input.quantity > config.orders.maxQuantityPerOrder) {
      throw new Error(`Maksimal pembelian adalah ${config.orders.maxQuantityPerOrder} lisensi per transaksi.`);
    }

    // Ensure catalog cache is fresh (throttled to 30s)
    try {
      await syncRealtimeCatalog(false);
    } catch {}

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
        const isAvail = found.available !== false;
        const stockCount = typeof found.stock === 'number' ? Math.max(0, found.stock) : (isAvail ? 99 : 0);

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
            inStock: isAvail && stockCount > 0,
            isActive: isAvail && stockCount > 0,
          })
          .returning();

        product = inserted[0];
      } catch (err) {
        throw new Error(`Gagal mengambil data produk: ${(err as Error).message}`);
      }
    }

    // 2. Pre-flight check: Storefront stock and product active status validation
    if (product.isActive === false) {
      throw new Error('Mohon maaf, produk ini sedang tidak aktif atau ditarik dari katalog supplier.');
    }

    if (product.inStock === false || (product.stock !== null && product.stock !== undefined && product.stock < input.quantity)) {
      throw new Error(`Stok produk tidak mencukupi untuk jumlah pembelian ini. Sisa stok: ${product.stock ?? 0} unit.`);
    }

    // 2b. Realtime Wholesale Supplier Stock & Liveness Verification
    try {
      const supplierProducts = await insightXPro.getProducts();
      const supplierItem = supplierProducts.find((p) => p.id === product.supplierProductId);
      if (!supplierItem) {
        // Supplier has withdrawn or completely depleted this product
        await db
          .update(schema.productsCache)
          .set({
            stock: 0,
            inStock: false,
            isActive: false,
            lastSyncedAt: sql`CURRENT_TIMESTAMP`,
          })
          .where(eq(schema.productsCache.id, product.id));
        throw new Error('Mohon maaf, stok produk ini baru saja habis di supplier wholesale. Pembelian tidak dapat dilanjutkan agar pembayaran Anda tidak tertahan.');
      }

      const isSupplierAvailable = supplierItem.available !== false;
      const supplierStock = typeof supplierItem.stock === 'number' ? supplierItem.stock : (isSupplierAvailable ? 99 : 0);
      if (!isSupplierAvailable || supplierStock < input.quantity) {
        await db
          .update(schema.productsCache)
          .set({
            stock: supplierStock,
            inStock: isSupplierAvailable && supplierStock > 0,
            lastSyncedAt: sql`CURRENT_TIMESTAMP`,
          })
          .where(eq(schema.productsCache.id, product.id));
        throw new Error(`Mohon maaf, sisa stok produk ini di supplier hanya ${supplierStock} unit. Pembelian tidak dapat diproses.`);
      }
    } catch (err) {
      if ((err as Error).message.includes('Mohon maaf')) {
        throw err;
      }
      console.warn('Realtime supplier stock pre-flight check notice:', (err as Error).message);
    }

    const requiredUsdt = product.basePriceUsdt * input.quantity;
    try {
      const balanceInfo = await insightXPro.getBalance();
      if (typeof balanceInfo?.balance === 'number' && balanceInfo.balance < requiredUsdt) {
        throw new Error('Mohon maaf, saldo kuota pengadaan produk sedang kosong (dalam proses restock). Silakan hubungi Customer Service (CS) kami melalui menu Live Support.');
      }
    } catch (err) {
      if ((err as Error).message.includes('saldo kuota pengadaan') || (err as Error).message.includes('restock')) {
        throw err;
      }
      console.warn('Pre-flight balance check warning:', (err as Error).message);
    }

    // 3. Dynamic Realtime IDR calculation
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

    // Use charged amount from payment gateway if customer fee is enabled in PG
    const finalAmountIdr = (typeof invoice.amountIdr === 'number' && invoice.amountIdr > 0)
      ? invoice.amountIdr
      : totalAmountIdr;

    // 5. Atomic database insertion
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
      totalAmountIdr: finalAmountIdr,
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
      amountIdr: finalAmountIdr,
      status: 'UNPAID',
      expiresAt: invoice.expiresAt,
    });

    let qrCodeDataUrl = invoice.qrCodeDataUrl;

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
      success: true,
      data: {
        orderNumber,
        productName: product.name,
        quantity: input.quantity,
        unitPriceIdr: effectiveUnitPrice,
        amountIdr: finalAmountIdr,
        feeIdr: invoice.feeIdr || (finalAmountIdr - totalAmountIdr > 0 ? finalAmountIdr - totalAmountIdr : 0),
        qrCodeString: invoice.qrCodeString,
        paymentUrl: invoice.paymentUrl,
        qrCodeImageUrl: invoice.qrCodeImageUrl,
        qrCodeDataUrl,
        gatewayProvider: invoice.gatewayProvider,
        expiresAt: invoice.expiresAt,
      },
    };
  } catch (err) {
    return { success: false, error: { message: (err as Error).message } };
  }
}


export async function getOrderStatus(rawInput: { orderNumber: string }) {
  try {
    const { orderNumber } = z.object({
      orderNumber: z.string().min(5),
    }).parse(rawInput);

    const records = await db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.orderNumber, orderNumber));

    if (records.length === 0) {
      throw new Error('Pesanan tidak ditemukan');
    }

    let order = records[0];

    const payments = await db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.orderId, order.id));

    const payment = payments[0];

    if (order.status === 'PENDING_PAYMENT' && payment?.expiresAt) {
      const expiryTime = new Date(payment.expiresAt).getTime();
      if (!isNaN(expiryTime) && Date.now() > expiryTime) {
        await db
          .update(schema.orders)
          .set({
            status: 'EXPIRED',
            failureReason: 'Batas waktu pembayaran telah kadaluarsa',
            updatedAt: new Date().toISOString(),
          })
          .where(eq(schema.orders.id, order.id));

        await db
          .update(schema.payments)
          .set({ status: 'EXPIRED' })
          .where(eq(schema.payments.id, payment.id));

        order.status = 'EXPIRED';
        order.failureReason = 'Batas waktu pembayaran telah kadaluarsa';
      }
    }

    if (order.status === 'PENDING_PAYMENT' && payment) {
      if (payment.gatewayProvider === 'sumopod' && (payment.gatewayReference || payment.paymentUrl)) {
        const gateway = getPaymentGateway();
        if ('checkPaymentStatus' in gateway) {
          try {
            const liveStatus = await (gateway as any).checkPaymentStatus(payment.gatewayReference, payment.paymentUrl);
            if (liveStatus?.status === 'paid') {
              await executeOrderFulfillment(order.id, 'client_polling');

              const updatedRecords = await db
                .select()
                .from(schema.orders)
                .where(eq(schema.orders.id, order.id));

              if (updatedRecords[0]) {
                order = updatedRecords[0];
              }
            } else if (liveStatus?.status === 'canceled' || liveStatus?.status === 'failed') {
              await db
                .update(schema.orders)
                .set({
                  status: 'CANCELED',
                  failureReason: 'Dibatalkan pada sistem pembayaran',
                  updatedAt: new Date().toISOString(),
                })
                .where(eq(schema.orders.id, order.id));
              order.status = 'CANCELED';
              order.failureReason = 'Dibatalkan pada sistem pembayaran';
            } else if (liveStatus?.status === 'expired') {
              await db
                .update(schema.orders)
                .set({
                  status: 'EXPIRED',
                  failureReason: 'Batas waktu pembayaran telah kadaluarsa',
                  updatedAt: new Date().toISOString(),
                })
                .where(eq(schema.orders.id, order.id));
              order.status = 'EXPIRED';
              order.failureReason = 'Batas waktu pembayaran telah kadaluarsa';
            }
          } catch (gwErr) {
            console.warn('Gateway status polling check skipped:', (gwErr as Error).message);
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
      success: true,
      data: {
        orderNumber: order.orderNumber,
        productId: order.productId,
        productName: order.productName,
        quantity: order.quantity,
        totalAmountIdr: order.totalAmountIdr,
        status: order.status,
        licenseCodes,
        customerEmail: order.customerEmail,
        createdAt: order.createdAt,
        failureReason: order.failureReason,
        paymentDetails: payment ? {
          amountIdr: payment.amountIdr,
          qrCodeString: payment.qrCodeString,
          paymentUrl: payment.paymentUrl,
          expiresAt: payment.expiresAt,
          gatewayProvider: payment.gatewayProvider,
        } : null,
      },
    };
  } catch (err) {
    return { success: false, error: { message: (err as Error).message } };
  }
}

export async function cancelOrder(rawInput: { orderNumber: string; reason?: string }) {
  try {
    const { orderNumber, reason } = z.object({
      orderNumber: z.string().min(5),
      reason: z.string().optional(),
    }).parse(rawInput);

    const records = await db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.orderNumber, orderNumber));

    if (records.length === 0) {
      throw new Error('Pesanan tidak ditemukan.');
    }

    const order = records[0];

    if (order.status === 'COMPLETED') {
      throw new Error('Pesanan telah selesai dan lisensi aktif, tidak dapat dibatalkan.');
    }

    if (order.status === 'CANCELED') {
      return { success: true, data: { success: true, message: 'Pesanan sudah dibatalkan.', status: 'CANCELED', orderNumber } };
    }

    const currentUser = await getEffectiveUser();
    if (currentUser && order.userId && order.userId !== currentUser.id) {
      throw new Error('Anda tidak memiliki izin untuk membatalkan pesanan ini.');
    }

    const failureReason = reason?.trim() || 'Dibatalkan oleh pelanggan';

    // 1. Fetch related payment record to notify Payment Gateway
    const payments = await db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.orderId, order.id));
    const payment = payments[0];

    // 2. Notify Payment Gateway so history status in PG changes to canceled/failed instead of pending
    if (payment?.gatewayReference) {
      try {
        const gateway = getPaymentGateway();
        if ('cancelInvoice' in gateway && typeof (gateway as any).cancelInvoice === 'function') {
          await (gateway as any).cancelInvoice(
            payment.gatewayReference,
            failureReason,
            payment.paymentUrl
          );
        }
      } catch (gwErr) {
        console.warn('[cancelOrder] Gagal kirim notifikasi cancel ke PG:', (gwErr as Error).message);
      }
    }

    await db
      .update(schema.orders)
      .set({
        status: 'CANCELED',
        failureReason,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.orders.id, order.id));

    await db
      .update(schema.payments)
      .set({
        status: 'EXPIRED',
      })
      .where(eq(schema.payments.orderId, order.id));

    return {
      success: true,
      data: {
        success: true,
        orderNumber,
        status: 'CANCELED',
        message: 'Pesanan berhasil dibatalkan.',
      },
    };
  } catch (err) {
    return { success: false, error: { message: (err as Error).message } };
  }
}

export async function getLatestProductPrice(rawInput: { productId: number; quantity?: number }) {
  try {
    const { productId, quantity } = z.object({
      productId: z.number().int().positive(),
      quantity: z.number().int().min(1).default(1),
    }).parse(rawInput);

    // Sync catalog if throttle window passed to keep stock fresh
    try {
      await syncRealtimeCatalog(false);
    } catch {}

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

    const config = await getSystemConfig();
    const isPaymentEnabled = config.store.isPaymentEnabled !== false;
    const paymentDisabledReason = config.store.paymentDisabledReason || 'Sistem pembayaran sedang dinonaktifkan sementara untuk pemeliharaan/migrasi.';

    const isProductActive = product.isActive !== false;
    const hasSufficientStock = Boolean(product.inStock && (product.stock === null || product.stock >= quantity));
    let canPurchase = isProductActive && hasSufficientStock;
    let unavailableReason: string | null = null;
    let isSupplierBalanceLow = false;

    if (!isPaymentEnabled) {
      canPurchase = false;
      unavailableReason = paymentDisabledReason;
    } else if (!isProductActive) {
      canPurchase = false;
      unavailableReason = 'Produk sedang tidak aktif atau ditarik dari katalog supplier';
    } else if (!hasSufficientStock) {
      canPurchase = false;
      unavailableReason = 'Stok produk habis';
    } else {
      try {
        const balanceInfo = await insightXPro.getBalance();
        const requiredUsdt = product.basePriceUsdt * quantity;
        if (typeof balanceInfo?.balance === 'number' && balanceInfo.balance < requiredUsdt) {
          canPurchase = false;
          isSupplierBalanceLow = true;
          unavailableReason = 'Saldo kuota pengadaan produk sedang kosong (restock). Silakan hubungi Customer Service kami.';
        }
      } catch (err) {
        console.warn('Realtime balance check notice in getLatestProductPrice:', err);
      }
    }

    return {
      success: true,
      data: {
        productId: product.id,
        name: product.name,
        unitPriceIdr: effectiveUnitPrice,
        totalAmountIdr: effectiveUnitPrice * quantity,
        stock: product.stock ?? 0,
        inStock: Boolean(isProductActive && product.inStock && (product.stock === null || product.stock > 0)),
        isCustomPrice: Boolean(product.customRetailPriceIdr && product.customRetailPriceIdr > 0),
        canPurchase,
        isSupplierBalanceLow,
        unavailableReason,
        isPaymentEnabled,
        paymentDisabledReason: isPaymentEnabled ? null : paymentDisabledReason,
      },
    };
  } catch (err) {
    return { success: false, error: { message: (err as Error).message } };
  }
}

/**
 * On-demand reload of store catalog and latest pricing.
 * Replaces aggressive background polling with an explicit user/admin trigger.
 */
export async function reloadStoreCatalog() {
  try {
    const config = await getSystemConfig();
    const dynamicPricing = await getDynamicPricingConfig();

    try {
      await syncRealtimeCatalog(true);
    } catch (syncErr) {
      console.warn('[reloadStoreCatalog] Supplier sync notice:', (syncErr as Error).message);
    }

    const cached = await db.select().from(schema.productsCache);
    const products = cached
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

    return {
      success: true,
      data: {
        products,
        updatedAt: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        fxRate: dynamicPricing.usdtIdrRate,
      },
    };
  } catch (err) {
    return { success: false, error: { message: (err as Error).message } };
  }
}

export async function simulatePayment(rawInput: { orderNumber: string }) {
  try {
    const { orderNumber } = z.object({
      orderNumber: z.string().min(5),
    }).parse(rawInput);

    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
    if (!(await verifyAdminSessionToken(sessionToken))) {
      throw new Error('Fitur simulasi pembayaran dinonaktifkan di lingkungan produksi.');
    }

    const records = await db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.orderNumber, orderNumber));

    if (records.length === 0) {
      throw new Error('Pesanan tidak ditemukan');
    }

    const order = records[0];
    if (order.status === 'COMPLETED') {
      return { success: true, data: { success: true, message: 'Pesanan sudah selesai' } };
    }

    await db
      .update(schema.orders)
      .set({ status: 'FULFILLING', paidAt: new Date().toISOString() })
      .where(eq(schema.orders.id, order.id));

    try {
      const productRecord = await db
        .select()
        .from(schema.productsCache)
        .where(eq(schema.productsCache.id, order.productId));

      const supplierProductId = productRecord[0]?.supplierProductId ?? order.productId;
      const apiKey = process.env.INSIGHTXPRO_API_KEY;

      if (apiKey) {
        const supplierRes = await insightXPro.placeOrder(
          {
            product_id: supplierProductId,
            quantity: order.quantity,
          },
          order.idempotencyKey
        );

        const supplierOrderId = String(
          supplierRes.order_id ?? 
          supplierRes.order?.order_id ?? 
          supplierRes.order?.id ?? 
          supplierRes.id ?? 
          'UNKNOWN'
        );
        const rawCodes = 
          supplierRes.codes?.length ? supplierRes.codes :
          supplierRes.order?.codes?.length ? supplierRes.order.codes :
          supplierRes.order?.delivered_codes?.length ? supplierRes.order.delivered_codes :
          supplierRes.order?.coupons?.length ? supplierRes.order.coupons :
          supplierRes.delivered_codes?.length ? supplierRes.delivered_codes :
          [];
        const codes = Array.isArray(rawCodes) ? rawCodes : [rawCodes];

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
            data: {
              success: true,
              status: 'COMPLETED',
              codes,
            },
          };
        }
      }

      const sampleLinks = Array.from({ length: order.quantity }).map(() => 
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
        data: {
          success: true,
          status: 'COMPLETED',
          codes: sampleLinks,
        },
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
  } catch (err) {
    return { success: false, error: { message: (err as Error).message } };
  }
}

// -------------------------------------------------------------
// LIVE CHAT SUPPORT ACTIONS
// -------------------------------------------------------------

export async function getOrCreateBuyerChat(rawInput?: { orderNumber?: string }) {
  try {
    const orderNumber = rawInput?.orderNumber;
    const user = await getEffectiveUser();
    if (!user) {
      return {
        success: true,
        data: {
          isAuthenticated: false,
          user: null,
          conversation: null,
          messages: [],
        },
      };
    }

    let conv = await db
      .select()
      .from(schema.supportConversations)
      .where(eq(schema.supportConversations.userId, user.id))
      .limit(1)
      .then((rows) => rows[0]);

    if (!conv) {
      return {
        success: true,
        data: {
          isAuthenticated: true,
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
          },
          conversation: null,
          messages: [],
        },
      };
    }

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
      success: true,
      data: {
        isAuthenticated: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
        conversation: conv,
        messages,
      },
    };
  } catch (err) {
    return { success: false, error: { message: (err as Error).message } };
  }
}

export async function sendBuyerChatMessage(rawInput: {
  conversationId?: string;
  message: string;
  orderNumber?: string;
}) {
  try {
    const { conversationId, message, orderNumber } = z.object({
      conversationId: z.string().optional(),
      message: z.string().min(1, 'Pesan tidak boleh kosong').max(2000),
      orderNumber: z.string().optional(),
    }).parse(rawInput);

    const user = await getEffectiveUser();
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

    // Auto-reply for restock inquiries to keep buyers on page while admin checks stock
    const isRestockInquiry = /restock|re-stock|stok|kuota|ready|habis|kosong|kapan ada/i.test(trimmedMsg);
    let autoRestockReply: any = null;
    if (isRestockInquiry) {
      const restockMsgId = `msg_${Date.now() + 80}_${crypto.randomBytes(2).toString('hex')}`;
      const restockText = `Halo kak ${user.name || ''}! 👋 Permintaan info restok produk ini sudah diteruskan langsung ke ponsel Admin.\n\n⏳ Mohon tunggu 1-3 menit di halaman ini ya kak, Admin sedang mengecek kuota ke supplier server dan akan segera membalas pesan Anda di sini. Jangan tinggalkan halaman ini agar langsung terhubung saat admin membalas! 🙏`;
      const [insertedReply] = await db
        .insert(schema.supportMessages)
        .values({
          id: restockMsgId,
          conversationId: conv.id,
          senderType: 'ADMIN',
          senderName: 'Admin Pixel Store (Auto-Assist)',
          message: restockText,
          isRead: false,
          createdAt: new Date(Date.now() + 80).toISOString(),
        })
        .returning();
      autoRestockReply = insertedReply;

      await db
        .update(schema.supportConversations)
        .set({
          lastMessageText: restockText,
          lastMessageSender: 'ADMIN',
          unreadByBuyer: 1,
        })
        .where(eq(schema.supportConversations.id, conv.id));
    }

    // Non-blocking instant Telegram push notification to administrator
    const telegramMessage = isRestockInquiry
      ? `🚨 *[PERMINTAAN RESTOCK - PEMBELI SEDANG MENUNGGU DI WEB]*\n${trimmedMsg}`
      : trimmedMsg;

    sendTelegramNotification({
      conversationId: conv.id,
      buyerName: user.name,
      buyerEmail: user.email,
      orderNumber: conv.orderNumber || detectedOrderNum || null,
      message: telegramMessage,
    }).catch((teleErr) => {
      console.warn('[Telegram] Background notification dispatch error:', teleErr);
    });

    return {
      success: true,
      data: {
        success: true,
        conversation: conv,
        message: newMsg,
        autoReply: autoRestockReply,
        isRestockInquiry,
      },
    };
  } catch (err) {
    return { success: false, error: { message: (err as Error).message } };
  }
}

export async function getBuyerChatMessages(rawInput: { conversationId: string }) {
  try {
    const { conversationId } = z.object({
      conversationId: z.string().min(1),
    }).parse(rawInput);

    const user = await getEffectiveUser();
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
      success: true,
      data: {
        conversation: conv,
        messages,
      },
    };
  } catch (err) {
    return { success: false, error: { message: (err as Error).message } };
  }
}

// -------------------------------------------------------------
// ADMIN ACTIONS
// -------------------------------------------------------------

export async function adminLogin(rawInput: { 
  email?: string; 
  password?: string; 
  pin?: string; 
}) {
  try {
    const input = z.object({
      email: z.string().email('Format email tidak valid').optional(),
      password: z.string().min(1, 'Kata sandi tidak boleh kosong').optional(),
      pin: z.string().optional(),
    }).parse(rawInput);

    // 1. Better Auth Email & Password Login
    if (input.email && input.password) {
      let neonUser: any = null;
      try {
        const neonRes = await neonAuth.signIn.email({
          email: input.email,
          password: input.password,
        });
        if (neonRes?.data?.user) {
          neonUser = neonRes.data.user;
        } else if (neonRes?.error) {
          const msg = neonRes.error.message || '';
          if (!msg.includes('fetch failed') && !msg.includes('ENOTFOUND')) {
            console.warn('[NeonAuth Admin] Sign-in notice:', msg);
          }
        }
      } catch (err) {
        console.warn('[NeonAuth Admin] Upstream sign-in notice:', (err as Error).message);
      }

      // Check local database for role & credentials
      let localUser: any = null;
      const [existing] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, input.email))
        .limit(1);

      if (existing) {
        localUser = existing;
      }

      const isAdminInNeon = neonUser?.role === 'admin';
      const isAdminInLocal = localUser?.role === 'admin';

      if (!isAdminInNeon && !isAdminInLocal) {
        // If PIN is provided as authorization bootstrap, promote user
        if (input.pin && verifyAdminPin(input.pin)) {
          if (localUser) {
            await db.update(schema.users).set({ role: 'admin' }).where(eq(schema.users.id, localUser.id));
            localUser.role = 'admin';
          }
        } else {
          throw new Error(`Akses Ditolak: Akun '${input.email}' tidak memiliki izin Administrator. Hubungi Super Admin untuk penugasan role.`);
        }
      }

      const activeUser = localUser || neonUser || { id: 'admin', name: 'Administrator', email: input.email, role: 'admin' };
      const token = createAdminSessionToken({ id: activeUser.id, email: activeUser.email });
      const cookieStore = await cookies();
      cookieStore.set(ADMIN_COOKIE_NAME, token, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60,
        secure: process.env.NODE_ENV === 'production',
      });

      return {
        success: true,
        data: {
          user: {
            id: activeUser.id,
            name: activeUser.name,
            email: activeUser.email,
            role: 'admin',
          },
        },
      };
    }

    // 2. Master PIN Emergency Authentication
    if (input.pin) {
      if (!verifyAdminPin(input.pin)) {
        throw new Error('PIN Akses Admin tidak valid. Silakan periksa kembali.');
      }
      const token = createAdminSessionToken({ id: 'admin', email: 'admin@pixelstore.id' });
      const cookieStore = await cookies();
      cookieStore.set(ADMIN_COOKIE_NAME, token, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60,
        secure: process.env.NODE_ENV === 'production',
      });
      return {
        success: true,
        data: {
          user: {
            id: 'admin',
            name: 'Master Admin',
            email: 'admin@pixelstore.id',
            role: 'admin',
          },
        },
      };
    }

    throw new Error('Harap masukkan Email & Kata Sandi Administrator.');
  } catch (err) {
    return { success: false, error: { message: (err as Error).message } };
  }
}

export async function adminRegister(rawInput: {
  name: string;
  email: string;
  password: string;
  adminKey: string;
}) {
  try {
    const input = z.object({
      name: z.string().min(2, 'Nama minimal 2 karakter').max(100),
      email: z.string().email('Format email tidak valid'),
      password: z.string().min(6, 'Kata sandi minimal 6 karakter'),
      adminKey: z.string().min(1, 'Kunci Otorisasi Toko (Master PIN) wajib diisi'),
    }).parse(rawInput);

    if (!verifyAdminPin(input.adminKey)) {
      throw new Error('Kunci Otorisasi Toko tidak valid! Anda memerlukan Master PIN Toko untuk mendaftarkan akun admin.');
    }

    let neonUserId: string | undefined;
    // 1. Better Auth registration
    try {
      const neonRes = await neonAuth.signUp.email({
        email: input.email,
        name: input.name,
        password: input.password,
      });
      if (neonRes?.data?.user) {
        neonUserId = neonRes.data.user.id;
        try {
          await (neonAuth as any).admin?.setRole?.({ userId: neonUserId, role: 'admin' });
        } catch {}
      } else if (neonRes?.error) {
        const msg = neonRes.error.message || '';
        if (!msg.includes('fetch failed') && !msg.includes('ENOTFOUND')) {
          throw new Error(msg);
        }
      }
    } catch (neonErr) {
      const errMsg = (neonErr as Error).message || '';
      if (!errMsg.includes('fetch failed') && !errMsg.includes('ENOTFOUND')) {
        throw neonErr;
      }
    }

    // 2. Synchronize to local database with role: 'admin'
    let user = await createUserAccount({
      id: neonUserId,
      name: input.name,
      email: input.email,
      password: input.password,
      role: 'admin',
    });

    if (user.role !== 'admin') {
      await db.update(schema.users).set({ role: 'admin' }).where(eq(schema.users.id, user.id));
      user.role = 'admin';
    }

    // 3. Issue admin session
    const token = createAdminSessionToken({ id: user.id, email: user.email });
    const cookieStore = await cookies();
    cookieStore.set(ADMIN_COOKIE_NAME, token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      secure: process.env.NODE_ENV === 'production',
    });

    return {
      success: true,
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: 'admin',
        },
      },
    };
  } catch (err) {
    return { success: false, error: { message: (err as Error).message } };
  }
}

export async function adminSetUserRole(rawInput: {
  userId: string;
  role: 'customer' | 'admin';
}) {
  try {
    const adminSession = await getAdminSession();
    if (!adminSession.isAuthenticated) {
      throw new Error('Akses ditolak: Anda tidak memiliki sesi administrator aktif.');
    }

    const { userId, role } = z.object({
      userId: z.string().min(1),
      role: z.enum(['customer', 'admin']),
    }).parse(rawInput);

    const betterAuthRole = role === 'admin' ? 'admin' : 'user';

    // 1. Update in local public.users
    await db.update(schema.users).set({ role }).where(eq(schema.users.id, userId));

    // 2. Direct synchronized update in neon_auth.user
    try {
      await (sqlClient as any)`
        UPDATE neon_auth.user 
        SET role = ${betterAuthRole}, "updatedAt" = CURRENT_TIMESTAMP
        WHERE id::text = ${userId} OR email = (SELECT email FROM public.users WHERE id = ${userId} LIMIT 1);
      `;
    } catch (err) {
      console.warn('[NeonAuth Admin SQL] Failed to update neon_auth.user role:', (err as Error).message);
    }

    // 3. Update also via Better Auth server helper if supported
    try {
      await (neonAuth as any).admin?.setRole?.({ userId, role: betterAuthRole });
    } catch (err) {
      // Non-blocking notice
    }

    return { success: true, data: { userId, role } };
  } catch (err) {
    return { success: false, error: { message: (err as Error).message } };
  }
}

export async function adminLogout() {
  try {
    try {
      await neonAuth.signOut();
    } catch {}

    const cookieStore = await cookies();
    cookieStore.delete(ADMIN_COOKIE_NAME);
    return { success: true, data: { success: true } };
  } catch (err) {
    return { success: false, error: { message: (err as Error).message } };
  }
}

export async function checkAdminAuth() {
  try {
    const adminSession = await getAdminSession();
    return { success: true, data: { isAuthenticated: adminSession.isAuthenticated, user: adminSession.user || null } };
  } catch (err) {
    return { success: false, error: { message: (err as Error).message } };
  }
}

export async function getAdminSettings() {
  try {
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
      success: true,
      data: {
        config,
        liveFx,
        supplier: {
          balanceUsdt: supplierBalance,
          status: supplierStatus,
          syncedProductCount: products.length,
        },
      },
    };
  } catch (err) {
    return { success: false, error: { message: (err as Error).message } };
  }
}

export async function updatePricingSettings(rawInput: {
  fxBufferPercent?: number;
  marginPercent: number;
  gatewayFeePercent?: number;
  supplierNetworkFeeUsdt?: number;
  fixedFeeIdr?: number;
}) {
  try {
    const input = z.object({
      fxBufferPercent: z.number().min(0).max(10).default(0.5),
      marginPercent: z.number().min(0).max(100),
      gatewayFeePercent: z.number().min(0).max(20).default(0),
      supplierNetworkFeeUsdt: z.number().min(0).max(10).default(0),
      fixedFeeIdr: z.number().int().min(0).max(50000).optional().default(0),
    }).parse(rawInput);

    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
    if (!(await verifyAdminSessionToken(sessionToken))) {
      throw new Error('Akses ditolak: Silakan masuk ke panel admin terlebih dahulu.');
    }

    await updateSystemSection('pricing', {
      ...input,
      autoFxRate: true,
    });
    const dynamicPricing = await getDynamicPricingConfig();

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

    return { success: true, data: { success: true, updatedPricing: dynamicPricing } };
  } catch (err) {
    return { success: false, error: { message: (err as Error).message } };
  }
}

/**
 * Fetches all logged store operational expenses (gas fees, bank withdrawals, other costs)
 */
export async function adminGetExpenses() {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
    if (!(await verifyAdminSessionToken(sessionToken))) {
      throw new Error('Akses ditolak: Silakan masuk ke panel admin terlebih dahulu.');
    }

    const expensesList = await db
      .select()
      .from(schema.storeExpenses)
      .orderBy(desc(schema.storeExpenses.expenseDate), desc(schema.storeExpenses.createdAt));

    return { success: true, data: { expenses: expensesList } };
  } catch (err) {
    return { success: false, error: { message: (err as Error).message } };
  }
}

/**
 * Creates a new store operational expense record
 */
export async function adminCreateExpense(rawInput: {
  expenseDate: string;
  category: 'SUPPLIER_GAS_FEE' | 'BANK_WITHDRAWAL' | 'OPERATIONAL' | 'OTHER';
  title: string;
  amountIdr: number;
  amountUsdt?: number | null;
  notes?: string | null;
}) {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
    if (!(await verifyAdminSessionToken(sessionToken))) {
      throw new Error('Akses ditolak: Silakan masuk ke panel admin terlebih dahulu.');
    }

    const input = z.object({
      expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD'),
      category: z.enum(['SUPPLIER_GAS_FEE', 'BANK_WITHDRAWAL', 'OPERATIONAL', 'OTHER']),
      title: z.string().min(1, 'Judul pengeluaran wajib diisi').max(200),
      amountIdr: z.number().int().min(0, 'Nominal IDR harus 0 atau lebih'),
      amountUsdt: z.number().min(0).nullable().optional(),
      notes: z.string().nullable().optional(),
    }).parse(rawInput);

    const expenseId = `exp_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const nowIso = new Date().toISOString();

    const [newExpense] = await db
      .insert(schema.storeExpenses)
      .values({
        id: expenseId,
        expenseDate: input.expenseDate,
        category: input.category,
        title: input.title.trim(),
        amountIdr: input.amountIdr,
        amountUsdt: input.amountUsdt ?? null,
        notes: input.notes?.trim() || null,
        createdAt: nowIso,
        updatedAt: nowIso,
      })
      .returning();

    return { success: true, data: { expense: newExpense } };
  } catch (err) {
    return { success: false, error: { message: (err as Error).message } };
  }
}

/**
 * Deletes an existing store expense record
 */
export async function adminDeleteExpense(rawInput: { id: string }) {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
    if (!(await verifyAdminSessionToken(sessionToken))) {
      throw new Error('Akses ditolak: Silakan masuk ke panel admin terlebih dahulu.');
    }

    const { id } = z.object({
      id: z.string().min(1),
    }).parse(rawInput);

    await db.delete(schema.storeExpenses).where(eq(schema.storeExpenses.id, id));

    return { success: true, data: { success: true, id } };
  } catch (err) {
    return { success: false, error: { message: (err as Error).message } };
  }
}

export async function adminUpdateProductPrice(rawInput: {
  productId: number;
  customPriceIdr?: number | null;
}) {
  try {
    const { productId, customPriceIdr } = z.object({
      productId: z.number().int(),
      customPriceIdr: z.number().int().nullable().optional(),
    }).parse(rawInput);

    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
    if (!(await verifyAdminSessionToken(sessionToken))) {
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
      data: {
        success: true,
        productId,
        customRetailPriceIdr: newCustomPrice,
        retailPriceIdr: effectiveRetailPrice,
      },
    };
  } catch (err) {
    return { success: false, error: { message: (err as Error).message } };
  }
}

export async function syncCatalogNow() {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
    if (!(await verifyAdminSessionToken(sessionToken))) {
      throw new Error('Akses ditolak: Silakan masuk ke panel admin terlebih dahulu.');
    }

    const result = await syncRealtimeCatalog(true);
    return { success: true, data: { success: true, count: result.count } };
  } catch (err) {
    return { success: false, error: { message: (err as Error).message } };
  }
}

export async function adminToggleProductStatus(rawInput: { productId: number; isActive: boolean }) {
  try {
    const { productId, isActive } = z.object({
      productId: z.number().int(),
      isActive: z.boolean(),
    }).parse(rawInput);

    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
    if (!(await verifyAdminSessionToken(sessionToken))) {
      throw new Error('Akses ditolak: Silakan masuk ke panel admin terlebih dahulu.');
    }
    await db
      .update(schema.productsCache)
      .set({ isActive })
      .where(eq(schema.productsCache.id, productId));
    return { success: true, data: { success: true, isActive } };
  } catch (err) {
    return { success: false, error: { message: (err as Error).message } };
  }
}

export async function adminToggleTopProduct(rawInput: { productId: number; isTopProduct: boolean }) {
  try {
    const { productId, isTopProduct } = z.object({
      productId: z.number().int(),
      isTopProduct: z.boolean(),
    }).parse(rawInput);

    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
    if (!(await verifyAdminSessionToken(sessionToken))) {
      throw new Error('Akses ditolak: Silakan masuk ke panel admin terlebih dahulu.');
    }
    await db
      .update(schema.productsCache)
      .set({ isTopProduct })
      .where(eq(schema.productsCache.id, productId));
    return { success: true, data: { success: true, isTopProduct } };
  } catch (err) {
    return { success: false, error: { message: (err as Error).message } };
  }
}

export async function adminRetryOrderFulfillment(rawInput: { orderId: string }) {
  try {
    const { orderId } = z.object({
      orderId: z.string().min(1),
    }).parse(rawInput);

    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
    if (!(await verifyAdminSessionToken(sessionToken))) {
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

        const supplierOrderId = String(
          supplierRes.order_id ?? 
          supplierRes.order?.order_id ?? 
          supplierRes.order?.id ?? 
          supplierRes.id ?? 
          'UNKNOWN'
        );
        const rawCodes = 
          supplierRes.codes?.length ? supplierRes.codes :
          supplierRes.order?.codes?.length ? supplierRes.order.codes :
          supplierRes.order?.delivered_codes?.length ? supplierRes.order.delivered_codes :
          supplierRes.order?.coupons?.length ? supplierRes.order.coupons :
          supplierRes.delivered_codes?.length ? supplierRes.delivered_codes :
          [];
        const codes = Array.isArray(rawCodes) ? rawCodes : [rawCodes];

        if (codes.length > 0) {
          await db
            .update(schema.orders)
            .set({
              status: 'COMPLETED',
              supplierOrderId,
              licenseCodes: JSON.stringify(codes),
              failureReason: null,
              fulfilledAt: new Date().toISOString(),
            })
            .where(eq(schema.orders.id, order.id));

          return { success: true, data: { success: true, codes } };
        }
      }
    } catch (err) {
      throw new Error(`Upstream supplier gagal: ${(err as Error).message}`);
    }

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

    return { success: true, data: { success: true, codes: sampleLinks } };
  } catch (err) {
    return { success: false, error: { message: (err as Error).message } };
  }
}

export async function adminMarkOrderRefunded(rawInput: { orderId: string; reason?: string }) {
  try {
    const { orderId, reason } = z.object({
      orderId: z.string().min(1),
      reason: z.string().optional(),
    }).parse(rawInput);

    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
    if (!(await verifyAdminSessionToken(sessionToken))) {
      throw new Error('Akses ditolak: Silakan masuk ke panel admin terlebih dahulu.');
    }
    await db
      .update(schema.orders)
      .set({
        status: 'REFUNDED',
        failureReason: reason ? `Refund: ${reason}` : 'Pesanan telah direfund oleh admin.',
      })
      .where(eq(schema.orders.id, orderId));
    return { success: true, data: { success: true } };
  } catch (err) {
    return { success: false, error: { message: (err as Error).message } };
  }
}

export async function adminCancelOrder(rawInput: { orderId: string; reason?: string }) {
  try {
    const { orderId, reason } = z.object({
      orderId: z.string().min(1),
      reason: z.string().optional(),
    }).parse(rawInput);

    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
    if (!(await verifyAdminSessionToken(sessionToken))) {
      throw new Error('Akses ditolak: Silakan masuk ke panel admin terlebih dahulu.');
    }
    await db
      .update(schema.orders)
      .set({
        status: 'CANCELED',
        failureReason: reason ? `Dibatalkan: ${reason}` : 'Pesanan dibatalkan oleh Admin.',
      })
      .where(eq(schema.orders.id, orderId));
    return { success: true, data: { success: true } };
  } catch (err) {
    return { success: false, error: { message: (err as Error).message } };
  }
}

export async function adminUpdateStoreSettings(rawInput: any) {
  try {
    const input = z.object({
      storeName: z.string().min(1),
      storeTagline: z.string().min(1),
      supportWhatsapp: z.string().min(1),
      announcement: z.string().default(''),
      isStoreOpen: z.boolean().default(true),
      qrisNmid: z.string().default('ID1020021303845'),
      isPaymentEnabled: z.boolean().default(true),
      paymentDisabledReason: z.string().optional(),
      expiryMinutes: z.number().int().min(5).max(120).default(15),
      maxQuantityPerOrder: z.number().int().min(1).max(20).default(5),
    }).parse(rawInput);

    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
    if (!(await verifyAdminSessionToken(sessionToken))) {
      throw new Error('Akses ditolak: Silakan masuk ke panel admin terlebih dahulu.');
    }
    await updateSystemSection('store', {
      storeName: input.storeName,
      storeTagline: input.storeTagline,
      supportWhatsapp: input.supportWhatsapp,
      announcement: input.announcement,
      isStoreOpen: input.isStoreOpen,
      qrisNmid: input.qrisNmid,
      isPaymentEnabled: input.isPaymentEnabled,
      paymentDisabledReason: input.paymentDisabledReason,
    });
    await updateSystemSection('orders', {
      expiryMinutes: input.expiryMinutes,
      maxQuantityPerOrder: input.maxQuantityPerOrder,
    });
    return { success: true, data: { success: true } };
  } catch (err) {
    return { success: false, error: { message: (err as Error).message } };
  }
}

export async function adminTogglePaymentStatus(rawInput: {
  isPaymentEnabled: boolean;
  paymentDisabledReason?: string;
}) {
  try {
    const { isPaymentEnabled, paymentDisabledReason } = z.object({
      isPaymentEnabled: z.boolean(),
      paymentDisabledReason: z.string().optional(),
    }).parse(rawInput);

    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
    if (!(await verifyAdminSessionToken(sessionToken))) {
      throw new Error('Akses ditolak: Silakan masuk ke panel admin terlebih dahulu.');
    }
    const currentStore = (await getSystemConfig(true)).store;
    await updateSystemSection('store', {
      isPaymentEnabled,
      paymentDisabledReason: paymentDisabledReason ?? currentStore.paymentDisabledReason,
    });
    return { success: true, data: { success: true, isPaymentEnabled } };
  } catch (err) {
    return { success: false, error: { message: (err as Error).message } };
  }
}

export async function adminUpdatePin(rawInput: { currentPin: string; newPin: string }) {
  try {
    const { currentPin, newPin } = z.object({
      currentPin: z.string().min(1),
      newPin: z.string().min(4, 'PIN baru minimal 4 karakter'),
    }).parse(rawInput);

    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
    if (!(await verifyAdminSessionToken(sessionToken))) {
      throw new Error('Akses ditolak: Silakan masuk ke panel admin terlebih dahulu.');
    }
    if (!verifyAdminPin(currentPin)) {
      throw new Error('PIN saat ini tidak valid.');
    }
    process.env.ADMIN_SECRET_PIN = newPin.trim();
    return { success: true, data: { success: true } };
  } catch (err) {
    return { success: false, error: { message: (err as Error).message } };
  }
}

export async function adminGetChatConversations(rawInput?: { status?: 'ALL' | 'OPEN' | 'RESOLVED' }) {
  try {
    const status = rawInput?.status || 'ALL';
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
    if (!(await verifyAdminSessionToken(sessionToken))) {
      throw new Error('Akses ditolak: Silakan masuk ke panel admin.');
    }

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

    let query = db.select().from(schema.supportConversations);
    if (status === 'RESOLVED') {
      query = query.where(eq(schema.supportConversations.status, 'RESOLVED')) as any;
    } else {
      query = query.where(eq(schema.supportConversations.status, 'OPEN')) as any;
    }

    const conversations = await query.orderBy(desc(schema.supportConversations.lastMessageAt));

    return {
      success: true,
      data: {
        conversations,
        totalUnread,
        openCount,
        resolvedCount,
      },
    };
  } catch (err) {
    return { success: false, error: { message: (err as Error).message } };
  }
}

export async function adminSearchUsersForChat(rawInput: { query: string }) {
  try {
    const { query } = z.object({ query: z.string().min(1) }).parse(rawInput);
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
    if (!(await verifyAdminSessionToken(sessionToken))) {
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

    return { success: true, data: { users: filtered } };
  } catch (err) {
    return { success: false, error: { message: (err as Error).message } };
  }
}

export async function adminOpenUserChat(rawInput: { userId: string }) {
  try {
    const { userId } = z.object({ userId: z.string().min(1) }).parse(rawInput);
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
    if (!(await verifyAdminSessionToken(sessionToken))) {
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

    return { success: true, data: { conversation: conv, messages } };
  } catch (err) {
    return { success: false, error: { message: (err as Error).message } };
  }
}

export async function adminGetChatMessages(rawInput: { conversationId: string }) {
  try {
    const { conversationId } = z.object({ conversationId: z.string().min(1) }).parse(rawInput);
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
    if (!(await verifyAdminSessionToken(sessionToken))) {
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
      success: true,
      data: {
        conversation: conv,
        messages,
      },
    };
  } catch (err) {
    return { success: false, error: { message: (err as Error).message } };
  }
}

export async function adminSendChatMessage(rawInput: {
  conversationId: string;
  message: string;
  adminName?: string;
}) {
  try {
    const { conversationId, message, adminName } = z.object({
      conversationId: z.string().min(1),
      message: z.string().min(1, 'Pesan tidak boleh kosong').max(2000),
      adminName: z.string().default('Admin CS Pixel Store'),
    }).parse(rawInput);

    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
    if (!(await verifyAdminSessionToken(sessionToken))) {
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

    return { success: true, data: { success: true, message: newMsg } };
  } catch (err) {
    return { success: false, error: { message: (err as Error).message } };
  }
}

export async function adminUpdateChatStatus(rawInput: {
  conversationId: string;
  status: 'OPEN' | 'RESOLVED';
}) {
  try {
    const { conversationId, status } = z.object({
      conversationId: z.string().min(1),
      status: z.enum(['OPEN', 'RESOLVED']),
    }).parse(rawInput);

    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
    if (!(await verifyAdminSessionToken(sessionToken))) {
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

    return { success: true, data: { success: true } };
  } catch (err) {
    return { success: false, error: { message: (err as Error).message } };
  }
}

export async function adminDeleteChatConversation(rawInput: { conversationId: string }) {
  try {
    const { conversationId } = z.object({
      conversationId: z.string().min(1),
    }).parse(rawInput);

    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
    if (!(await verifyAdminSessionToken(sessionToken))) {
      throw new Error('Akses ditolak: Silakan masuk ke panel admin.');
    }

    await db
      .delete(schema.supportMessages)
      .where(eq(schema.supportMessages.conversationId, conversationId));

    await db
      .delete(schema.supportConversations)
      .where(eq(schema.supportConversations.id, conversationId));

    return { success: true, data: { success: true } };
  } catch (err) {
    return { success: false, error: { message: (err as Error).message } };
  }
}

export async function adminTestSmtpConnection(rawInput?: { testEmail?: string }) {
  try {
    const testEmail = rawInput?.testEmail;
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
    if (!(await verifyAdminSessionToken(sessionToken))) {
      throw new Error('Akses ditolak: Silakan masuk ke panel admin.');
    }

    const verifyRes = await verifySmtpConnection();
    if (!verifyRes.success) {
      throw new Error(verifyRes.message);
    }

    if (testEmail) {
      const sendRes = await sendTestEmail(testEmail);
      if (!sendRes.success) {
        throw new Error(`Koneksi SMTP berhasil, namun gagal mengirim email tes: ${sendRes.error}`);
      }
      return {
        success: true,
        data: {
          success: true,
          message: `Koneksi SMTP terverifikasi dan email uji coba berhasil dikirim ke ${testEmail}!`,
        },
      };
    }

    return {
      success: true,
      data: {
        success: true,
        message: 'Koneksi ke server SMTP (smtp.sumopod.com:465 SSL) berhasil dan siap digunakan!',
      },
    };
  } catch (err) {
    return { success: false, error: { message: (err as Error).message } };
  }
}

export async function adminResendOrderEmail(rawInput: {
  orderId: string;
  targetEmail?: string;
}) {
  try {
    const { orderId, targetEmail } = z.object({
      orderId: z.string().min(1),
      targetEmail: z.string().email('Format email tidak valid').optional(),
    }).parse(rawInput);

    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
    if (!(await verifyAdminSessionToken(sessionToken))) {
      throw new Error('Akses ditolak: Silakan masuk ke panel admin.');
    }

    const ordersFound = await db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.id, orderId));

    if (ordersFound.length === 0) {
      throw new Error('Pesanan tidak ditemukan.');
    }

    const order = ordersFound[0];
    if (order.status !== 'COMPLETED') {
      throw new Error('Hanya pesanan yang sudah COMPLETED (selesai) yang dapat dikirimi email lisensi.');
    }

    let codes: string[] = [];
    try {
      codes = order.licenseCodes ? JSON.parse(order.licenseCodes) : [];
    } catch {
      codes = [];
    }

    if (codes.length === 0) {
      throw new Error('Tidak ada kode lisensi yang tersimpan pada pesanan ini.');
    }

    const recipient = targetEmail || order.customerEmail;
    if (!recipient || !recipient.includes('@')) {
      throw new Error('Alamat email tujuan tidak valid.');
    }

    const productRecord = await db
      .select()
      .from(schema.productsCache)
      .where(eq(schema.productsCache.id, order.productId));

    const sendRes = await sendOrderFulfillmentEmail({
      orderNumber: order.orderNumber,
      customerEmail: recipient,
      productName: productRecord[0]?.name || 'Lisensi Digital',
      quantity: order.quantity,
      totalIdr: order.totalAmountIdr,
      licenseCodes: codes,
    });

    if (!sendRes.success) {
      throw new Error(`Gagal mengirim email: ${sendRes.error}`);
    }

    return {
      success: true,
      data: {
        success: true,
        message: `Email lisensi berhasil dikirim ulang ke ${recipient}!`,
      },
    };
  } catch (err) {
    return { success: false, error: { message: (err as Error).message } };
  }
}

// -------------------------------------------------------------
// BACKWARD COMPATIBILITY FUNCTION EXPORTS
// -------------------------------------------------------------

export async function createCheckoutOrder(input: Parameters<typeof checkout>[0]) {
  return checkout(input);
}

// -------------------------------------------------------------
// TELEGRAM CUSTOMER SERVICE BOT ADMIN ACTIONS
// -------------------------------------------------------------

export async function adminTestTelegramBot() {
  try {
    if (!(await verifyAdminSessionToken())) {
      throw new Error('Akses ditolak: Silakan masuk ke panel admin.');
    }

    const config = getTelegramConfig();
    if (!config) {
      throw new Error('Konfigurasi TELEGRAM_BOT_TOKEN atau TELEGRAM_ADMIN_CHAT_ID belum disetel di .env');
    }

    const testMsg = [
      '🤖 *Uji Koneksi Bot Customer Service Pixel Store*',
      '━━━━━━━━━━━━━━━━━━━━━',
      'Koneksi bot Telegram ke server Pixel Store berhasil terhubung 100%!',
      `Waktu Server: \`${new Date().toLocaleString('id-ID')}\``,
      '',
      'Setiap ada pesan baru dari pelanggan di `/support`, notifikasi akan otomatis dikirimkan ke chat ini.',
    ].join('\n');

    const success = await sendTelegramMessage(config.adminChatId, testMsg);
    if (!success) {
      throw new Error('Gagal mengirim pesan uji ke Telegram. Pastikan Anda telah menekan tombol "Start" (/start) di obrolan bot @pixelxassistant_bot.');
    }

    return {
      success: true,
      data: {
        success: true,
        message: 'Pesan uji berhasil dikirim ke akun Telegram Anda!',
      },
    };
  } catch (err) {
    return { success: false, error: { message: (err as Error).message } };
  }
}

export async function adminSetTelegramWebhook(rawInput?: { webhookUrl?: string }) {
  try {
    if (!(await verifyAdminSessionToken())) {
      throw new Error('Akses ditolak: Silakan masuk ke panel admin.');
    }

    const config = getTelegramConfig();
    if (!config) {
      throw new Error('Konfigurasi TELEGRAM_BOT_TOKEN belum disetel di .env');
    }

    const targetUrl = rawInput?.webhookUrl || `${process.env.APP_URL || 'https://pixelstore.oktaa.my.id'}/api/webhooks/telegram`;
    const res = await setTelegramWebhook(targetUrl, config.webhookSecret);

    if (!res.ok) {
      throw new Error(`Telegram setWebhook gagal: ${res.description}`);
    }

    return {
      success: true,
      data: {
        success: true,
        url: targetUrl,
        message: `Webhook Telegram berhasil didaftarkan ke: ${targetUrl}`,
      },
    };
  } catch (err) {
    return { success: false, error: { message: (err as Error).message } };
  }
}

// -------------------------------------------------------------
// MANUAL TRANSACTION & PAYMENT CREATION (ZERO SUPPLIER DEDUCTION)
// -------------------------------------------------------------

export async function adminCreateManualOrder(rawInput: {
  productId?: number;
  productName: string;
  quantity?: number;
  totalAmountIdr: number;
  customerEmail: string;
  customerWhatsapp?: string;
  status?: 'COMPLETED' | 'PENDING_PAYMENT';
  generateQris?: boolean;
  licenseCodes?: string[];
  sendEmailNotification?: boolean;
  notes?: string;
}) {
  try {
    if (!(await verifyAdminSessionToken())) {
      throw new Error('Akses ditolak: Silakan masuk ke panel admin.');
    }

    const {
      productId,
      productName,
      quantity,
      totalAmountIdr,
      customerEmail,
      customerWhatsapp,
      status,
      generateQris,
      licenseCodes,
      sendEmailNotification,
      notes,
    } = z.object({
      productId: z.number().int().optional(),
      productName: z.string().min(1, 'Nama produk wajib diisi'),
      quantity: z.number().int().min(1).default(1),
      totalAmountIdr: z.number().int().min(0, 'Total nominal tidak boleh negatif'),
      customerEmail: z.string().email('Format email pelanggan tidak valid'),
      customerWhatsapp: z.string().optional(),
      status: z.enum(['COMPLETED', 'PENDING_PAYMENT']).default('COMPLETED'),
      generateQris: z.boolean().default(false),
      licenseCodes: z.array(z.string()).default([]),
      sendEmailNotification: z.boolean().default(true),
      notes: z.string().optional(),
    }).parse(rawInput);

    // 1. Resolve product record in database
    let matchedProduct = null;
    if (productId) {
      matchedProduct = await db
        .select()
        .from(schema.productsCache)
        .where(eq(schema.productsCache.id, productId))
        .limit(1)
        .then((rows) => rows[0]);
    }

    if (!matchedProduct) {
      // Fallback to first available cached product to satisfy foreign key constraint
      matchedProduct = await db
        .select()
        .from(schema.productsCache)
        .limit(1)
        .then((rows) => rows[0]);
    }

    if (!matchedProduct) {
      throw new Error('Katalog produk di database masih kosong. Harap sinkronkan katalog terlebih dahulu.');
    }

    // 2. Resolve registered customer account if matching email exists
    const cleanEmail = customerEmail.trim().toLowerCase();
    const matchedUser = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, cleanEmail))
      .limit(1)
      .then((rows) => rows[0]);

    // 3. Generate unique manual order number
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
    const orderNumber = `PIXEL-MAN-${dateStr}-${randomHex}`;

    const orderId = `order_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const idempotencyKey = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    const cleanCodes = licenseCodes
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    // 4. Generate QRIS if requested by admin
    let qrisInvoiceResult: any = null;
    let qrCodeDataUrl: string | null = null;
    let effectiveFinalAmountIdr = totalAmountIdr;

    if (generateQris) {
      if (totalAmountIdr < 1000) {
        throw new Error('Nominal transaksi untuk pembuatan tagihan QRIS minimal Rp 1.000');
      }

      const paymentGateway = getPaymentGateway();
      qrisInvoiceResult = await paymentGateway.createQRISInvoice({
        orderNumber,
        amountIdr: totalAmountIdr,
        customerEmail: cleanEmail,
        customerWhatsapp: customerWhatsapp?.trim() || '08123456789',
        productName: `${productName.trim()} (x${quantity})`,
        expiryMinutes: 60,
      });

      if (typeof qrisInvoiceResult.amountIdr === 'number' && qrisInvoiceResult.amountIdr > 0) {
        effectiveFinalAmountIdr = qrisInvoiceResult.amountIdr;
      }

      qrCodeDataUrl = qrisInvoiceResult.qrCodeDataUrl || null;
      if (!qrCodeDataUrl && qrisInvoiceResult.qrCodeImageUrl) {
        try {
          const imgRes = await fetch(qrisInvoiceResult.qrCodeImageUrl, { signal: AbortSignal.timeout(3500) });
          if (imgRes.ok) {
            const contentType = imgRes.headers.get('content-type') || 'image/png';
            const buf = Buffer.from(await imgRes.arrayBuffer());
            qrCodeDataUrl = `data:${contentType};base64,${buf.toString('base64')}`;
          }
        } catch {}
      }

      if (!qrCodeDataUrl && (qrisInvoiceResult.qrCodeString || qrisInvoiceResult.paymentUrl)) {
        try {
          qrCodeDataUrl = await QRCode.toDataURL(qrisInvoiceResult.qrCodeString || qrisInvoiceResult.paymentUrl, {
            width: 320,
            margin: 1,
            errorCorrectionLevel: 'M',
          });
        } catch {}
      }
    }

    const effectiveOrderStatus = generateQris ? 'PENDING_PAYMENT' : status;
    const isCompletedNow = !generateQris && status === 'COMPLETED';

    // 5. Insert into orders table (NO supplier balance deduction, NO stock decrement)
    const [newOrder] = await db.insert(schema.orders).values({
      id: orderId,
      orderNumber,
      userId: matchedUser?.id || null,
      customerEmail: cleanEmail,
      customerWhatsapp: customerWhatsapp?.trim() || '-',
      productId: matchedProduct.id,
      productName: productName.trim(),
      quantity,
      basePriceUsdt: matchedProduct.basePriceUsdt || 0,
      exchangeRateIdr: 17500,
      marginPercent: 0,
      totalAmountIdr: effectiveFinalAmountIdr,
      status: effectiveOrderStatus,
      idempotencyKey,
      supplierOrderId: generateQris ? 'MANUAL_QRIS_ORDER' : 'MANUAL_TRANSACTION',
      licenseCodes: cleanCodes.length > 0 ? JSON.stringify(cleanCodes) : null,
      failureReason: notes ? `Transaksi Manual: ${notes.trim()}` : 'Dibuat secara manual oleh Admin',
      paidAt: isCompletedNow ? nowIso : null,
      fulfilledAt: isCompletedNow ? nowIso : null,
      createdAt: nowIso,
      updatedAt: nowIso,
    }).returning();

    // 6. Insert corresponding payment invoice
    const paymentId = `pay_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    await db.insert(schema.payments).values({
      id: paymentId,
      orderId: newOrder.id,
      gatewayProvider: generateQris ? (qrisInvoiceResult?.gatewayProvider || 'sumopod') : 'MANUAL',
      gatewayReference: generateQris ? (qrisInvoiceResult?.gatewayReference || `MANUAL-${orderNumber}`) : `MANUAL-${orderNumber}`,
      paymentMethod: generateQris ? 'QRIS' : 'MANUAL_DIRECT',
      qrCodeString: generateQris ? (qrisInvoiceResult?.qrCodeString || null) : null,
      paymentUrl: generateQris ? (qrisInvoiceResult?.paymentUrl || null) : null,
      amountIdr: effectiveFinalAmountIdr,
      status: isCompletedNow ? 'PAID' : 'UNPAID',
      expiresAt: generateQris ? (qrisInvoiceResult?.expiresAt || new Date(Date.now() + 3600 * 1000).toISOString()) : new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      paidAt: isCompletedNow ? nowIso : null,
      rawWebhookPayload: JSON.stringify({
        mode: generateQris ? 'manual_admin_qris_entry' : 'manual_admin_entry',
        notes: notes || null,
        createdAt: nowIso,
      }),
      createdAt: nowIso,
    });

    // 7. Optional: Send fulfillment receipt email to customer if already completed
    if (sendEmailNotification && isCompletedNow && cleanCodes.length > 0) {
      sendOrderFulfillmentEmail({
        customerEmail: cleanEmail,
        orderNumber,
        productName: productName.trim(),
        quantity,
        totalIdr: effectiveFinalAmountIdr,
        licenseCodes: cleanCodes,
      }).catch((emailErr) => {
        console.warn('[Manual Order] Failed to send email receipt:', emailErr);
      });
    }

    // 8. Instant Telegram notification to store admin
    try {
      await sendTelegramPurchaseNotification({
        orderNumber,
        productName: productName.trim(),
        quantity,
        totalIdr: effectiveFinalAmountIdr,
        customerEmail: cleanEmail || null,
        customerWhatsapp: customerWhatsapp?.trim() || null,
        paymentMethod: generateQris ? 'SumoPod QRIS (Manual Tagihan)' : 'Manual Direct',
        licenseCodesCount: cleanCodes.length,
        isManual: true,
      });
    } catch (teleErr) {
      console.warn('[Telegram] Manual order notification error:', teleErr);
    }

    return {
      success: true,
      data: {
        success: true,
        order: newOrder,
        qris: generateQris ? {
          qrCodeString: qrisInvoiceResult?.qrCodeString || null,
          paymentUrl: qrisInvoiceResult?.paymentUrl || null,
          qrCodeDataUrl,
          amountIdr: effectiveFinalAmountIdr,
          expiresAt: qrisInvoiceResult?.expiresAt || '',
          gatewayProvider: qrisInvoiceResult?.gatewayProvider || 'sumopod',
        } : null,
        message: generateQris
          ? `Transaksi manual ${orderNumber} berhasil dibuat dengan tagihan QRIS!`
          : `Transaksi manual ${orderNumber} berhasil dicatat!`,
      },
    };
  } catch (err) {
    return { success: false, error: { message: (err as Error).message } };
  }
}





/**
 * Retrieves payment and QRIS barcode details for an existing order in Admin Dashboard.
 */
export async function adminGetOrderPaymentDetails(rawInput: {
  orderId: string;
}) {
  try {
    if (!(await verifyAdminSessionToken())) {
      return { success: false, error: { message: 'Akses ditolak: Admin belum login' } };
    }

    const { orderId } = z.object({
      orderId: z.string().min(1),
    }).parse(rawInput);

    const orderRows = await db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.id, orderId))
      .limit(1);

    if (orderRows.length === 0) {
      return { success: false, error: { message: 'Data pesanan tidak ditemukan' } };
    }
    const order = orderRows[0];

    const paymentRows = await db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.orderId, orderId))
      .limit(1);

    const payment = paymentRows[0] || null;

    let qrCodeDataUrl: string | null = null;
    if (payment && (payment.qrCodeString || payment.paymentUrl)) {
      try {
        qrCodeDataUrl = await QRCode.toDataURL(payment.qrCodeString || payment.paymentUrl!, {
          width: 320,
          margin: 1,
          errorCorrectionLevel: 'M',
        });
      } catch {}
    }

    return {
      success: true,
      data: {
        paymentId: payment?.id || '',
        orderNumber: order.orderNumber,
        customerEmail: order.customerEmail,
        customerWhatsapp: order.customerWhatsapp,
        productName: order.productName,
        totalAmountIdr: order.totalAmountIdr,
        orderStatus: order.status,
        gatewayProvider: payment?.gatewayProvider || 'MANUAL',
        gatewayReference: payment?.gatewayReference || '',
        paymentMethod: payment?.paymentMethod || 'MANUAL',
        qrCodeString: payment?.qrCodeString || null,
        paymentUrl: payment?.paymentUrl || null,
        qrCodeDataUrl,
        amountIdr: payment?.amountIdr || order.totalAmountIdr,
        status: payment?.status || 'UNPAID',
        expiresAt: payment?.expiresAt || '',
      },
    };
  } catch (err) {
    return { success: false, error: { message: (err as Error).message } };
  }
}
