import crypto from 'node:crypto';
import { DoitPaymentGateway } from '../src/lib/payment/doit';
import { getPaymentGateway } from '../src/lib/payment/adapter';

async function main() {
  console.log('--- 1. Testing Doit Gateway Instantiation & Active Selection ---');
  const gateway = getPaymentGateway();
  console.log('Active gateway class:', gateway.constructor.name);
  if (!(gateway instanceof DoitPaymentGateway)) {
    throw new Error('Expected DoitPaymentGateway to be active!');
  }
  console.log('✓ DoitPaymentGateway is correctly selected as active gateway');

  console.log('\n--- 2. Testing Webhook HMAC Signature Verification ---');
  const testSecret = 'whsec_test_secret_1234567890';
  const customGateway = new DoitPaymentGateway('pb_test_fake', 'https://pay.doit.id', testSecret);
  const rawBody = JSON.stringify({
    id: 'evt_test_123',
    type: 'payment.paid',
    data: {
      id: 'pay_test_999',
      status: 'paid',
      amount: 150000,
      reference: 'PIXEL-20261011-TEST',
    },
  });

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const validV1 = crypto.createHmac('sha256', testSecret).update(`${timestamp}.${rawBody}`).digest('hex');
  const validHeader = `t=${timestamp},v1=${validV1}`;

  const isValid = customGateway.verifyWebhook(rawBody, validHeader);
  console.log('Valid signature verified:', isValid);
  if (!isValid) throw new Error('HMAC verification failed for valid header!');

  const invalidHeader = `t=${timestamp},v1=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef`;
  const isInvalid = customGateway.verifyWebhook(rawBody, invalidHeader);
  console.log('Invalid signature rejected:', !isInvalid);
  if (isInvalid) throw new Error('HMAC verification allowed invalid signature!');
  console.log('✓ Webhook HMAC verification strictly conforms to Doit.id specification');

  console.log('\n--- 3. Testing Real Sandbox API: Create QRIS Payment ---');
  const testOrderNumber = `PIXEL-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-TEST${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  const invoice = await gateway.createQRISInvoice({
    orderNumber: testOrderNumber,
    amountIdr: 25000,
    customerEmail: 'tester@pixelstore.oktaa.my.id',
    customerWhatsapp: '08123456789',
    productName: 'Test Voucher Doit.id (x1)',
    expiryMinutes: 15,
  });

  console.log('Created invoice result:', {
    provider: invoice.gatewayProvider,
    reference: invoice.gatewayReference,
    paymentUrl: invoice.paymentUrl,
    hasQrCodeString: Boolean(invoice.qrCodeString),
    qrCodeStringPreview: invoice.qrCodeString?.slice(0, 40) + '...',
    hasDataUrl: Boolean(invoice.qrCodeDataUrl),
    expiresAt: invoice.expiresAt,
  });

  if (invoice.gatewayProvider !== 'doit') {
    throw new Error('Invoice provider is not doit!');
  }
  if (!invoice.gatewayReference?.startsWith('pay_')) {
    throw new Error(`Unexpected gatewayReference: ${invoice.gatewayReference}`);
  }
  if (!invoice.paymentUrl?.includes('pay.doit.id')) {
    throw new Error(`Unexpected paymentUrl: ${invoice.paymentUrl}`);
  }
  console.log('✓ Sandbox QRIS invoice successfully generated via Doit.id API');

  console.log('\n--- 4. Testing Real Sandbox API: Check Payment Status ---');
  const status = await (gateway as DoitPaymentGateway).checkPaymentStatus(invoice.gatewayReference);
  console.log('Queried payment status:', {
    id: status?.id,
    reference: status?.reference,
    status: status?.status,
    amount: status?.amount,
    rail: status?.rail,
  });

  if (status?.status !== 'pending') {
    throw new Error(`Expected pending status, got: ${status?.status}`);
  }
  console.log('✓ Payment status queried successfully from Doit.id API');

  console.log('\n========================================');
  console.log(' ALL DOIT.ID MIGRATION TESTS PASSED 100% ');
  console.log('========================================');
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
