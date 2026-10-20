import { getSystemConfig, type PricingSettings } from '@/lib/settings/service';
import { getLiveUsdtRate, type LiveFxResult } from './fx-service';

export type PricingConfig = PricingSettings;

export interface ResolvedPricingConfig extends PricingSettings {
  fxSource?: string;
  fxUpdatedAt?: string;
}

/**
 * Returns dynamic pricing configuration resolved 100% automatically by the system from live market FX feed.
 * Manual rate override is disabled per business rules.
 */
export async function getDynamicPricingConfig(): Promise<ResolvedPricingConfig> {
  const config = await getSystemConfig();
  const pricing = { ...config.pricing, autoFxRate: true };

  try {
    const liveFx = await getLiveUsdtRate();
    // Safety buffer (e.g. +0.5% for currency volatility protection during invoice life)
    const buffer = (pricing.fxBufferPercent || 0.5) / 100;
    const bufferedRate = Math.round(liveFx.rate * (1 + buffer));
    pricing.usdtIdrRate = bufferedRate;

    return {
      ...pricing,
      fxSource: liveFx.source,
      fxUpdatedAt: liveFx.updatedAt,
    };
  } catch (err) {
    console.warn('Realtime FX fetch failed, fallback to environment default rate:', (err as Error).message);
    const fallbackRate = Number(process.env.USDT_IDR_RATE || 17800);
    return {
      ...pricing,
      usdtIdrRate: fallbackRate,
      fxSource: 'fallback',
      fxUpdatedAt: new Date().toISOString(),
    };
  }
}

export interface RetailPriceResult {
  unitPriceIdr: number;
  totalAmountIdr: number;
  exchangeRate: number;
  marginPercent: number;
  gatewayFeePercent: number;
  gatewayFeeIdr: number;
  operationalFeeIdr: number;
  withdrawalFeeIdr?: number;
  supplierNetworkFeeIdr?: number;
  wholesaleCostIdr: number;
  profitAmountIdr: number;
}

/**
 * Calculates final retail price in IDR from base USDT wholesale cost.
 * Refactored Business Formula (SumoPod & Supplier Network Fee Aware):
 * - Base Wholesale Cost (IDR) = basePriceUsdt * exchangeRate
 * - Supplier Network Fee (IDR) = supplierNetworkFeeUsdt * exchangeRate
 * - Total Wholesale Cost (IDR) = Base Wholesale + Supplier Network Fee
 * - Profit Margin (IDR) = Total Wholesale Cost * (marginPercent / 100)
 * - Withdrawal Fee (IDR) = fixedFeeIdr (e.g. Rp 2.500 per withdrawal)
 * - QRIS Gateway Fee (IDR) = (Total Wholesale + Margin + Withdrawal Fee) * (gatewayFeePercent / 100)
 * - Final Unit Price (IDR) = Ceil(Subtotal / roundingStep) * roundingStep
 */
export function calculateRetailPriceIdr(
  basePriceUsdt: number,
  quantity = 1,
  config?: Partial<PricingSettings>
): RetailPriceResult {
  const rate = config?.usdtIdrRate ?? Number(process.env.USDT_IDR_RATE || 17800);
  const margin = config?.marginPercent ?? Number(process.env.PROFIT_MARGIN_PERCENT || 20);
  const gatewayFeePercent = config?.gatewayFeePercent ?? Number(process.env.GATEWAY_FEE_PERCENT || 0.7);
  // Default: Rp 2.500 (SumoPod withdrawal fee ke rekening bank pemilik toko)
  const fixedOperationalFee = config?.fixedFeeIdr ?? Number(process.env.FIXED_PAYMENT_FEE_IDR || 2500);
  // Default: 0.1 USDT (Biaya gas fee/network transfer saldo USDT ke supplier)
  const networkFeeUsdt = config?.supplierNetworkFeeUsdt ?? Number(process.env.SUPPLIER_NETWORK_FEE_USDT || 0.1);
  const rounding = config?.roundingStep ?? 1000;

  // 1. Modal Grosir Produk Supplier (IDR)
  const baseWholesaleIdr = Math.round(basePriceUsdt * rate);

  // 2. Alokasi Biaya Network Transfer Crypto ke Supplier (IDR)
  const supplierNetworkFeeIdr = Math.round(networkFeeUsdt * rate);

  // Total Modal Grosir Riil (Produk + Biaya Transfer Jaringan)
  const wholesaleCostIdr = baseWholesaleIdr + supplierNetworkFeeIdr;

  // 3. Margin Keuntungan Bersih Toko (IDR)
  const profitAmountIdr = Math.round(wholesaleCostIdr * (margin / 100));

  // 4. Subtotal sebelum fee gateway QRIS
  const subtotalBeforeGateway = wholesaleCostIdr + profitAmountIdr + fixedOperationalFee;

  // 5. Alokasi Biaya Transaksi QRIS SumoPod (MDR)
  const gatewayFeeIdr = Math.round(subtotalBeforeGateway * (gatewayFeePercent / 100));
  const operationalFeeIdr = gatewayFeeIdr + fixedOperationalFee;

  // 6. Total harga jual sebelum pembulatan kelipatan seribu
  const rawSubtotalIdr = wholesaleCostIdr + profitAmountIdr + operationalFeeIdr;
  
  const unitPriceIdr = Math.ceil(rawSubtotalIdr / rounding) * rounding;
  const totalAmountIdr = unitPriceIdr * quantity;

  return {
    unitPriceIdr,
    totalAmountIdr,
    exchangeRate: rate,
    marginPercent: margin,
    gatewayFeePercent,
    gatewayFeeIdr,
    operationalFeeIdr,
    withdrawalFeeIdr: fixedOperationalFee,
    supplierNetworkFeeIdr,
    wholesaleCostIdr,
    profitAmountIdr,
  };
}

/**
 * Asynchronously calculates retail price using current realtime database & FX settings.
 */
export async function calculateRetailPriceAsync(
  basePriceUsdt: number,
  quantity = 1
): Promise<RetailPriceResult> {
  const pricingConfig = await getDynamicPricingConfig();
  return calculateRetailPriceIdr(basePriceUsdt, quantity, pricingConfig);
}

/**
 * Formats IDR currency nicely (e.g. "Rp 149.000")
 */
export function formatIdr(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Formats USDT currency (e.g. "$9.50 USDT")
 */
export function formatUsdt(amount: number): string {
  return `${amount.toFixed(2)} USDT`;
}
