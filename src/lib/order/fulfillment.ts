import { eq } from 'drizzle-orm';
import { db, sqlClient, schema } from '@/db';
import { insightXPro } from '@/lib/insightxpro/client';
import { sendOrderFulfillmentEmail } from '@/lib/email/mailer';
import {
  sendTelegramPurchaseNotification,
  sendTelegramSupplierAlert,
} from '@/lib/telegram/bot';

export interface FulfillmentResult {
  success: boolean;
  status: 'COMPLETED' | 'FAILED_SUPPLIER' | 'ALREADY_PROCESSED' | 'NOT_FOUND';
  orderNumber?: string;
  licenseCodes?: string[];
  errorMessage?: string;
}

/**
 * Executes order fulfillment with atomic lock (Compare-and-Swap).
 * Prevents race conditions between concurrent webhooks and client polling.
 */
export async function executeOrderFulfillment(
  orderId: string,
  triggerSource: 'webhook_sumopod' | 'webhook_generic' | 'client_polling' | 'sandbox_simulation' | string,
  rawPayload?: string
): Promise<FulfillmentResult> {
  // 1. Fetch current order
  const ordersFound = await db
    .select()
    .from(schema.orders)
    .where(eq(schema.orders.id, orderId));

  if (ordersFound.length === 0) {
    return { success: false, status: 'NOT_FOUND', errorMessage: 'Pesanan tidak ditemukan' };
  }

  const order = ordersFound[0];

  // Idempotency: If already completed or failed, do not touch
  if (order.status === 'COMPLETED') {
    let parsedCodes: string[] = [];
    try {
      parsedCodes = order.licenseCodes ? JSON.parse(order.licenseCodes) : [];
    } catch {
      parsedCodes = [];
    }
    return {
      success: true,
      status: 'COMPLETED',
      orderNumber: order.orderNumber,
      licenseCodes: parsedCodes,
    };
  }

  if (order.status === 'FAILED_SUPPLIER') {
    return {
      success: false,
      status: 'FAILED_SUPPLIER',
      orderNumber: order.orderNumber,
      errorMessage: order.failureReason || 'Pengadaan supplier gagal',
    };
  }

  // 2. ATOMIC LOCK (Compare-and-Swap in PostgreSQL)
  // Only 1 execution thread can transition PENDING_PAYMENT -> FULFILLING
  const lockResult = await sqlClient`
    UPDATE orders 
    SET status = 'FULFILLING', 
        paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP), 
        updated_at = CURRENT_TIMESTAMP 
    WHERE id = ${orderId} AND status = 'PENDING_PAYMENT'
    RETURNING id;
  `;

  if (lockResult.length === 0) {
    // Another worker has already acquired the lock or transitioned the status
    return {
      success: true,
      status: 'ALREADY_PROCESSED',
      orderNumber: order.orderNumber,
    };
  }

  // Update associated payment record
  try {
    await sqlClient`
      UPDATE payments 
      SET status = 'PAID', 
          paid_at = CURRENT_TIMESTAMP, 
          raw_webhook_payload = COALESCE(${rawPayload || null}, raw_webhook_payload) 
      WHERE order_id = ${orderId}
    `;
  } catch (err) {
    console.warn('Payment record update warning:', (err as Error).message);
  }

  // 3. Fulfill from Wholesale Supplier (InsightXPro)
  try {
    // Shield: If this is a manual order (PIXEL-MAN-...), DO NOT call InsightXPro wholesale supplier!
    if (order.orderNumber.startsWith('PIXEL-MAN-')) {
      let existingCodes: string[] = [];
      try {
        existingCodes = order.licenseCodes ? JSON.parse(order.licenseCodes) : [];
      } catch {
        existingCodes = order.licenseCodes ? [order.licenseCodes] : [];
      }

      await db
        .update(schema.orders)
        .set({
          status: 'COMPLETED',
          fulfilledAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(schema.orders.id, order.id));

      if (order.customerEmail && order.customerEmail.includes('@') && existingCodes.length > 0) {
        sendOrderFulfillmentEmail({
          orderNumber: order.orderNumber,
          customerEmail: order.customerEmail,
          productName: order.productName || 'Lisensi Digital',
          quantity: order.quantity,
          totalIdr: order.totalAmountIdr,
          licenseCodes: existingCodes,
        }).catch((emailErr) => {
          console.warn(`[SMTP] Failed to send receipt for manual order ${order.orderNumber}:`, emailErr);
        });
      }

      // Guaranteed instant Telegram purchase alert to store admin
      try {
        await sendTelegramPurchaseNotification({
          orderNumber: order.orderNumber,
          productName: order.productName || 'Lisensi Digital',
          quantity: order.quantity,
          totalIdr: order.totalAmountIdr,
          customerEmail: order.customerEmail,
          customerWhatsapp: order.customerWhatsapp,
          paymentMethod: 'MANUAL / QRIS',
          licenseCodesCount: existingCodes.length,
          isManual: true,
        });
      } catch (teleErr) {
        console.warn('[Telegram] Manual purchase alert error:', teleErr);
      }

      return {
        success: true,
        status: 'COMPLETED',
        orderNumber: order.orderNumber,
        licenseCodes: existingCodes,
      };
    }

    const productRecord = await db
      .select()
      .from(schema.productsCache)
      .where(eq(schema.productsCache.id, order.productId));

    const supplierProductId = productRecord[0]?.supplierProductId ?? order.productId;
    const apiKey = process.env.INSIGHTXPRO_API_KEY;

    if (!apiKey) {
      throw new Error('API Key supplier InsightXPro belum terpasang di sistem.');
    }

    // Call upstream with stored Idempotency Key
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

    if (codes.length === 0) {
      throw new Error('Stok supplier wholesale habis atau lisensi belum siap terbit.');
    }

    // 4. Mark COMPLETED
    await db
      .update(schema.orders)
      .set({
        status: 'COMPLETED',
        supplierOrderId,
        licenseCodes: JSON.stringify(codes),
        fulfilledAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.orders.id, order.id));

    // Send email asynchronously if customer email is valid
    if (order.customerEmail && order.customerEmail.includes('@')) {
      sendOrderFulfillmentEmail({
        orderNumber: order.orderNumber,
        customerEmail: order.customerEmail,
        productName: productRecord[0]?.name || 'Lisensi Digital',
        quantity: order.quantity,
        totalIdr: order.totalAmountIdr,
        licenseCodes: codes,
      }).catch((emailErr) => {
        console.warn(`[SMTP] Failed to send receipt for order ${order.orderNumber}:`, emailErr);
      });
    }

    // Guaranteed instant Telegram Purchase Notification to Store Admin
    try {
      await sendTelegramPurchaseNotification({
        orderNumber: order.orderNumber,
        productName: productRecord[0]?.name || order.productName || 'Lisensi Digital',
        quantity: order.quantity,
        totalIdr: order.totalAmountIdr,
        customerEmail: order.customerEmail,
        customerWhatsapp: order.customerWhatsapp,
        paymentMethod: 'SumoPod QRIS',
        licenseCodesCount: codes.length,
        isManual: false,
      });
    } catch (teleErr) {
      console.warn('[Telegram] Purchase alert error:', teleErr);
    }

    return {
      success: true,
      status: 'COMPLETED',
      orderNumber: order.orderNumber,
      licenseCodes: codes,
    };
  } catch (fulfillErr) {
    // 5. Out-of-Stock / Supplier Failure Handling
    // Payment was received, but upstream stock ran out or failed
    const errorMsg = (fulfillErr as Error).message || 'Stok produk wholesale habis';

    // Auto-deplete product stock in local cache so subsequent buyers cannot order it
    try {
      await db
        .update(schema.productsCache)
        .set({
          stock: 0,
          inStock: false,
          isActive: false,
        })
        .where(eq(schema.productsCache.id, order.productId));
    } catch (cacheErr) {
      console.warn('Failed to auto-deplete local product cache on supplier failure:', cacheErr);
    }

    await db
      .update(schema.orders)
      .set({
        status: 'FAILED_SUPPLIER',
        failureReason: `Stok supplier wholesale habis saat pembayaran diverifikasi: ${errorMsg}`,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.orders.id, order.id));

    console.error(`[ALERT] Order ${order.orderNumber} payment confirmed but upstream stock empty:`, errorMsg);

    // Guaranteed Urgent Alert to Admin via Telegram
    try {
      await sendTelegramSupplierAlert({
        orderNumber: order.orderNumber,
        productName: order.productName || 'Lisensi Digital',
        errorMessage: errorMsg,
        customerEmail: order.customerEmail,
      });
    } catch (teleErr) {
      console.warn('[Telegram] Supplier failure alert error:', teleErr);
    }

    return {
      success: false,
      status: 'FAILED_SUPPLIER',
      orderNumber: order.orderNumber,
      errorMessage: errorMsg,
    };
  }
}
