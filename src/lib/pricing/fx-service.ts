/**
 * Realtime FX Service for USDT to IDR currency conversion.
 * Features a multi-provider fallback cascade and in-memory caching (TTL 5 minutes).
 */

export interface LiveFxResult {
  rate: number;
  source: 'indodax' | 'coingecko' | 'open-er-api' | 'fallback';
  updatedAt: string;
}

// In-memory cache for live FX rate (5 minutes TTL)
let cachedFxRate: LiveFxResult | null = null;
let lastFetchTime = 0;
const FX_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch live rate from Indodax (Indonesia's largest crypto exchange orderbook)
 */
async function fetchIndodaxRate(): Promise<number | null> {
  try {
    const res = await fetch('https://indodax.com/api/ticker/usdtidr', {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const price = Number(data?.ticker?.last);
    return price > 10000 && price < 30000 ? price : null;
  } catch {
    return null;
  }
}

/**
 * Fetch live rate from CoinGecko (Global Tether to IDR)
 */
async function fetchCoinGeckoRate(): Promise<number | null> {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=idr', {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const price = Math.round(Number(data?.tether?.idr));
    return price > 10000 && price < 30000 ? price : null;
  } catch {
    return null;
  }
}

/**
 * Fetch live rate from Open ER-API (Global USD to IDR benchmark)
 */
async function fetchOpenErRate(): Promise<number | null> {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const price = Math.round(Number(data?.rates?.IDR));
    return price > 10000 && price < 30000 ? price : null;
  } catch {
    return null;
  }
}

/**
 * Fetches the live realtime USDT to IDR exchange rate.
 * Uses Indodax -> CoinGecko -> Open ER-API -> Fallback.
 */
export async function getLiveUsdtRate(forceRefresh = false): Promise<LiveFxResult> {
  const now = Date.now();
  if (!forceRefresh && cachedFxRate && now - lastFetchTime < FX_CACHE_TTL_MS) {
    return cachedFxRate;
  }

  // 1. Try Indodax (Local Indonesian market rate)
  const indodaxPrice = await fetchIndodaxRate();
  if (indodaxPrice) {
    cachedFxRate = {
      rate: indodaxPrice,
      source: 'indodax',
      updatedAt: new Date().toISOString(),
    };
    lastFetchTime = now;
    return cachedFxRate;
  }

  // 2. Try CoinGecko
  const geckoPrice = await fetchCoinGeckoRate();
  if (geckoPrice) {
    cachedFxRate = {
      rate: geckoPrice,
      source: 'coingecko',
      updatedAt: new Date().toISOString(),
    };
    lastFetchTime = now;
    return cachedFxRate;
  }

  // 3. Try Open ER-API
  const erPrice = await fetchOpenErRate();
  if (erPrice) {
    cachedFxRate = {
      rate: erPrice,
      source: 'open-er-api',
      updatedAt: new Date().toISOString(),
    };
    lastFetchTime = now;
    return cachedFxRate;
  }

  // 4. Fallback to environment variable or safe default
  const fallbackPrice = Number(process.env.USDT_IDR_RATE || 17800);
  return {
    rate: fallbackPrice,
    source: 'fallback',
    updatedAt: new Date().toISOString(),
  };
}
