import type { APIRoute } from 'astro';
import { eq, or } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getPaymentGateway } from '@/lib/payment/adapter';
import { executeOrderFulfillment } from '@/lib/order/fulfillment';

export const POST: APIRoute = async ({ request }) => {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-callback-signature') || request.headers.get('x-tako-signature') || '';
    const incomingSecret = request.headers.get('x-callback-secret') || '';

    const gateway = getPaymentGateway();
    const isValid = gateway.verifyWebhook(rawBody, signature, incomingSecret);
    if (!isValid) {
      return new Response(JSON.stringify({ error: 'Signature webhook Tako tidak valid' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const payload = JSON.parse(rawBody);
    const data = payload.data || payload.result || payload;

    const referenceId = String(
      data.transactionId || 
      data.giftId || 
      data.id || 
      payload.transactionId || 
      payload.giftId || 
      payload.id || 
      ''
    );

    const paymentStatus = String(data.status || payload.status || '').toLowerCase();

    // 1. Locate payment and order record
    let paymentRecord: any = null;
    let orderRecord: any = null;

    if (referenceId) {
      const paymentsFound = await db
        .select()
        .from(schema.payments)
        .where(eq(schema.payments.gatewayReference, referenceId));
      paymentRecord = paymentsFound[0];
    }

    // Fallback: extract order number from message (e.g. "Pesanan PIXEL-20261004-XXXX")
    if (!paymentRecord) {
      const message = String(data.message || payload.message || '');
      const match = message.match(/(?:PIXEL|SIGMA)-[0-9]{8}-[A-Za-z0-9]+/);
      if (match) {
        const orderNumber = match[0];
        const ordersFound = await db
          .select()
          .from(schema.orders)
          .where(eq(schema.orders.orderNumber, orderNumber));
        orderRecord = ordersFound[0];
        if (orderRecord) {
          const paymentsFound = await db
            .select()
            .from(schema.payments)
            .where(eq(schema.payments.orderId, orderRecord.id));
          paymentRecord = paymentsFound[0];
        }
      }
    } else {
      const ordersFound = await db
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.id, paymentRecord.orderId));
      orderRecord = ordersFound[0];
    }

    if (!orderRecord) {
      return new Response(JSON.stringify({ error: 'Pesanan tidak ditemukan di sistem' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Idempotency: if already completed, acknowledge success
    if (orderRecord.status === 'COMPLETED') {
      return new Response(JSON.stringify({ success: true, message: 'Pesanan sudah selesai diproses' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check if status is successful payment
    const isPaid = ['success', 'paid', 'completed'].includes(paymentStatus);
    if (!isPaid) {
      return new Response(JSON.stringify({ received: true, status: paymentStatus }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Atomic execution with Compare-and-Swap lock
    const result = await executeOrderFulfillment(orderRecord.id, 'webhook_tako', rawBody);

    if (result.status === 'COMPLETED' || result.status === 'ALREADY_PROCESSED') {
      return new Response(
        JSON.stringify({ success: true, orderNumber: orderRecord.orderNumber, status: result.status }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // If supplier stock is empty or failed, acknowledge receipt with 200 so gateway doesn't loop
    return new Response(
      JSON.stringify({
        success: false,
        status: result.status,
        orderNumber: orderRecord.orderNumber,
        error: result.errorMessage,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
