export interface InsightProduct {
  id: number;
  name: string;
  category?: string;
  price: string | number; // USDT
  price_usdt?: string | number;
  base_price_usdt?: string | number;
  stock?: number | boolean;
  available?: boolean;
  min_quantity?: number;
  max_quantity?: number;
  description?: string;
  description_text?: string;
  emoji?: string;
  emoji_custom_id?: string;
}

export interface InsightBalance {
  balance_usdt: number;
  balance: number; // in USDT
  currency: 'USDT';
  key_prefix?: string;
  status?: string;
  rate_limit_per_min?: number;
  recent_transactions?: Array<{
    id?: string;
    amount?: number;
    description?: string;
    created_at?: string;
  }>;
}

export interface PlaceOrderPayload {
  product_id: number;
  quantity: number;
}

export interface PlaceOrderResponse {
  order_id: number | string;
  status: 'completed' | 'processing' | 'failed';
  product_id: number;
  quantity: number;
  total_usdt: number;
  codes?: string[]; // The delivered license keys or vouchers
  created_at: string;
}

/**
 * Token bucket rate limiter to protect against exceeding:
 * - 60 requests/minute per key
 * - 10 orders/minute per account
 */
class RateLimiter {
  private lastRefill: number = Date.now();
  private generalTokens: number = 60;
  private orderTokens: number = 10;

  private refill(): void {
    const now = Date.now();
    const elapsedMinutes = (now - this.lastRefill) / 60000;
    if (elapsedMinutes >= 1) {
      this.generalTokens = 60;
      this.orderTokens = 10;
      this.lastRefill = now;
    }
  }

  canMakeGeneralRequest(): boolean {
    this.refill();
    if (this.generalTokens > 0) {
      this.generalTokens--;
      return true;
    }
    return false;
  }

  canPlaceOrder(): boolean {
    this.refill();
    if (this.orderTokens > 0 && this.generalTokens > 0) {
      this.orderTokens--;
      this.generalTokens--;
      return true;
    }
    return false;
  }
}

const limiter = new RateLimiter();

import fs from 'node:fs';
import path from 'node:path';

/**
 * Dynamically resolves the API key at runtime.
 * Reads directly from .env if process.env is stale or empty to avoid 401s during live development.
 */
function getLiveApiKey(fallbackKey?: string): string {
  if (fallbackKey) return fallbackKey;

  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      const match = content.match(/^INSIGHTXPRO_API_KEY=(.+)$/m);
      if (match && match[1]) {
        const key = match[1].trim().replace(/^['"]|['"]$/g, '');
        if (key) {
          process.env.INSIGHTXPRO_API_KEY = key;
          return key;
        }
      }
    }
  } catch {}

  return process.env.INSIGHTXPRO_API_KEY || '';
}

function getLiveBaseUrl(fallbackUrl?: string): string {
  if (fallbackUrl) return fallbackUrl;

  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      const match = content.match(/^INSIGHTXPRO_BASE_URL=(.+)$/m);
      if (match && match[1]) {
        const url = match[1].trim().replace(/^['"]|['"]$/g, '');
        if (url) {
          process.env.INSIGHTXPRO_BASE_URL = url;
          return url;
        }
      }
    }
  } catch {}

  return process.env.INSIGHTXPRO_BASE_URL || 'https://api.insightxpro.store';
}

export class InsightXProClient {
  private readonly _baseUrl?: string;
  private readonly _apiKey?: string;

  constructor(apiKey?: string, baseUrl?: string) {
    this._apiKey = apiKey;
    this._baseUrl = baseUrl;
  }

  get baseUrl(): string {
    return getLiveBaseUrl(this._baseUrl);
  }

  get apiKey(): string {
    return getLiveApiKey(this._apiKey);
  }

  private getHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...extraHeaders,
    };
  }

  /**
   * Check supplier API liveness (no auth needed).
   */
  async checkHealth(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/v1/health`, {
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Fetch wholesale products.
   */
  async getProducts(): Promise<InsightProduct[]> {
    if (!limiter.canMakeGeneralRequest()) {
      throw new Error('Rate limit exceeded: Please wait before requesting catalog again.');
    }

    const res = await fetch(`${this.baseUrl}/api/v1/products`, {
      headers: this.getHeaders(),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to fetch products (${res.status}): ${errText}`);
    }

    const data = await res.json();
    return Array.isArray(data) ? data : data.products || [];
  }

  /**
   * Check current USDT balance and recent ledger.
   */
  async getBalance(): Promise<InsightBalance> {
    if (!limiter.canMakeGeneralRequest()) {
      throw new Error('Rate limit exceeded: Please wait before checking balance again.');
    }

    const res = await fetch(`${this.baseUrl}/api/v1/balance`, {
      headers: this.getHeaders(),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to fetch balance (${res.status}): ${errText}`);
    }

    const raw = await res.json();
    return {
      ...raw,
      balance: Number(raw.balance_usdt ?? raw.balance ?? 0),
      currency: 'USDT',
    };
  }

  /**
   * Place order with strict Idempotency-Key.
   */
  async placeOrder(payload: PlaceOrderPayload, idempotencyKey: string): Promise<PlaceOrderResponse> {
    if (!limiter.canPlaceOrder()) {
      throw new Error('Order rate limit exceeded (max 10 orders/min). Please try again shortly.');
    }

    const res = await fetch(`${this.baseUrl}/api/v1/orders`, {
      method: 'POST',
      headers: this.getHeaders({
        'Idempotency-Key': idempotencyKey,
      }),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Order placement failed (${res.status}): ${errText}`);
    }

    return res.json();
  }

  /**
   * Fetch latest 50 orders.
   */
  async getOrders(): Promise<PlaceOrderResponse[]> {
    const res = await fetch(`${this.baseUrl}/api/v1/orders`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch orders');
    return res.json();
  }

  /**
   * Fetch single order by ID.
   */
  async getOrderById(orderId: string | number): Promise<PlaceOrderResponse> {
    const res = await fetch(`${this.baseUrl}/api/v1/orders/${orderId}`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Order ${orderId} not found`);
    return res.json();
  }
}

export const insightXPro = new InsightXProClient();
