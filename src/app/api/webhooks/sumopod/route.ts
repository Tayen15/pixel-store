import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getPaymentGateway } from '@/lib/payment/adapter';
import { executeOrderFulfillment } from '@/lib/order/fulfillment';

// In-memory set for event deduplication
const processedEventIds = new Set<string>();

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();

    // Extract authentication headers
    const webhookToken = request.headers.get('x-webhook-token') || '';
    const svixId = request.headers.get('svix-id') || '';
    const svixTimestamp = request.headers.get('svix-timestamp') || '';
    const svixSignature = request.headers.get('svix-signature') || '';

    const headersMap = {
      'x-webhook-token': webhookToken,
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    };

    const gateway = getPaymentGateway();
    const isValid = gateway.verifyWebhook(rawBody, webhookToken || svixSignature, headersMap);

    if (!isValid) {
      console.warn('[SumoPod Webhook] Autentikasi webhook gagal (token/signature invalid)');
      return NextResponse.json(
        { error: 'Invalid webhook token or signature' },
        { status: 401 }
      );
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      );
    }

    const eventType = payload.event_type || payload.type || '';
    const data = payload.data || payload;

    // Deduplication check: payment_id + event_type
    const eventId = `${data.payment_id || ''}_${eventType}`;
    if (eventId && processedEventIds.has(eventId)) {
      return NextResponse.json({
        success: true,
        message: 'Event duplikat berhasil dideduplikasi (200 OK)',
        eventId,
      });
    }

    if (eventId) {
      if (processedEventIds.size > 2000) processedEventIds.clear();
      processedEventIds.add(eventId);
    }

    // Handle handshake / test event from SumoPod Settings page
    if (eventType === 'payment.test') {
      console.log('[SumoPod Webhook] Test event diterima:', payload);
      return NextResponse.json({
        success: true,
        message: 'SumoPod webhook test berhasil diterima (200 OK)',
      });
    }

    const orderNumber = data.order_id || data.orderNumber || '';
    const paymentId = data.payment_id || '';
    const status = String(data.status || '').toLowerCase();

    // Locate order in database
    let orderRecord: any = null;

    if (orderNumber) {
      const ordersFound = await db
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.orderNumber, orderNumber));
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

    // Acknowledge unmapped/sandbox test references with 200 OK
    if (!orderRecord) {
      console.log('[SumoPod Webhook] Order tidak ditemukan (test reference), diakui 200 OK:', {
        eventType,
        orderNumber,
        paymentId,
      });
      return NextResponse.json({
        success: true,
        message: 'Webhook diterima (unmapped reference acknowledged)',
        eventType,
        orderNumber,
        paymentId,
      });
    }

    // Idempotency: If already completed, respond 200 OK
    if (orderRecord.status === 'COMPLETED') {
      return NextResponse.json({
        success: true,
        message: 'Pesanan sudah selesai diproses sebelumnya',
      });
    }

    // Process payment completion
    const isCompleted =
      eventType === 'payment.completed' ||
      status === 'completed' ||
      status === 'paid' ||
      status === 'success';

    if (isCompleted) {
      const fulfillmentRes = await executeOrderFulfillment(
        orderRecord.id,
        'webhook_sumopod',
        rawBody
      );
      return NextResponse.json({
        success: true,
        orderNumber: orderRecord.orderNumber,
        status: fulfillmentRes.status,
      });
    }

    // Process payment expiration or failure
    const isFailedOrExpired =
      eventType === 'payment.failed' ||
      eventType === 'payment.expired' ||
      status === 'failed' ||
      status === 'expired';

    if (isFailedOrExpired) {
      await db
        .update(schema.orders)
        .set({
          status: 'EXPIRED',
          failureReason: `Pembayaran kadaluarsa/gagal (${eventType || status})`,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(schema.orders.id, orderRecord.id));

      await db
        .update(schema.payments)
        .set({
          status: 'EXPIRED',
          rawWebhookPayload: rawBody,
        })
        .where(eq(schema.payments.orderId, orderRecord.id));

      return NextResponse.json({
        success: true,
        orderNumber: orderRecord.orderNumber,
        status: 'EXPIRED',
      });
    }

    return NextResponse.json({
      success: true,
      message: `Event '${eventType}' diterima`,
    });
  } catch (error) {
    console.error('[SumoPod Webhook Execution Error]:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
