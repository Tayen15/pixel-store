import React, { useState } from 'react';
import {
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  Copy,
  Check,
  RefreshCw,
  ExternalLink,
  MessageCircle,
  X,
  ShieldCheck,
  Receipt,
  RotateCcw,
} from 'lucide-react';
import { actions } from 'astro:actions';

interface OrdersViewProps {
  orders: any[];
  onOrderUpdated: () => void;
  showToast: (type: 'success' | 'error', text: string) => void;
  selectedOrderForModal?: any;
  onClearSelectedOrder?: () => void;
}

export const OrdersView: React.FC<OrdersViewProps> = ({
  orders,
  onOrderUpdated,
  showToast,
  selectedOrderForModal,
  onClearSelectedOrder,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'COMPLETED' | 'PENDING_PAYMENT' | 'CANCELED' | 'FAILED'>('ALL');
  const [inspectOrder, setInspectOrder] = useState<any>(selectedOrderForModal || null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isRefunding, setIsRefunding] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);

  // Sync external selected order if prop changes
  React.useEffect(() => {
    if (selectedOrderForModal) {
      setInspectOrder(selectedOrderForModal);
    }
  }, [selectedOrderForModal]);

  const filteredOrders = orders.filter((o) => {
    const q = searchQuery.toLowerCase().trim();
    const matchQuery =
      !q ||
      o.orderNumber?.toLowerCase().includes(q) ||
      o.customerEmail?.toLowerCase().includes(q) ||
      o.customerWhatsapp?.toLowerCase().includes(q) ||
      o.productName?.toLowerCase().includes(q);

    if (!matchQuery) return false;

    if (statusFilter === 'ALL') return true;
    if (statusFilter === 'COMPLETED') return o.status === 'COMPLETED';
    if (statusFilter === 'PENDING_PAYMENT') return o.status === 'PENDING_PAYMENT';
    if (statusFilter === 'CANCELED') return o.status === 'CANCELED';
    if (statusFilter === 'FAILED') return o.status === 'FAILED_SUPPLIER' || o.status === 'REFUNDED';
    return true;
  });

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(text);
    showToast('success', 'Berhasil menyalin ke clipboard!');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleRetryFulfillment = async (orderId: string) => {
    if (!confirm('Apakah Anda yakin ingin memproses ulang pemenuhan pesanan ini ke supplier?')) return;
    setIsRetrying(true);
    try {
      const { data, error } = await actions.adminRetryOrderFulfillment({ orderId });
      if (error || !data) {
        showToast('error', error?.message || 'Gagal memproses ulang pesanan.');
        return;
      }
      showToast('success', 'Pesanan berhasil diproses dan lisensi telah terbit!');
      onOrderUpdated();
      setInspectOrder(null);
    } catch (err) {
      showToast('error', (err as Error).message);
    } finally {
      setIsRetrying(false);
    }
  };

  const handleMarkRefund = async (orderId: string) => {
    const reason = prompt('Masukkan alasan refund atau nomor rekening pelanggan:');
    if (reason === null) return;
    setIsRefunding(true);
    try {
      const { data, error } = await actions.adminMarkOrderRefunded({ orderId, reason });
      if (error || !data) {
        showToast('error', error?.message || 'Gagal menandai refund.');
        return;
      }
      showToast('success', 'Status pesanan berhasil diubah menjadi REFUNDED.');
      onOrderUpdated();
      setInspectOrder(null);
    } catch (err) {
      showToast('error', (err as Error).message);
    } finally {
      setIsRefunding(false);
    }
  };

  const handleCancelOrder = async (orderId: string) => {
    const reason = prompt('Masukkan alasan pembatalan pesanan (opsional):') || 'Dibatalkan oleh Admin';
    if (reason === null) return;
    setIsCanceling(true);
    try {
      const { data, error } = await actions.adminCancelOrder({ orderId, reason });
      if (error || !data) {
        showToast('error', error?.message || 'Gagal membatalkan pesanan.');
        return;
      }
      showToast('success', 'Status pesanan berhasil diubah menjadi CANCELED.');
      onOrderUpdated();
      setInspectOrder(null);
    } catch (err) {
      showToast('error', (err as Error).message);
    } finally {
      setIsCanceling(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Filters & Search Strip */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {[
            { id: 'ALL', label: `Semua (${orders.length})` },
            { id: 'COMPLETED', label: `Selesai (${orders.filter((o) => o.status === 'COMPLETED').length})` },
            { id: 'PENDING_PAYMENT', label: `Menunggu (${orders.filter((o) => o.status === 'PENDING_PAYMENT').length})` },
            { id: 'CANCELED', label: `Dibatalkan (${orders.filter((o) => o.status === 'CANCELED').length})` },
            { id: 'FAILED', label: `Bermasalah (${orders.filter((o) => o.status === 'FAILED_SUPPLIER' || o.status === 'REFUNDED').length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id as any)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                statusFilter === tab.id
                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-xs'
                  : 'bg-white dark:bg-[#141416] text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search Bar */}
        <div className="relative w-full sm:w-72">
          <input
            type="text"
            placeholder="Cari order, email, WA, produk..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3.5 py-2 rounded-xl text-xs bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition"
          />
          <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-2.5" />
        </div>
      </div>

      {/* Orders Table */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141416] overflow-hidden shadow-xs">
        {filteredOrders.length === 0 ? (
          <div className="text-center py-16 text-xs text-zinc-400 space-y-2">
            <Receipt className="w-8 h-8 text-zinc-300 dark:text-zinc-700 mx-auto" />
            <p>Tidak ada pesanan yang sesuai dengan filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50/70 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 font-semibold">
                <tr>
                  <th className="py-3 px-4">No. Pesanan</th>
                  <th className="py-3 px-4">Waktu</th>
                  <th className="py-3 px-4">Pelanggan</th>
                  <th className="py-3 px-4">Produk</th>
                  <th className="py-3 px-4">Total IDR</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                {filteredOrders.map((o) => {
                  return (
                    <tr key={o.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30 transition">
                      <td className="py-3.5 px-4 font-mono font-bold text-zinc-900 dark:text-white">
                        {o.orderNumber}
                      </td>
                      <td className="py-3.5 px-4 text-zinc-500 whitespace-nowrap">
                        {new Date(o.createdAt).toLocaleDateString('id-ID', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="text-zinc-900 dark:text-zinc-200 font-medium truncate max-w-[140px]">
                          {o.customerEmail}
                        </div>
                        <div className="text-[11px] text-zinc-400 font-mono">
                          {o.customerWhatsapp}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-zinc-800 dark:text-zinc-200 max-w-[180px] truncate">
                        <span className="font-semibold">{o.quantity}x</span> {o.productName}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-zinc-900 dark:text-white whitespace-nowrap">
                        Rp {o.totalAmountIdr?.toLocaleString('id-ID')}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            o.status === 'COMPLETED'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : o.status === 'PENDING_PAYMENT'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                              : o.status === 'CANCELED'
                              ? 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                              : o.status === 'REFUNDED'
                              ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                              : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                          }`}
                        >
                          {o.status === 'COMPLETED'
                            ? 'Selesai'
                            : o.status === 'PENDING_PAYMENT'
                            ? 'Menunggu Bayar'
                            : o.status === 'CANCELED'
                            ? 'Dibatalkan'
                            : o.status === 'REFUNDED'
                            ? 'Direfund'
                            : 'Gagal Supplier'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => setInspectOrder(o)}
                          className="px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-semibold text-zinc-800 dark:text-zinc-200 transition cursor-pointer shadow-2xs"
                        >
                          Kelola
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Slide-over Detail Modal */}
      {inspectOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 rounded-3xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-6 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-zinc-100 dark:border-zinc-800">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-extrabold text-zinc-900 dark:text-white font-mono">
                    {inspectOrder.orderNumber}
                  </h3>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      inspectOrder.status === 'COMPLETED'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : inspectOrder.status === 'PENDING_PAYMENT'
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                        : inspectOrder.status === 'CANCELED'
                        ? 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                        : inspectOrder.status === 'REFUNDED'
                        ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                        : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                    }`}
                  >
                    {inspectOrder.status === 'CANCELED' ? 'Dibatalkan' : inspectOrder.status}
                  </span>
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Dibuat pada {new Date(inspectOrder.createdAt).toLocaleString('id-ID')} WIB
                </p>
              </div>

              <button
                onClick={() => {
                  setInspectOrder(null);
                  if (onClearSelectedOrder) onClearSelectedOrder();
                }}
                className="p-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Customer & Product Grid */}
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80 space-y-1">
                <span className="text-[10px] font-bold text-zinc-400 uppercase">Kontak Pembeli</span>
                <div className="font-semibold text-zinc-900 dark:text-white">{inspectOrder.customerEmail}</div>
                <div className="font-mono text-zinc-500">{inspectOrder.customerWhatsapp}</div>
              </div>

              <div className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80 space-y-1">
                <span className="text-[10px] font-bold text-zinc-400 uppercase">Item Dipesan</span>
                <div className="font-semibold text-zinc-900 dark:text-white truncate">{inspectOrder.productName}</div>
                <div className="text-zinc-500">Jumlah: {inspectOrder.quantity} Akun/Lisensi</div>
              </div>
            </div>

            {/* Financial Breakdown */}
            <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 space-y-2 text-xs">
              <div className="font-bold text-zinc-900 dark:text-white pb-1 border-b border-zinc-200/60 dark:border-zinc-800/60">
                Rincian Kalkulasi Finansial
              </div>
              <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
                <span>Harga Grosir Supplier:</span>
                <span className="font-mono font-medium">${inspectOrder.basePriceUsdt} USDT</span>
              </div>
              <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
                <span>Kurs USDT saat Checkout:</span>
                <span className="font-mono font-medium">Rp {inspectOrder.exchangeRateIdr?.toLocaleString('id-ID')}</span>
              </div>
              <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
                <span>Margin Keuntungan Toko:</span>
                <span className="font-mono font-medium">+{inspectOrder.marginPercent}%</span>
              </div>
              <div className="flex justify-between text-sm font-extrabold text-zinc-900 dark:text-white pt-2 border-t border-zinc-200/60 dark:border-zinc-800/60">
                <span>Total Bayar via QRIS:</span>
                <span className="font-mono text-emerald-600 dark:text-emerald-400">
                  Rp {inspectOrder.totalAmountIdr?.toLocaleString('id-ID')}
                </span>
              </div>
            </div>

            {/* License Codes if Completed */}
            {inspectOrder.licenseCodes && (
              <div className="space-y-2">
                <div className="text-xs font-bold text-zinc-900 dark:text-white flex items-center justify-between">
                  <span>Kode Lisensi / Tautan Akun Terkirim:</span>
                  <span className="text-[10px] text-zinc-400">Siap disalin</span>
                </div>
                {(() => {
                  let codes: string[] = [];
                  try {
                    codes = JSON.parse(inspectOrder.licenseCodes);
                  } catch {
                    codes = [inspectOrder.licenseCodes];
                  }
                  return (
                    <div className="space-y-2">
                      {codes.map((code, idx) => (
                        <div
                          key={idx}
                          className="p-3 rounded-xl border border-emerald-200 dark:border-emerald-800/80 bg-emerald-50/50 dark:bg-emerald-950/20 flex items-center justify-between gap-3 text-xs font-mono font-bold text-emerald-800 dark:text-emerald-300 break-all"
                        >
                          <span className="truncate">{code}</span>
                          <button
                            onClick={() => handleCopy(code)}
                            className="p-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-zinc-900 hover:bg-emerald-100 transition shrink-0 cursor-pointer"
                            title="Salin Kode"
                          >
                            {copiedKey === code ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5 text-zinc-500" />
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Failure Reason if Any */}
            {inspectOrder.failureReason && (
              <div className="p-3 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50/50 dark:bg-red-950/20 text-xs text-red-600 dark:text-red-400 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <strong className="font-bold">Catatan Kendala:</strong> {inspectOrder.failureReason}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-2.5">
              <a
                href={`https://wa.me/${inspectOrder.customerWhatsapp.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                  `Halo, kami dari Pixel Store terkait pesanan ${inspectOrder.orderNumber} (${inspectOrder.productName}).`
                )}`}
                target="_blank"
                rel="noreferrer"
                className="px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-300 transition flex items-center gap-1.5"
              >
                <MessageCircle className="w-3.5 h-3.5 text-emerald-500" />
                <span>Chat WhatsApp</span>
              </a>

              <div className="flex items-center gap-2">
                {inspectOrder.status !== 'CANCELED' && inspectOrder.status !== 'COMPLETED' && (
                  <button
                    onClick={() => handleCancelOrder(inspectOrder.id)}
                    disabled={isCanceling}
                    className="px-3 py-2 rounded-xl border border-rose-200 dark:border-rose-900/60 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-semibold text-rose-600 dark:text-rose-400 transition cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5 inline mr-1" />
                    Batalkan Pesanan
                  </button>
                )}

                {inspectOrder.status !== 'REFUNDED' && (
                  <button
                    onClick={() => handleMarkRefund(inspectOrder.id)}
                    disabled={isRefunding}
                    className="px-3 py-2 rounded-xl border border-purple-200 dark:border-purple-900/60 hover:bg-purple-50 dark:hover:bg-purple-950/40 text-xs font-semibold text-purple-600 dark:text-purple-400 transition cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5 inline mr-1" />
                    Tandai Refund
                  </button>
                )}

                <button
                  onClick={() => handleRetryFulfillment(inspectOrder.id)}
                  disabled={isRetrying}
                  className="px-4 py-2 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 hover:opacity-90 text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
                  <span>{isRetrying ? 'Memproses...' : 'Proses Ulang Supplier'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
