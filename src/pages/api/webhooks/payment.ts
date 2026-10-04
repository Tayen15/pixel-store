import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import crypto from 'node:crypto';
import { db, schema } from '@/db';
import { getPaymentGateway } from '@/lib/payment/adapter';
import { executeOrderFulfillment } from '@/lib/order/fulfillment';

export const POST: APIRoute = async ({ request }) => {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-callback-signature') || '';

    const gateway = getPaymentGateway();
    const isValid = gateway.verifyWebhook(rawBody, signature);
    if (!isValid) {
      return new Response(JSON.stringify({ error: 'Invalid HMAC signature' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const payload = JSON.parse(rawBody);
    const orderNumber = payload.merchant_ref || payload.order_id || payload.orderNumber;
    const paymentStatus = payload.status; // e.g. 'PAID', 'settlement', 'success'

    if (!orderNumber) {
      return new Response(JSON.stringify({ error: 'Missing order reference' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Lookup order in SQLite
    const ordersFound = await db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.orderNumber, orderNumber));

    if (ordersFound.length === 0) {
      return new Response(JSON.stringify({ error: 'Order not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const order = ordersFound[0];

    // Idempotency: if already completed or fulfilling, ignore duplicate webhook
    if (order.status === 'COMPLETED' || order.status === 'FULFILLING') {
      return new Response(JSON.stringify({ success: true, message: 'Already processed' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check if status represents successful payment
    const isPaid = ['PAID', 'settlement', 'success', 'COMPLETED'].includes(paymentStatus);
    if (!isPaid) {
      return new Response(JSON.stringify({ received: true, status: paymentStatus }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Atomic execution with Compare-and-Swap lock
    const result = await executeOrderFulfillment(order.id, 'webhook_generic', rawBody);

    if (result.status === 'COMPLETED' || result.status === 'ALREADY_PROCESSED') {
      return new Response(JSON.stringify({ success: true, orderNumber, status: result.status }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({
        success: false,
        status: result.status,
        orderNumber,
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
