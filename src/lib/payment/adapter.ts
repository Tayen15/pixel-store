import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { getSystemConfig } from '@/lib/settings/service';

export interface CreateInvoiceInput {
  orderNumber: string;
  amountIdr: number;
  customerEmail: string;
  customerWhatsapp: string;
  productName: string;
  expiryMinutes?: number;
}

export interface InvoiceResult {
  gatewayProvider: string;
  gatewayReference: string;
  qrCodeString: string;
  paymentUrl?: string;
  qrCodeImageUrl?: string;
  qrCodeDataUrl?: string;
  giftId?: string;
  transactionId?: string;
  expiresAt: string;
}

export interface IPaymentGateway {
  createQRISInvoice(input: CreateInvoiceInput): Promise<InvoiceResult>;
  verifyWebhook(rawBody: string, signature: string, secret?: string): boolean;
}

/**
 * Mock / Sandbox QRIS Adapter for local testing and zero-friction development.
 */
export class MockPaymentGateway implements IPaymentGateway {
  async createQRISInvoice(input: CreateInvoiceInput): Promise<InvoiceResult> {
    const config = await getSystemConfig();
    const expiryMinutes = input.expiryMinutes ?? config.orders.expiryMinutes;
    const storeName = config.store.storeName;
    const nmid = config.store.qrisNmid;

    const reference = `MOCK-QRIS-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString();
    
    // Standard EMVCo QRIS test payload with dynamic store data
    const qrCodeString = `00020101021226590014ID.LINKAJA.WWW01189360091438312061210208${input.orderNumber}51440014ID.CO.QRIS.WWW0215${nmid}52045411530336054${input.amountIdr}5802ID5911${storeName.padEnd(11).slice(0, 11)}6007JAKARTA62070703A016304`;

    let qrCodeDataUrl: string | undefined;
    try {
      qrCodeDataUrl = await QRCode.toDataURL(qrCodeString, {
        width: 320,
        margin: 1,
        errorCorrectionLevel: 'M',
      });
    } catch {}

    return {
      gatewayProvider: 'mock',
      gatewayReference: reference,
      qrCodeString,
      qrCodeDataUrl,
      expiresAt,
    };
  }

  verifyWebhook(_rawBody: string, _signature: string): boolean {
    return true;
  }
}

/**
 * Tripay QRIS Payment Gateway Adapter
 */
export class TripayPaymentGateway implements IPaymentGateway {
  private readonly apiKey: string;
  private readonly privateKey: string;
  private readonly merchantCode: string;
  private readonly isSandbox: boolean;

  constructor(apiKey: string, privateKey: string, merchantCode: string, isSandbox = true) {
    this.apiKey = apiKey;
    this.privateKey = privateKey;
    this.merchantCode = merchantCode;
    this.isSandbox = isSandbox;
  }

  private get endpoint(): string {
    return this.isSandbox
      ? 'https://tripay.co.id/api-sandbox/transaction/create'
      : 'https://tripay.co.id/api/transaction/create';
  }

  async createQRISInvoice(input: CreateInvoiceInput): Promise<InvoiceResult> {
    const config = await getSystemConfig();
    const expiryMinutes = input.expiryMinutes ?? config.orders.expiryMinutes;
    const expiry = Math.floor(Date.now() / 1000) + expiryMinutes * 60;
    
    const signature = crypto
      .createHmac('sha256', this.privateKey)
      .update(this.merchantCode + input.orderNumber + input.amountIdr)
      .digest('hex');

    const payload = {
      method: 'QRIS2',
      merchant_ref: input.orderNumber,
      amount: input.amountIdr,
      customer_name: input.customerEmail.split('@')[0],
      customer_email: input.customerEmail,
      customer_phone: input.customerWhatsapp,
      order_items: [
        {
          name: input.productName,
          price: input.amountIdr,
          quantity: 1,
        },
      ],
      expired_time: expiry,
      signature,
    };

    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Tripay invoice creation failed: ${err}`);
    }

    const data = await res.json();
    let qrCodeDataUrl: string | undefined;
    try {
      qrCodeDataUrl = await QRCode.toDataURL(data.data.qr_string, {
        width: 320,
        margin: 1,
        errorCorrectionLevel: 'M',
      });
    } catch {}

    return {
      gatewayProvider: 'tripay',
      gatewayReference: data.data.reference,
      qrCodeString: data.data.qr_string,
      qrCodeDataUrl,
      expiresAt: new Date(data.data.expired_time * 1000).toISOString(),
    };
  }

  verifyWebhook(rawBody: string, signature: string): boolean {
    const computedSignature = crypto
      .createHmac('sha256', this.privateKey)
      .update(rawBody)
      .digest('hex');
    return computedSignature === signature;
  }
}

import fs from 'node:fs';
import path from 'node:path';
import { TakoPaymentGateway } from './tako';

function getEnv(key: string): string {
  if (process.env[key]) return process.env[key]!;
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          const idx = trimmed.indexOf('=');
          const k = trimmed.slice(0, idx).trim();
          const v = trimmed.slice(idx + 1).trim();
          if (k === key) {
            process.env[key] = v;
            return v;
          }
        }
      }
    }
  } catch {}
  return '';
}

/**
 * Factory to return the active payment gateway based on environment variables.
 */
export function getPaymentGateway(): IPaymentGateway {
  const takoApiKey = getEnv('TAKO_API_KEY');
  const takoUsername = getEnv('TAKO_USERNAME');
  const takoWebhookSecret = getEnv('TAKO_WEBHOOK_SECRET');

  if (takoApiKey && takoUsername) {
    return new TakoPaymentGateway(takoApiKey, takoUsername, takoWebhookSecret);
  }

  const tripayApiKey = getEnv('TRIPAY_API_KEY');
  const tripayPrivateKey = getEnv('TRIPAY_PRIVATE_KEY');
  const tripayMerchant = getEnv('TRIPAY_MERCHANT_CODE');

  if (tripayApiKey && tripayPrivateKey && tripayMerchant) {
    return new TripayPaymentGateway(tripayApiKey, tripayPrivateKey, tripayMerchant, process.env.NODE_ENV !== 'production');
  }

  return new MockPaymentGateway();
}


