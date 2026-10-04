import React from 'react';
import {
  Coins,
  TrendingUp,
  Receipt,
  Layers,
  ArrowUpRight,
  ShieldCheck,
  CheckCircle2,
  Clock,
  AlertCircle,
  Eye,
  RefreshCw,
} from 'lucide-react';
import { ServiceLogo } from '../../ServiceLogo';
import type { AdminTab } from '../AdminSidebar';

interface OverviewViewProps {
  orders: any[];
  products: any[];
  supplier: { balanceUsdt: number; status: string };
  liveFx: { rate: number; source: string; updatedAt?: string };
  marginPercent: number;
  gatewayFeePercent: number;
  onNavigateTab: (tab: AdminTab) => void;
  onSelectOrder: (order: any) => void;
  onRefreshFx: () => void;
  isRefreshingFx: boolean;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  orders,
  products,
  supplier,
  liveFx,
  marginPercent,
  gatewayFeePercent,
  onNavigateTab,
  onSelectOrder,
  onRefreshFx,
  isRefreshingFx,
}) => {
  // Compute analytics
  const completedOrders = orders.filter((o) => o.status === 'COMPLETED');
  const pendingOrders = orders.filter((o) => o.status === 'PENDING_PAYMENT');
  const failedOrders = orders.filter((o) => o.status === 'FAILED_SUPPLIER' || o.status === 'REFUNDED');

  const totalGrossRevenueIdr = completedOrders.reduce(
    (sum, o) => sum + (o.totalAmountIdr || 0),
    0
  );

  // Approximate Net Profit = Total Gross - (Wholesale Cost USDT * FX) - (Gross * Tako Fee %)
  const totalNetProfitIdr = completedOrders.reduce((sum, o) => {
    const wholesaleIdr = (o.basePriceUsdt || 0) * (o.exchangeRateIdr || liveFx.rate);
    const takoFeeIdr = (o.totalAmountIdr || 0) * ((gatewayFeePercent || 5.0) / 100);
    const profit = (o.totalAmountIdr || 0) - wholesaleIdr - takoFeeIdr;
    return sum + (profit > 0 ? profit : 0);
  }, 0);

  const recentFiveOrders = orders.slice(0, 5);

  return (
    <div className="space-y-6">
      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Omzet */}
        <div className="p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141416] space-y-2 shadow-xs">
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span className="flex items-center gap-1.5 font-medium text-zinc-700 dark:text-zinc-300">
              <Receipt className="w-4 h-4 text-blue-500" />
              Total Omzet Penjualan
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
              {completedOrders.length} Sukses
            </span>
          </div>
          <div className="font-mono text-2xl font-black text-zinc-900 dark:text-white">
            Rp {totalGrossRevenueIdr.toLocaleString('id-ID')}
          </div>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
            Akumulasi transaksi berhasil via QRIS Tako.
          </p>
        </div>

        {/* Card 2: Estimasi Laba Bersih */}
        <div className="p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141416] space-y-2 shadow-xs">
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span className="flex items-center gap-1.5 font-medium text-zinc-700 dark:text-zinc-300">
              <TrendingUp className="w-4 h-4 text-emerald-500" />
              Estimasi Laba Bersih
            </span>
            <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
              Margin {marginPercent}%
            </span>
          </div>
          <div className="font-mono text-2xl font-black text-emerald-600 dark:text-emerald-400">
            Rp {Math.round(totalNetProfitIdr).toLocaleString('id-ID')}
          </div>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
            Setelah dipotong modal supplier & fee Tako ({gatewayFeePercent}%).
          </p>
        </div>

        {/* Card 3: Saldo Supplier */}
        <div className="p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141416] space-y-2 shadow-xs">
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span className="flex items-center gap-1.5 font-medium text-zinc-700 dark:text-zinc-300">
              <Coins className="w-4 h-4 text-amber-500" />
              Saldo Dompet Supplier
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              {supplier.status === 'active' ? 'Aktif' : 'Offline'}
            </span>
          </div>
          <div className="font-mono text-2xl font-black text-zinc-900 dark:text-white">
            ${supplier.balanceUsdt.toFixed(2)}{' '}
            <span className="text-xs font-medium text-zinc-400">USDT</span>
          </div>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
            Saldo InsightXPro untuk pemenuhan lisensi otomatis.
          </p>
        </div>

        {/* Card 4: Kurs Nilai Tukar Hari Ini */}
        <div className="p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141416] space-y-2 shadow-xs">
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span className="flex items-center gap-1.5 font-medium text-zinc-700 dark:text-zinc-300">
              <ShieldCheck className="w-4 h-4 text-purple-500" />
              Kurs Pasar Realtime
            </span>
            <button
              onClick={onRefreshFx}
              disabled={isRefreshingFx}
              className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
              title="Segarkan Kurs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingFx ? 'animate-spin text-purple-500' : ''}`} />
            </button>
          </div>
          <div className="font-mono text-2xl font-black text-zinc-900 dark:text-white">
            Rp {liveFx.rate?.toLocaleString('id-ID')}
          </div>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
            Pasar {liveFx.source || 'Indodax'} (Sinkron otomatis).
          </p>
        </div>
      </div>

      {/* Order Status Distribution Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-zinc-900 dark:text-white">
                Pesanan Sukses
              </div>
              <div className="text-[11px] text-zinc-500">Lisensi terkirim</div>
            </div>
          </div>
          <div className="font-mono text-xl font-black text-emerald-600 dark:text-emerald-400">
            {completedOrders.length}
          </div>
        </div>

        <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-900/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-zinc-900 dark:text-white">
                Menunggu Pembayaran
              </div>
              <div className="text-[11px] text-zinc-500">QRIS aktif</div>
            </div>
          </div>
          <div className="font-mono text-xl font-black text-amber-600 dark:text-amber-400">
            {pendingOrders.length}
          </div>
        </div>

        <div className="p-4 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-red-100 dark:bg-red-900/60 text-red-600 dark:text-red-400 flex items-center justify-center">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-zinc-900 dark:text-white">
                Perlu Perhatian
              </div>
              <div className="text-[11px] text-zinc-500">Gagal / Refund</div>
            </div>
          </div>
          <div className="font-mono text-xl font-black text-red-600 dark:text-red-400">
            {failedOrders.length}
          </div>
        </div>
      </div>

      {/* Main Grid: Recent Orders & Catalog Highlights */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Recent 5 Orders */}
        <div className="lg:col-span-2 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141416] space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                Pesanan Terbaru Masuk
              </h3>
              <p className="text-xs text-zinc-500">5 transaksi terakhir pelanggan</p>
            </div>
            <button
              onClick={() => onNavigateTab('orders')}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
            >
              <span>Lihat Semua Pesanan</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {recentFiveOrders.length === 0 ? (
            <div className="text-center py-10 text-xs text-zinc-400">
              Belum ada pesanan masuk.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-100 dark:border-zinc-800 text-zinc-400 font-semibold">
                    <th className="pb-2.5">No. Pesanan</th>
                    <th className="pb-2.5">Produk</th>
                    <th className="pb-2.5">Nominal</th>
                    <th className="pb-2.5">Status</th>
                    <th className="pb-2.5 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                  {recentFiveOrders.map((o) => (
                    <tr key={o.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/40 transition">
                      <td className="py-3 font-mono font-bold text-zinc-900 dark:text-white">
                        {o.orderNumber}
                      </td>
                      <td className="py-3 text-zinc-700 dark:text-zinc-300 max-w-[180px] truncate">
                        {o.productName}
                      </td>
                      <td className="py-3 font-mono font-semibold text-zinc-900 dark:text-white">
                        Rp {o.totalAmountIdr?.toLocaleString('id-ID')}
                      </td>
                      <td className="py-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            o.status === 'COMPLETED'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : o.status === 'PENDING_PAYMENT'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                              : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                          }`}
                        >
                          {o.status === 'COMPLETED'
                            ? 'Selesai'
                            : o.status === 'PENDING_PAYMENT'
                            ? 'Menunggu'
                            : 'Gagal'}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <button
                          onClick={() => onSelectOrder(o)}
                          className="px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 transition"
                        >
                          Detail
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right: Quick Catalog Status */}
        <div className="p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141416] space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                Katalog Unggulan
              </h3>
              <p className="text-xs text-zinc-500">{products.length} produk tersinkron</p>
            </div>
            <button
              onClick={() => onNavigateTab('catalog')}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
            >
              <span>Kelola</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-2.5">
            {[...products]
              .sort((a, b) => {
                if (a.isTopProduct && !b.isTopProduct) return -1;
                if (!a.isTopProduct && b.isTopProduct) return 1;
                return 0;
              })
              .slice(0, 5)
              .map((p) => (
                <div
                  key={p.id}
                  className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition ${
                    p.isTopProduct
                      ? 'border-amber-200/80 dark:border-amber-900/40 bg-amber-50/20 dark:bg-amber-950/10'
                      : 'border-zinc-100 dark:border-zinc-800'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0 overflow-hidden">
                      <ServiceLogo name={p.name} imageUrl={p.imageUrl} size="sm" />
                    </div>
                    <div className="truncate">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-zinc-900 dark:text-white truncate">
                          {p.name}
                        </span>
                        {p.isTopProduct && (
                          <span className="px-1.5 py-0.2 rounded-md text-[9px] font-black bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 shrink-0">
                            TOP ⭐
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-zinc-400 font-mono">
                        Stok: {p.stock ?? 0} unit
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0 font-mono text-xs font-bold text-zinc-900 dark:text-white">
                    Rp {p.retailPriceIdr?.toLocaleString('id-ID')}
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
};
