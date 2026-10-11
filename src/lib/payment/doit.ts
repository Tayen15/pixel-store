import crypto from 'node:crypto';
import QRCode from 'qrcode';
import type { CreateInvoiceInput, InvoiceResult, IPaymentGateway } from './adapter';

export interface DoitCustomer {
  name?: string;
  email?: string;
  phone?: string;
}

export interface DoitPayment {
  id: string; // pay_...
  status: 'pending' | 'paid' | 'expired' | 'failed' | 'refunded';
  amount: number;
  rail?: 'qris' | 'va' | 'transfer' | 'any';
  reference: string;
  customer?: DoitCustomer | null;
  qr_content?: string | null;
  va_number?: string | null;
  va_bank?: string | null;
  payment_url?: string | null;
  flags?: string[];
  fee_amount?: number;
  fee_payer?: 'merchant' | 'customer';
  total_amount?: number;
  hosted_url?: string;
  return_url?: string | null;
  provider?: string;
  provider_ref?: string;
  environment?: 'test' | 'live';
  expires_at?: string;
  paid_at?: string | null;
  metadata?: Record<string, any> | null;
  created_at?: string;
  proofs?: any[];
}

export interface DoitWebhookEvent {
  id: string; // evt_...
  type: 'payment.paid' | 'payment.expired' | 'invoice.created' | 'payment.proof_uploaded' | 'refund.succeeded' | 'refund.failed' | 'webhook.test';
  created_at: string;
  data: DoitPayment;
}

export class DoitPaymentGateway implements IPaymentGateway {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly webhookSecret?: string;
  private readonly returnUrl?: string;

  constructor(
    apiKey: string,
    baseUrl = 'https://pay.doit.id',
    webhookSecret?: string,
    returnUrl?: string
  ) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.webhookSecret = webhookSecret;
    this.returnUrl = returnUrl || (typeof process !== 'undefined' && process.env.APP_URL 
      ? `${process.env.APP_URL}/doit/redirect` 
      : 'https://pixelstore.oktaa.my.id/doit/redirect');
  }

  /**
   * Request QRIS payment via Doit.id Payments API
   * Spec: POST /v1/payments with Header 'Idempotency-Key' and 'Authorization: Bearer <API_KEY>'
   */
  async createQRISInvoice(input: CreateInvoiceInput): Promise<InvoiceResult> {
    const endpoint = `${this.baseUrl}/v1/payments`;
    const expiryMinutes = input.expiryMinutes ?? 15;
    const expiresInSeconds = expiryMinutes * 60;

    const payload = {
      amount: Math.round(input.amountIdr),
      rail: 'qris',
      reference: input.orderNumber,
      expires_in: expiresInSeconds,
      customer: {
        name: input.customerEmail.split('@')[0] || 'Customer',
        email: input.customerEmail,
        phone: input.customerWhatsapp,
      },
      return_url: this.returnUrl,
      metadata: {
        orderNumber: input.orderNumber,
        productName: input.productName,
      },
    };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': input.orderNumber,
        'User-Agent': 'PixelStore/1.0',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const teks = await res.text();
    let data: DoitPayment & { error?: { code: string; message: string } };
    try {
      data = JSON.parse(teks);
    } catch {
      throw new Error(`Doit API error (${res.status}): ${teks.slice(0, 300)}`);
    }

    if (!res.ok) {
      const err = data.error;
      const errMsg = err ? `${err.code}: ${err.message}` : `HTTP ${res.status}: ${teks.slice(0, 300)}`;
      throw new Error(`Gagal membuat pembayaran Doit.id: ${errMsg}`);
    }

    // QRIS content fallback: qr_content is the official EMVCo QRIS string, or fallback to hosted_url
    const qrContent = data.qr_content || data.hosted_url || '';
    let qrCodeDataUrl: string | undefined;

    if (qrContent) {
      try {
        qrCodeDataUrl = await QRCode.toDataURL(qrContent, {
          width: 320,
          margin: 1,
          errorCorrectionLevel: 'M',
        });
      } catch (err) {
        console.warn('Gagal render QR Data URL:', (err as Error).message);
      }
    }

    const expiresAt = data.expires_at || new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString();

    return {
      gatewayProvider: 'doit',
      gatewayReference: data.id, // pay_...
      qrCodeString: qrContent,
      paymentUrl: data.hosted_url,
      qrCodeImageUrl: undefined,
      qrCodeDataUrl,
      expiresAt,
    };
  }

  /**
   * Check payment status by Payment ID (pay_...) or Reference (orderNumber)
   * Spec: GET /v1/payments/{id} or GET /v1/payments?reference={reference}
   */
  async checkPaymentStatus(idOrReference: string): Promise<DoitPayment | null> {
    try {
      const isId = idOrReference.startsWith('pay_');
      const url = isId
        ? `${this.baseUrl}/v1/payments/${encodeURIComponent(idOrReference)}`
        : `${this.baseUrl}/v1/payments?reference=${encodeURIComponent(idOrReference)}`;

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'User-Agent': 'PixelStore/1.0',
          Accept: 'application/json',
        },
      });

      if (!res.ok) return null;
      const json = await res.json();

      if (isId) {
        return json as DoitPayment;
      }

      // If queried by reference, Doit returns { data: [DoitPayment] }
      if (Array.isArray(json.data) && json.data.length > 0) {
        return json.data[0] as DoitPayment;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Verify Doit.id webhook signature.
   * Spec: Header 'PayBridge-Signature: t=1755612912,v1=5f8a...'
   * Formula: v1 = HMAC-SHA256(signing secret, t + '.' + rawBody)
   */
  verifyWebhook(rawBody: string, signatureHeader: string, customSecret?: string): boolean {
    const secretKey = (customSecret || this.webhookSecret || '').trim();
    if (!secretKey) {
      console.warn('DOIT_SIGNING_SECRET belum diatur. Melewati verifikasi HMAC signature.');
      return true;
    }

    if (!signatureHeader || !rawBody) {
      return false;
    }

    try {
      const parts = Object.fromEntries(
        signatureHeader.split(',').map((part) => {
          const idx = part.indexOf('=');
          if (idx === -1) return [part.trim(), ''];
          return [part.slice(0, idx).trim(), part.slice(idx + 1).trim()];
        })
      );

      const t = parts.t;
      const v1 = parts.v1;

      if (!t || !v1) {
        return false;
      }

      const calculated = crypto
        .createHmac('sha256', secretKey)
        .update(`${t}.${rawBody}`)
        .digest('hex');

      const bufV1 = Buffer.from(v1, 'hex');
      const bufCalc = Buffer.from(calculated, 'hex');

      if (bufV1.length !== bufCalc.length) {
        return false;
      }

      return crypto.timingSafeEqual(bufV1, bufCalc);
    } catch (err) {
      console.warn('Error verifikasi signature Doit.id:', (err as Error).message);
      return false;
    }
  }
}
