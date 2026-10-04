import crypto from 'node:crypto';
import QRCode from 'qrcode';
import type { CreateInvoiceInput, InvoiceResult, IPaymentGateway } from './adapter';

export interface TakoGiftResponse {
  statusCode: number;
  result?: {
    success: boolean;
    giftId: string;
    transactionId: string;
    paymentUrl: string;
  };
  error?: {
    name: string;
    message: string;
  };
}

export interface TakoTransactionStatusResponse {
  statusCode: number;
  result?: {
    id: string;
    status: 'pending' | 'success' | 'failed' | 'reversed' | 'on_hold';
    amount: number;
    price: number;
    paymentMethod: string;
    paymentUrl?: string | null;
    createdAt: string;
  };
  error?: {
    name: string;
    message: string;
  };
}

export interface TakoGiftStatusResponse {
  statusCode: number;
  result?: {
    id: string;
    status: 'pending' | 'success' | 'failed' | 'reversed' | 'on_hold';
    type: string;
    amount: number;
    message: string | null;
    currency: string | null;
    gifterName: string;
    gifterEmail: string;
    createdAt: string;
  };
  error?: {
    name: string;
    message: string;
  };
}

export class TakoPaymentGateway implements IPaymentGateway {
  private readonly apiKey: string;
  private readonly username: string;
  private readonly webhookSecret?: string;
  private readonly baseUrl: string;

  constructor(
    apiKey: string,
    username: string,
    webhookSecret?: string,
    baseUrl = 'https://tako.id'
  ) {
    this.apiKey = apiKey;
    this.username = username;
    this.webhookSecret = webhookSecret;
    this.baseUrl = baseUrl;
  }

  /**
   * Request QRIS payment via Tako Gift API
   */
  async createQRISInvoice(input: CreateInvoiceInput): Promise<InvoiceResult> {
    const endpoint = `${this.baseUrl}/api/v1/gift/${encodeURIComponent(this.username)}`;
    const expiryMinutes = input.expiryMinutes ?? 15;
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString();

    const payload = {
      name: input.customerEmail.split('@')[0] || 'Customer',
      email: input.customerEmail,
      amount: input.amountIdr,
      paymentMethod: 'qris',
      message: `Pesanan ${input.orderNumber} - ${input.productName.slice(0, 80)}`,
    };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'User-Agent': 'PixelStore/1.0',
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = (await res.json()) as TakoGiftResponse;

    if (!res.ok && res.status !== 206) {
      const errMsg = data.error?.message || `Tako API error (${res.status})`;
      throw new Error(`Gagal membuat pembayaran Tako: ${errMsg}`);
    }

    if (!data.result?.paymentUrl) {
      throw new Error('Tako API tidak mengembalikan paymentUrl untuk QRIS.');
    }

    const reference = data.result.transactionId || data.result.giftId;
    let qrCodeImageUrl: string | undefined;

    // Fast check with retry to obtain direct QRIS image URL from transaction details
    if (data.result.transactionId) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const txDetail = await this.checkTransactionStatus(data.result.transactionId);
          if (txDetail?.paymentUrl && (txDetail.paymentUrl.includes('qr-code') || txDetail.paymentUrl.includes('qris'))) {
            qrCodeImageUrl = txDetail.paymentUrl;
            break;
          }
        } catch {
          // Retry next attempt
        }
        if (attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      }
    }

    let qrCodeDataUrl: string | undefined;

    // If direct QRIS image URL is available (e.g. from Midtrans via Tako),
    // fetch server-side and convert to base64 Data URL to bypass CORS/tracker blocking
    if (qrCodeImageUrl) {
      try {
        const imgRes = await fetch(qrCodeImageUrl, { signal: AbortSignal.timeout(3500) });
        if (imgRes.ok) {
          const contentType = imgRes.headers.get('content-type') || 'image/png';
          const buf = Buffer.from(await imgRes.arrayBuffer());
          qrCodeDataUrl = `data:${contentType};base64,${buf.toString('base64')}`;
        }
      } catch {
        // Fallback below
      }
    }

    // Fallback: Generate real scannable QR Code image from paymentUrl or qrCodeImageUrl
    if (!qrCodeDataUrl) {
      try {
        const qrContent = qrCodeImageUrl || data.result.paymentUrl;
        qrCodeDataUrl = await QRCode.toDataURL(qrContent, {
          width: 320,
          margin: 1,
          errorCorrectionLevel: 'M',
        });
      } catch {
        // Silent fallback
      }
    }

    return {
      gatewayProvider: 'tako',
      gatewayReference: reference,
      qrCodeString: qrCodeImageUrl || data.result.paymentUrl,
      paymentUrl: data.result.paymentUrl,
      qrCodeImageUrl,
      qrCodeDataUrl,
      giftId: data.result.giftId,
      transactionId: data.result.transactionId,
      expiresAt,
    };
  }

  /**
   * Check status of transaction by transactionId
   */
  async checkTransactionStatus(transactionId: string): Promise<TakoTransactionStatusResponse['result'] | null> {
    try {
      const endpoint = `${this.baseUrl}/api/v1/transactions/${encodeURIComponent(transactionId)}`;
      const res = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'User-Agent': 'PixelStore/1.0',
          Accept: 'application/json',
        },
      });

      if (!res.ok) return null;
      const data = (await res.json()) as TakoTransactionStatusResponse;
      return data.result || null;
    } catch {
      return null;
    }
  }

  /**
   * Check status of gift by giftId
   */
  async checkGiftStatus(giftId: string): Promise<TakoGiftStatusResponse['result'] | null> {
    try {
      const endpoint = `${this.baseUrl}/api/v1/gift/${encodeURIComponent(giftId)}`;
      const res = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'User-Agent': 'PixelStore/1.0',
          Accept: 'application/json',
        },
      });

      if (!res.ok) return null;
      const data = (await res.json()) as TakoGiftStatusResponse;
      return data.result || null;
    } catch {
      return null;
    }
  }

  /**
   * Verify Tako webhook payload with timing-safe comparison
   */
  verifyWebhook(rawBody: string, signature: string, incomingSecret?: string): boolean {
    const expected = this.webhookSecret?.trim();
    if (!expected) return true;

    const candidate = (incomingSecret || signature || '').trim();
    if (!candidate) return false;

    try {
      const bufExpected = Buffer.from(expected);
      const bufCandidate = Buffer.from(candidate);
      if (bufExpected.length !== bufCandidate.length) return false;
      return crypto.timingSafeEqual(bufExpected, bufCandidate);
    } catch {
      return false;
    }
  }
}
