import React, { useState } from 'react';
import {
  Zap,
  TrendingUp,
  Percent,
  Sliders,
  Save,
  Calculator,
  RefreshCw,
  Coins,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import { actions } from 'astro:actions';
import { ServiceLogo } from '../../ServiceLogo';

interface PricingEngineViewProps {
  config: any;
  liveFx: { rate: number; source: string; updatedAt?: string };
  products: any[];
  onConfigSaved: () => void;
  showToast: (type: 'success' | 'error', text: string) => void;
  onRefreshFx: () => void;
  isRefreshingFx: boolean;
}

export const PricingEngineView: React.FC<PricingEngineViewProps> = ({
  config,
  liveFx,
  products,
  onConfigSaved,
  showToast,
  onRefreshFx,
  isRefreshingFx,
}) => {
  const [fxBufferPercent, setFxBufferPercent] = useState<number>(
    config?.pricing?.fxBufferPercent ?? 0.5
  );
  const [marginPercent, setMarginPercent] = useState<number>(
    config?.pricing?.marginPercent ?? 20
  );
  const [gatewayFeePercent, setGatewayFeePercent] = useState<number>(
    config?.pricing?.gatewayFeePercent ?? 5.0
  );
  const [fixedFee, setFixedFee] = useState<number>(
    config?.pricing?.fixedFeeIdr ?? 0
  );
  const [simUsdt, setSimUsdt] = useState<number>(1.0);
  const [isSaving, setIsSaving] = useState(false);

  // Live Simulator Calculations
  const currentFxRate = liveFx?.rate ?? 17879;
  const effectiveFxRate = Math.round(
    currentFxRate * (1 + (Number(fxBufferPercent) || 0) / 100)
  );
  const simCostIdr = Math.round(simUsdt * effectiveFxRate);
  const simMarginIdr = Math.round(
    simCostIdr * ((Number(marginPercent) || 0) / 100)
  );
  const simFixedIdr = Number(fixedFee) || 0;
  const simSubtotalPreTako = simCostIdr + simMarginIdr + simFixedIdr;
  const simTakoFeeIdr = Math.round(
    simSubtotalPreTako * ((Number(gatewayFeePercent) || 0) / 100)
  );
  const simRawRetail = simSubtotalPreTako + simTakoFeeIdr;
  const simRetailPrice = Math.ceil(simRawRetail / 1000) * 1000;
  const simRoundingSurplus = simRetailPrice - simRawRetail;
  const simNetProfit = simMarginIdr + simRoundingSurplus;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const { data, error } = await actions.updatePricingSettings({
        fxBufferPercent: Number(fxBufferPercent),
        marginPercent: Number(marginPercent),
        gatewayFeePercent: Number(gatewayFeePercent),
        fixedFeeIdr: Number(fixedFee),
      });

      if (error || !data) {
        showToast('error', error?.message || 'Gagal menyimpan pengaturan.');
        return;
      }

      showToast(
        'success',
        'Pengaturan harga disimpan! Seluruh 39 katalog toko telah diperbarui.'
      );
      onConfigSaved();
    } catch (err) {
      showToast('error', (err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Main Grid: Form Controls & Live Simulator */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Configuration Form */}
        <div className="p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141416] space-y-6 shadow-xs">
          <div className="border-b border-zinc-100 dark:border-zinc-800 pb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-emerald-500" />
                <span>Parameter Margin & Biaya</span>
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                Konfigurasi margin profit dan alokasi biaya operasional
              </p>
            </div>
            <button
              type="button"
              onClick={onRefreshFx}
              disabled={isRefreshingFx}
              className="px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-xs font-semibold text-zinc-700 dark:text-zinc-300 transition flex items-center gap-1.5 shrink-0 cursor-pointer shadow-2xs"
              title="Segarkan Kurs Pasar Realtime"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingFx ? 'animate-spin' : ''}`} />
              <span>Segarkan Kurs</span>
            </button>
          </div>

          <form onSubmit={handleSave} className="space-y-5">
            {/* Margin Laba Bersih */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label className="font-semibold text-zinc-800 dark:text-zinc-200">
                  Target Laba Bersih Toko (%):
                </label>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                  {marginPercent}%
                </span>
              </div>
              <input
                type="range"
                min="5"
                max="50"
                step="1"
                value={marginPercent}
                onChange={(e) => setMarginPercent(Number(e.target.value))}
                className="w-full accent-emerald-500 cursor-pointer"
              />
              <p className="text-[11px] text-zinc-400">
                Persentase keuntungan bersih murni yang masuk ke kantong toko setelah semua biaya tertutupi.
              </p>
            </div>

            {/* Biaya Penarikan Tako */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label className="font-semibold text-zinc-800 dark:text-zinc-200">
                  Tier Biaya Penarikan Dana Tako (%):
                </label>
                <span className="font-mono font-bold text-blue-600 dark:text-blue-400 text-sm">
                  {gatewayFeePercent}%
                </span>
              </div>
              <select
                value={gatewayFeePercent}
                onChange={(e) => setGatewayFeePercent(Number(e.target.value))}
                className="w-full px-3.5 py-2 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white font-medium focus:outline-none"
              >
                <option value={5.0}>Tier Normal (5.0% - Penarikan Reguler)</option>
                <option value={4.9}>Tier Silver (4.9% - Penarikan &gt; Rp 1 Juta)</option>
                <option value={4.8}>Tier Gold (4.8% - Penarikan &gt; Rp 3 Juta)</option>
                <option value={4.7}>Tier Platinum (4.7% - Penarikan &gt; Rp 5 Juta)</option>
                <option value={4.6}>Tier Diamond (4.6% - Penarikan &gt; Rp 8 Juta)</option>
                <option value={4.5}>Tier VIP (4.5% - Penarikan &gt; Rp 10 Juta)</option>
              </select>
              <p className="text-[11px] text-zinc-400">
                Otomatis dihitung ke harga jual pembeli agar margin toko tidak terpotong saat menarik saldo Tako ke rekening bank.
              </p>
            </div>

            {/* Proteksi Buffer Slippage FX */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label className="font-semibold text-zinc-800 dark:text-zinc-200">
                  Proteksi Fluktuasi Kurs (Buffer %):
                </label>
                <span className="font-mono font-bold text-purple-600 dark:text-purple-400 text-sm">
                  +{fxBufferPercent}%
                </span>
              </div>
              <input
                type="number"
                step="0.1"
                min="0"
                max="5"
                value={fxBufferPercent}
                onChange={(e) => setFxBufferPercent(Number(e.target.value))}
                className="w-full px-3.5 py-2 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white font-mono"
              />
              <p className="text-[11px] text-zinc-400">
                Penyangga kurs untuk mengantisipasi selisih harga beli USDT saat store admin melakukan top-up dompet supplier.
              </p>
            </div>

            {/* Fixed Operational Fee */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label className="font-semibold text-zinc-800 dark:text-zinc-200">
                  Biaya Operasional Tetap (IDR):
                </label>
                <span className="font-mono font-bold text-zinc-900 dark:text-white text-sm">
                  Rp {fixedFee.toLocaleString('id-ID')}
                </span>
              </div>
              <input
                type="number"
                step="500"
                min="0"
                value={fixedFee}
                onChange={(e) => setFixedFee(Number(e.target.value))}
                className="w-full px-3.5 py-2 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white font-mono"
              />
              <p className="text-[11px] text-zinc-400">
                Biaya flat tambahan opsional per transaksi (misal Rp 0 atau cadangan fee transfer bank Rp 5.000).
              </p>
            </div>

            <button
              type="submit"
              disabled={isSaving}
              className="w-full py-2.5 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 hover:opacity-90 text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Menyimpan & Menghitung Ulang...' : 'Simpan & Perbarui Seluruh Katalog'}</span>
            </button>
          </form>
        </div>

        {/* Right: Realtime Interactive Pricing Simulator */}
        <div className="p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141416] space-y-5 shadow-xs">
          <div className="border-b border-zinc-100 dark:border-zinc-800 pb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <Calculator className="w-4 h-4 text-blue-500" />
                <span>Simulator Transparansi Harga Realtime</span>
              </h3>
              <p className="text-xs text-zinc-500">
                Lihat rincian pembentukan harga Rupiah sebelum diterapkan
              </p>
            </div>

            <div className="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1 rounded-xl">
              <span className="text-[10px] text-zinc-400 font-medium">Tes Nominal:</span>
              <input
                type="number"
                step="0.5"
                min="0.1"
                value={simUsdt}
                onChange={(e) => setSimUsdt(Number(e.target.value))}
                className="w-14 bg-transparent text-right font-mono font-bold text-xs text-zinc-900 dark:text-white focus:outline-none"
              />
              <span className="text-[10px] font-bold text-zinc-500">USDT</span>
            </div>
          </div>

          {/* Breakdown Card */}
          <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40 space-y-2.5 text-xs">
            <div className="flex justify-between">
              <span className="text-zinc-500">1. Modal Grosir Supplier:</span>
              <span className="font-mono font-medium text-zinc-900 dark:text-white">
                ${simUsdt.toFixed(2)} USDT &times; Rp {effectiveFxRate.toLocaleString('id-ID')} ={' '}
                <strong className="font-bold">Rp {simCostIdr.toLocaleString('id-ID')}</strong>
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-zinc-500">2. Laba Bersih Toko ({marginPercent}%):</span>
              <span className="font-mono font-medium text-emerald-600 dark:text-emerald-400">
                +Rp {simMarginIdr.toLocaleString('id-ID')}
              </span>
            </div>

            {simFixedIdr > 0 && (
              <div className="flex justify-between">
                <span className="text-zinc-500">3. Biaya Operasional Tetap:</span>
                <span className="font-mono font-medium text-zinc-900 dark:text-white">
                  +Rp {simFixedIdr.toLocaleString('id-ID')}
                </span>
              </div>
            )}

            <div className="flex justify-between text-zinc-500 pt-1 border-t border-zinc-200/60 dark:border-zinc-800/60">
              <span>Subtotal Sebelum Fee Tako:</span>
              <span className="font-mono font-medium text-zinc-700 dark:text-zinc-300">
                Rp {simSubtotalPreTako.toLocaleString('id-ID')}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-zinc-500">4. Alokasi Biaya Penarikan Tako ({gatewayFeePercent}%):</span>
              <span className="font-mono font-medium text-blue-600 dark:text-blue-400">
                +Rp {simTakoFeeIdr.toLocaleString('id-ID')}
              </span>
            </div>

            <div className="flex justify-between text-zinc-500">
              <span>Pembulatan Angka Cantik:</span>
              <span className="font-mono font-medium text-purple-600 dark:text-purple-400">
                +Rp {simRoundingSurplus.toLocaleString('id-ID')}
              </span>
            </div>

            <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 flex justify-between items-center text-sm font-extrabold text-zinc-900 dark:text-white">
              <span>Harga Jual Final ke Pembeli:</span>
              <span className="font-mono text-base text-zinc-900 dark:text-white bg-white dark:bg-zinc-800 px-3 py-1 rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-2xs">
                Rp {simRetailPrice.toLocaleString('id-ID')}
              </span>
            </div>
          </div>

          {/* Net Profit Summary Box */}
          <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-800/80 bg-emerald-50/50 dark:bg-emerald-950/20 flex items-center justify-between text-xs">
            <div>
              <div className="font-bold text-emerald-900 dark:text-emerald-200">
                Total Keuntungan Bersih Toko:
              </div>
              <div className="text-[11px] text-emerald-700 dark:text-emerald-400">
                100% aman masuk rekening tanpa nombok fee transfer Tako
              </div>
            </div>
            <div className="font-mono text-lg font-black text-emerald-600 dark:text-emerald-400">
              Rp {simNetProfit.toLocaleString('id-ID')}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
