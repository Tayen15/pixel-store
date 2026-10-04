import { eq } from 'drizzle-orm';
import { db, rawClient, schema } from '@/db';
import { insightXPro } from '@/lib/insightxpro/client';

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
  triggerSource: 'webhook_tako' | 'webhook_generic' | 'client_polling' | 'sandbox_simulation',
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

  // 2. ATOMIC LOCK (Compare-and-Swap)
  // Only 1 execution thread can transition PENDING_PAYMENT -> FULFILLING
  const lockResult = await rawClient.execute({
    sql: `UPDATE orders 
          SET status = 'FULFILLING', 
              paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP), 
              updated_at = CURRENT_TIMESTAMP 
          WHERE id = ? AND status = 'PENDING_PAYMENT'`,
    args: [orderId],
  });

  if (lockResult.rowsAffected === 0) {
    // Another worker has already acquired the lock or transitioned the status
    return {
      success: true,
      status: 'ALREADY_PROCESSED',
      orderNumber: order.orderNumber,
    };
  }

  // Update associated payment record
  try {
    await rawClient.execute({
      sql: `UPDATE payments 
            SET status = 'PAID', 
                paid_at = CURRENT_TIMESTAMP, 
                raw_webhook_payload = COALESCE(?, raw_webhook_payload) 
            WHERE order_id = ?`,
      args: [rawPayload || null, orderId],
    });
  } catch (err) {
    console.warn('Payment record update warning:', (err as Error).message);
  }

  // 3. Fulfill from Wholesale Supplier (InsightXPro)
  try {
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

    const supplierOrderId = String(supplierRes.order_id);
    const codes = supplierRes.codes || [];

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

    await db
      .update(schema.orders)
      .set({
        status: 'FAILED_SUPPLIER',
        failureReason: `Stok supplier wholesale habis saat pembayaran diverifikasi: ${errorMsg}`,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.orders.id, order.id));

    console.error(`[ALERT] Order ${order.orderNumber} payment confirmed but upstream stock empty:`, errorMsg);

    return {
      success: false,
      status: 'FAILED_SUPPLIER',
      orderNumber: order.orderNumber,
      errorMessage: errorMsg,
    };
  }
}
