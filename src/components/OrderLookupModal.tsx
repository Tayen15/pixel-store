import React, { useState } from 'react';
import { actions } from 'astro:actions';
import { X, Search, CheckCircle2, AlertCircle, Copy, Loader2, PackageCheck } from 'lucide-react';

interface OrderLookupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const OrderLookupModal: React.FC<OrderLookupModalProps> = ({ isOpen, onClose }) => {
  const [orderNumber, setOrderNumber] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [orderResult, setOrderResult] = useState<{
    orderNumber: string;
    productName: string;
    quantity: number;
    totalAmountIdr: number;
    status: string;
    licenseCodes: string[];
    createdAt: string | null;
  } | null>(null);

  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  if (!isOpen) return null;

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage('');
    setOrderResult(null);

    try {
      const { data, error } = await actions.getOrderStatus({
        orderNumber: orderNumber.trim(),
      });

      if (error || !data) {
        setErrorMessage(error?.message || 'Pesanan tidak ditemukan. Periksa kembali nomor pesanan Anda.');
        setIsLoading(false);
        return;
      }

      setOrderResult(data);
    } catch (err) {
      setErrorMessage((err as Error).message || 'Terjadi kesalahan sistem');
    } finally {
      setIsLoading(false);
    }
  };

  const copyCode = (code: string, idx: number) => {
    navigator.clipboard.writeText(code);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <PackageCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
              Lacak Pesanan Anda
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <form onSubmit={handleSearch} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Nomor Pesanan (Order ID)
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  placeholder="Contoh: PIXEL-20261004-XXXX"
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value)}
                  className="w-full pl-3.5 pr-10 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100 uppercase"
                />
                <button
                  type="submit"
                  disabled={isLoading}
                  className="absolute right-2 top-2 p-1.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </form>

          {errorMessage && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {orderResult && (
            <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 space-y-3 animate-in fade-in duration-200">
              <div className="p-3 bg-zinc-50 dark:bg-zinc-800/40 rounded-xl space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Status Pesanan:</span>
                  <span
                    className={`font-semibold px-2 py-0.5 rounded-md ${
                      orderResult.status === 'COMPLETED'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                    }`}
                  >
                    {orderResult.status}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Produk:</span>
                  <span className="font-medium text-zinc-900 dark:text-zinc-100 truncate">
                    {orderResult.productName} (x{orderResult.quantity})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Total:</span>
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                    Rp {orderResult.totalAmountIdr.toLocaleString('id-ID')}
                  </span>
                </div>
              </div>

              {/* License Codes if completed */}
              {orderResult.licenseCodes && orderResult.licenseCodes.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Kode Lisensi Digital Anda:
                  </div>
                  {orderResult.licenseCodes.map((code, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-zinc-900 text-zinc-100 rounded-xl border border-zinc-800 flex items-center justify-between text-xs"
                    >
                      <span className="font-mono text-emerald-400 font-bold truncate">{code}</span>
                      <button
                        onClick={() => copyCode(code, idx)}
                        className="p-1 text-zinc-400 hover:text-white transition"
                        title="Salin"
                      >
                        {copiedIndex === idx ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
