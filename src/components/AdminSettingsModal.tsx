import React, { useState, useEffect } from 'react';
import { actions } from 'astro:actions';
import { 
  X, 
  Settings, 
  RefreshCw, 
  Save, 
  Coins, 
  Sliders, 
  CheckCircle2, 
  AlertCircle, 
  Loader2,
  Database,
  TrendingUp,
  ShieldAlert
} from 'lucide-react';

interface AdminSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsSaved?: () => void;
}

export const AdminSettingsModal: React.FC<AdminSettingsModalProps> = ({
  isOpen,
  onClose,
  onSettingsSaved,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form states
  const [usdtRate, setUsdtRate] = useState(17800);
  const [autoFxRate, setAutoFxRate] = useState(true);
  const [fxBufferPercent, setFxBufferPercent] = useState(0.5);
  const [marginPercent, setMarginPercent] = useState(15);
  const [fixedFee, setFixedFee] = useState(1500);

  // Supplier & Live FX status
  const [supplierData, setSupplierData] = useState<{
    balanceUsdt: number;
    status: string;
    syncedProductCount: number;
  } | null>(null);

  const [liveFx, setLiveFx] = useState<{
    rate: number;
    source: string;
    updatedAt: string;
  } | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const loadSettings = async () => {
      setIsLoading(true);
      setMessage(null);
      try {
        const { data, error } = await actions.getAdminSettings();
        if (!error && data) {
          setUsdtRate(data.config.pricing.usdtIdrRate);
          setAutoFxRate(data.config.pricing.autoFxRate ?? true);
          setFxBufferPercent(data.config.pricing.fxBufferPercent ?? 0.5);
          setMarginPercent(data.config.pricing.marginPercent);
          setFixedFee(data.config.pricing.fixedFeeIdr);
          setSupplierData(data.supplier);
          if (data.liveFx) {
            setLiveFx(data.liveFx);
          }
        }
      } catch (err) {
        console.error('Error fetching admin settings:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSavePricing = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setMessage(null);

    try {
      const { data, error } = await actions.updatePricingSettings({
        usdtIdrRate: Number(usdtRate),
        autoFxRate,
        fxBufferPercent: Number(fxBufferPercent),
        marginPercent: Number(marginPercent),
        fixedFeeIdr: Number(fixedFee),
      });

      if (error || !data) {
        setMessage({ type: 'error', text: error?.message || 'Gagal menyimpan konfigurasi' });
        return;
      }

      setMessage({ type: 'success', text: 'Pengaturan berhasil disimpan dan harga seluruh katalog diperbarui dengan kurs realtime!' });
      if (onSettingsSaved) onSettingsSaved();
    } catch (err) {
      setMessage({ type: 'error', text: (err as Error).message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSyncCatalog = async () => {
    setIsSyncing(true);
    setMessage(null);

    try {
      const { data, error } = await actions.syncCatalogNow();
      if (error || !data) {
        setMessage({ type: 'error', text: error?.message || 'Gagal sinkronisasi katalog' });
        return;
      }

      setMessage({ type: 'success', text: `Berhasil sinkronisasi ${data.count} produk dari InsightXPro dengan kurs realtime!` });
      if (onSettingsSaved) onSettingsSaved();
    } catch (err) {
      setMessage({ type: 'error', text: (err as Error).message });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-zinc-900 dark:text-zinc-100" />
            <div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                Pengaturan Kurs Realtime & Reseller
              </h3>
              <p className="text-xs text-zinc-500">Konversi otomatis USDT ke IDR dari pasar live</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {message && (
            <div
              className={`p-3 rounded-xl border flex items-center gap-2 text-xs ${
                message.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                  : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
              }`}
            >
              {message.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{message.text}</span>
            </div>
          )}

          {/* Realtime Live FX Indicator */}
          <div className="p-4 bg-emerald-50/70 dark:bg-emerald-950/30 rounded-xl border border-emerald-200/80 dark:border-emerald-800/60 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                Live Market Rate (USDT $\rightarrow$ IDR)
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-200 dark:bg-emerald-900 text-emerald-900 dark:text-emerald-200">
                {liveFx?.source || 'Indodax'}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <div className="text-2xl font-black text-emerald-950 dark:text-emerald-100 font-mono">
                {liveFx ? `Rp ${liveFx.rate.toLocaleString('id-ID')}` : 'Mengambil kurs...'}
                <span className="text-xs font-normal text-emerald-700 dark:text-emerald-400 ml-1">/ USDT</span>
              </div>
              <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                Pembaruan otomatis tiap 5 menit
              </div>
            </div>
          </div>

          {/* Supplier Live Status Widget */}
          <div className="p-3.5 bg-zinc-50 dark:bg-zinc-800/40 rounded-xl border border-zinc-200/70 dark:border-zinc-700/60 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <Coins className="w-4 h-4 text-amber-500" />
              <span className="font-medium text-zinc-700 dark:text-zinc-300">Saldo Upstream InsightXPro:</span>
              <span className="font-bold text-zinc-900 dark:text-zinc-100">
                {supplierData ? `${supplierData.balanceUsdt.toFixed(2)} USDT` : '...'}
              </span>
            </div>
            <span className="text-zinc-400">
              {supplierData ? `${supplierData.syncedProductCount} Produk` : ''}
            </span>
          </div>

          {/* Pricing Config Form */}
          <form onSubmit={handleSavePricing} className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                <div className="flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Pengaturan Konversi Kurs</span>
                </div>
              </div>

              {/* Mode Toggle: Auto Realtime vs Manual */}
              <div className="p-3 bg-zinc-50 dark:bg-zinc-800/60 rounded-xl border border-zinc-200 dark:border-zinc-700 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                    Mode Kurs Realtime Otomatis
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    Otomatis mengikuti fluktuasi kurs pasar crypto (Indodax & CoinGecko)
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoFxRate}
                    onChange={(e) => setAutoFxRate(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-zinc-300 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>

              {autoFxRate ? (
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">
                    Buffer Volatilitas Kurs (%) — Proteksi Fluktuasi Saat Checkout
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      max="10"
                      step="0.1"
                      required
                      value={fxBufferPercent}
                      onChange={(e) => setFxBufferPercent(Number(e.target.value))}
                      className="w-full pl-3 pr-8 py-2 rounded-xl text-xs bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white font-mono"
                    />
                    <span className="absolute right-3 top-2.5 text-xs text-zinc-400 font-semibold">%</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-1">
                    Misal: 0.5% buffer ditambahkan ke kurs live agar keuntungan tetap aman jika kurs bergerak saat QRIS dibayar.
                  </p>
                </div>
              ) : (
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">
                    Kurs Manual 1 USDT ke IDR (Rupiah)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-xs text-zinc-400 font-semibold">Rp</span>
                    <input
                      type="number"
                      min="10000"
                      max="30000"
                      step="50"
                      required
                      value={usdtRate}
                      onChange={(e) => setUsdtRate(Number(e.target.value))}
                      className="w-full pl-9 pr-3.5 py-2 rounded-xl text-xs bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white font-mono"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">
                    Margin Keuntungan (%)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      required
                      value={marginPercent}
                      onChange={(e) => setMarginPercent(Number(e.target.value))}
                      className="w-full pl-3 pr-8 py-2 rounded-xl text-xs bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white font-mono"
                    />
                    <span className="absolute right-3 top-2.5 text-xs text-zinc-400 font-semibold">%</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-zinc-500 mb-1">
                    Biaya Layanan/Fee (IDR)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-xs text-zinc-400 font-semibold">Rp</span>
                    <input
                      type="number"
                      min="0"
                      max="50000"
                      step="500"
                      required
                      value={fixedFee}
                      onChange={(e) => setFixedFee(Number(e.target.value))}
                      className="w-full pl-9 pr-3.5 py-2 rounded-xl text-xs bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSaving || isLoading}
              className="w-full py-2.5 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 font-semibold rounded-xl text-xs transition flex items-center justify-center gap-2 shadow-xs"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Menyimpan & Menghitung Ulang Kurs Realtime...</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Simpan & Terapkan Kurs Realtime</span>
                </>
              )}
            </button>
          </form>

          {/* Quick Catalog Sync Action */}
          <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5" />
                <span>Sinkronisasi Katalog Supplier</span>
              </div>
              <div className="text-[11px] text-zinc-400">
                Tarik harga produk terbaru dari API InsightXPro
              </div>
            </div>

            <button
              type="button"
              onClick={handleSyncCatalog}
              disabled={isSyncing}
              className="py-1.5 px-3 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-lg text-xs font-semibold transition flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Sinkronisasi...' : 'Tarik Sekarang'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
