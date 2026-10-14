import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { getSystemConfig } from '@/lib/settings/service';
import type { CreateInvoiceInput, InvoiceResult, IPaymentGateway } from './adapter';

export interface SumopodCreatePaymentResponse {
  payment_id: string;
  order_id: string;
  amount: number;
  fee: number;
  net_amount: number;
  currency: string;
  payment_link_url: string;
  payment_code: string;
  payment_code_type: string;
  payment_channel_used: string;
  status: string;
  expires_at: string;
}

export class SumopodPaymentGateway implements IPaymentGateway {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly signingSecret?: string;
  private readonly webhookToken?: string;

  constructor(
    apiKey: string,
    baseUrl = 'https://api-pay-sandbox.sumopod.com',
    signingSecret?: string,
    webhookToken?: string
  ) {
    this.apiKey = apiKey.trim();
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.signingSecret = signingSecret?.trim();
    this.webhookToken = webhookToken?.trim();
  }

  async createQRISInvoice(input: CreateInvoiceInput): Promise<InvoiceResult> {
    const config = await getSystemConfig();
    const expiryMinutes = input.expiryMinutes ?? config.orders.expiryMinutes;
    const expiresInHours = Math.max(1, Math.min(24, Math.ceil(expiryMinutes / 60)));

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://pixelstore.oktaa.my.id').replace(/\/+$/, '');

    const payload = {
      order_id: input.orderNumber,
      amount: input.amountIdr,
      currency: 'IDR',
      expires_in_hours: expiresInHours,
      success_return_url: `${appUrl}/user?order=${encodeURIComponent(input.orderNumber)}`,
      cancel_return_url: `${appUrl}/user?order=${encodeURIComponent(input.orderNumber)}&canceled=true`,
      payment_method_type_code: 'QRIS',
    };

    const res = await fetch(`${this.baseUrl}/api/v1/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': this.apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      let msg = errText;
      try {
        const parsed = JSON.parse(errText);
        msg = parsed.message || parsed.error || errText;
      } catch {}
      throw new Error(`SumoPod payment creation failed (HTTP ${res.status}): ${msg}`);
    }

    const data = (await res.json()) as SumopodCreatePaymentResponse;

    const qrCodeString = data.payment_code || data.payment_link_url || '';
    let qrCodeDataUrl: string | undefined;

    if (qrCodeString) {
      try {
        qrCodeDataUrl = await QRCode.toDataURL(qrCodeString, {
          width: 340,
          margin: 1,
          errorCorrectionLevel: 'M',
        });
      } catch (err) {
        console.warn('[SumoPod] Gagal render QRCode data URL:', (err as Error).message);
      }
    }

    return {
      gatewayProvider: 'sumopod',
      gatewayReference: data.payment_id,
      qrCodeString,
      qrCodeDataUrl,
      paymentUrl: data.payment_link_url,
      expiresAt: data.expires_at || new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString(),
    };
  }

  /**
   * Verify SumoPod webhook request using either:
   * 1. X-Webhook-Token direct comparison (Simpler method)
   * 2. Svix HMAC-SHA256 signature verification (svix-id, svix-timestamp, svix-signature)
   */
  verifyWebhook(
    rawBody: string,
    signatureOrToken: string,
    headersOrSecret?: Record<string, string | null | undefined> | string
  ): boolean {
    const expectedToken = this.webhookToken;
    const expectedSecret =
      (typeof headersOrSecret === 'string' ? headersOrSecret : this.signingSecret) || '';

    // Method 1: Check token
    if (expectedToken && signatureOrToken) {
      if (signatureOrToken === expectedToken) {
        return true;
      }
    }

    // If headers object provided, check X-Webhook-Token from headers
    if (typeof headersOrSecret === 'object' && headersOrSecret !== null) {
      const receivedToken =
        headersOrSecret['x-webhook-token'] || headersOrSecret['X-Webhook-Token'];
      if (expectedToken && receivedToken === expectedToken) {
        return true;
      }

      // Method 2: Check Svix headers
      const svixId = headersOrSecret['svix-id'];
      const svixTimestamp = headersOrSecret['svix-timestamp'];
      const svixSignature = headersOrSecret['svix-signature'] || signatureOrToken;

      if (expectedSecret && svixId && svixTimestamp && svixSignature && rawBody) {
        try {
          const secretBytes = Buffer.from(expectedSecret.replace('whsec_', ''), 'base64');
          const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
          const expectedSignature = crypto
            .createHmac('sha256', secretBytes)
            .update(signedContent)
            .digest('base64');

          const signatures = svixSignature.split(' ').map((s) => {
            const parts = s.split(',');
            return parts.length > 1 ? parts[1] : parts[0];
          });

          return signatures.includes(expectedSignature);
        } catch (err) {
          console.warn('[SumoPod] Error verifikasi svix signature:', (err as Error).message);
        }
      }
    }

    // Fallback: If no secrets configured yet, log warning and accept during setup
    if (!expectedToken && !expectedSecret) {
      console.warn('[SumoPod] Webhook secret/token belum diatur di .env. Melewati verifikasi.');
      return true;
    }

    return false;
  }
}
