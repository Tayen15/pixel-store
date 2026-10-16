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

function formatTlv(tag: string, value: string): string {
  const len = value.length.toString().padStart(2, '0');
  return `${tag}${len}${value}`;
}

export function calculateQrisCrc16(payloadWithoutCrc: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payloadWithoutCrc.length; i++) {
    crc ^= payloadWithoutCrc.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function buildFallbackQrisString(orderNumber: string, amountIdr: number): string {
  const tag00 = formatTlv('00', '01');
  const tag01 = formatTlv('01', '12');
  const nmid = 'ID1020021234567';
  const tag51 = formatTlv(
    '51',
    formatTlv('00', 'ID.CO.QRIS.WWW') + formatTlv('01', nmid) + formatTlv('02', orderNumber.slice(0, 15))
  );
  const tag52 = formatTlv('52', '5732');
  const tag53 = formatTlv('53', '360');
  const tag54 = formatTlv('54', amountIdr.toFixed(2));
  const tag58 = formatTlv('58', 'ID');
  const tag59 = formatTlv('59', 'PIXEL STORE');
  const tag60 = formatTlv('60', 'JAKARTA');
  const tag62 = formatTlv('62', formatTlv('01', orderNumber));
  const tag63Prefix = '6304';

  const base = `${tag00}${tag01}${tag51}${tag52}${tag53}${tag54}${tag58}${tag59}${tag60}${tag62}${tag63Prefix}`;
  const crc = calculateQrisCrc16(base);
  return `${base}${crc}`;
}

async function extractQrisFromPaymentLink(paymentLinkUrl: string, paymentId?: string): Promise<string | null> {
  if (!paymentLinkUrl) return null;

  try {
    const urlObj = new URL(paymentLinkUrl);

    // 1. pymnt.app hosted checkout (Used by SumoPod live production)
    if (urlObj.hostname.includes('pymnt.app')) {
      const segments = urlObj.pathname.split('/').filter(Boolean);
      const checkoutId = segments[segments.length - 1];
      if (checkoutId) {
        const checkoutApiUrl = `https://checkout.pymnt.app/api/checkout/${checkoutId}`;
        const res = await fetch(checkoutApiUrl, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(4000),
        });
        if (res.ok) {
          const json = await res.json();
          if (json.paymentCode && String(json.paymentCode).startsWith('000201')) {
            return String(json.paymentCode);
          }
        }
      }
    }

    // 2. SumoPod pay frontend (Used by SumoPod sandbox or custom domain)
    if (urlObj.hostname.includes('sumopod.com') && paymentId) {
      const publicApiUrl = `${urlObj.origin.replace('pay-', 'api-pay-').replace('pay.', 'api-pay.')}/api/v1/public/payments/${paymentId}/checkout`;
      const res = await fetch(publicApiUrl, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.payment_code && String(json.payment_code).startsWith('000201')) {
          return String(json.payment_code);
        }
      }
    }
  } catch (err) {
    console.warn('[SumoPod] Gagal ekstrak QRIS string dari payment link:', (err as Error).message);
  }

  return null;
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

    // Resolve true EMVCo QRIS string (starts with 000201...)
    let resolvedQrisString: string | null = null;

    if (data.payment_code && data.payment_code.startsWith('000201')) {
      resolvedQrisString = data.payment_code;
    } else if (data.payment_link_url) {
      resolvedQrisString = await extractQrisFromPaymentLink(data.payment_link_url, data.payment_id);
    }

    // Fallback: If sandbox or mock string without 000201, build standardized EMVCo payload
    if (!resolvedQrisString || !resolvedQrisString.startsWith('000201')) {
      if (data.payment_code && data.payment_code.startsWith('000201')) {
        resolvedQrisString = data.payment_code;
      } else {
        resolvedQrisString = buildFallbackQrisString(input.orderNumber, input.amountIdr);
      }
    }

    let qrCodeDataUrl: string | undefined;

    if (resolvedQrisString) {
      try {
        qrCodeDataUrl = await QRCode.toDataURL(resolvedQrisString, {
          width: 360,
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
      qrCodeString: resolvedQrisString,
      qrCodeDataUrl,
      paymentUrl: data.payment_link_url,
      expiresAt: data.expires_at || new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString(),
    };
  }

  /**
   * Check payment status by Payment ID / Checkout URL
   */
  async checkPaymentStatus(
    paymentIdOrReference: string,
    paymentUrl?: string
  ): Promise<{ status: 'paid' | 'pending' | 'expired' | 'failed' } | null> {
    try {
      // 1. If we have paymentUrl from checkout.pymnt.app
      if (paymentUrl && paymentUrl.includes('pymnt.app')) {
        const segments = new URL(paymentUrl).pathname.split('/').filter(Boolean);
        const checkoutId = segments[segments.length - 1];
        if (checkoutId) {
          const res = await fetch(`https://checkout.pymnt.app/api/checkout/${checkoutId}`, {
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(3000),
          });
          if (res.ok) {
            const data = await res.json();
            const statusUpper = String(data.status || '').toUpperCase();
            if (statusUpper === 'PAID' || statusUpper === 'COMPLETED' || statusUpper === 'SUCCESS') {
              return { status: 'paid' };
            }
            if (statusUpper === 'EXPIRED') {
              return { status: 'expired' };
            }
            if (statusUpper === 'FAILED' || statusUpper === 'CANCELED') {
              return { status: 'failed' };
            }
            return { status: 'pending' };
          }
        }
      }

      // 2. SumoPod public payment status endpoint
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(paymentIdOrReference);
      if (isUuid) {
        const res = await fetch(`${this.baseUrl}/api/v1/public/payments/${paymentIdOrReference}/checkout`, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          const data = await res.json();
          const s = String(data.status || '').toLowerCase();
          if (s === 'paid' || s === 'completed' || s === 'success') {
            return { status: 'paid' };
          }
          if (s === 'expired') return { status: 'expired' };
          if (s === 'failed' || s === 'cancelled') return { status: 'failed' };
          return { status: 'pending' };
        }
      }
    } catch (err) {
      console.warn('[SumoPod] checkPaymentStatus failed:', (err as Error).message);
    }
    return null;
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
