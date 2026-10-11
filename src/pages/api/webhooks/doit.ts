import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getPaymentGateway } from '@/lib/payment/adapter';
import { executeOrderFulfillment } from '@/lib/order/fulfillment';

export const POST: APIRoute = async ({ request }) => {
  try {
    const rawBody = await request.text();
    const signature =
      request.headers.get('paybridge-signature') ||
      request.headers.get('PayBridge-Signature') ||
      request.headers.get('x-callback-signature') ||
      '';

    const gateway = getPaymentGateway();
    const isValid = gateway.verifyWebhook(rawBody, signature);
    if (!isValid) {
      return new Response(
        JSON.stringify({ error: 'Signature webhook Doit.id tidak valid' }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON payload' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Handle handshake test event from Doit developer portal
    if (payload.type === 'webhook.test') {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Webhook handshake test Doit.id berhasil diterima',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const data = payload.data || payload;
    const eventType = payload.type || '';
    const reference = data.reference || data.order_number || data.orderNumber || '';
    const paymentId = data.id || '';
    const paymentStatus = String(data.status || '').toLowerCase();

    // 1. Locate order by reference (orderNumber) or payment gateway ID
    let orderRecord: any = null;

    if (reference) {
      const ordersFound = await db
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.orderNumber, reference));
      orderRecord = ordersFound[0];
    }

    if (!orderRecord && paymentId) {
      const paymentsFound = await db
        .select()
        .from(schema.payments)
        .where(eq(schema.payments.gatewayReference, paymentId));
      if (paymentsFound[0]) {
        const ordersFound = await db
          .select()
          .from(schema.orders)
          .where(eq(schema.orders.id, paymentsFound[0].orderId));
        orderRecord = ordersFound[0];
      }
    }

    if (!orderRecord) {
      return new Response(
        JSON.stringify({ error: 'Pesanan tidak ditemukan di database Pixel Store' }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Idempotency: If already completed, respond 200 OK
    if (orderRecord.status === 'COMPLETED') {
      return new Response(
        JSON.stringify({ success: true, message: 'Pesanan sudah selesai diproses sebelumnya' }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Check if status is paid
    const isPaid = eventType === 'payment.paid' || ['paid', 'success', 'completed'].includes(paymentStatus);

    if (isPaid) {
      // Atomic execution with Compare-and-Swap lock
      const result = await executeOrderFulfillment(orderRecord.id, 'webhook_doit', rawBody);

      if (result.status === 'COMPLETED' || result.status === 'ALREADY_PROCESSED') {
        return new Response(
          JSON.stringify({
            success: true,
            orderNumber: orderRecord.orderNumber,
            status: result.status,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      return new Response(
        JSON.stringify({
          success: false,
          status: result.status,
          orderNumber: orderRecord.orderNumber,
          error: result.errorMessage,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Handle expired
    if (eventType === 'payment.expired' || paymentStatus === 'expired') {
      if (orderRecord.status === 'PENDING_PAYMENT') {
        await db
          .update(schema.orders)
          .set({ status: 'EXPIRED', updatedAt: new Date().toISOString() })
          .where(eq(schema.orders.id, orderRecord.id));
      }
      return new Response(
        JSON.stringify({ success: true, message: 'Order marked expired' }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({ received: true, type: eventType, status: paymentStatus }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (err) {
    console.error('Doit webhook error:', err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
