import React, { useState } from 'react';
import { actions } from 'astro:actions';
import { 
  TrendingUp, 
  Coins, 
  Layers, 
  RefreshCw, 
  Save, 
  Sliders, 
  Receipt, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  ArrowLeft,
  Search,
  ExternalLink,
  ShieldCheck,
  Check,
  Copy,
  Clock,
  HelpCircle,
  LogOut,
  Zap,
  Calculator
} from 'lucide-react';
import { ServiceLogo } from './ServiceLogo';

interface AdminDashboardProps {
  initialConfig: any;
  initialProducts: any[];
  initialOrders: any[];
  initialSupplier: any;
  initialLiveFx: any;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  initialConfig,
  initialProducts,
  initialOrders,
  initialSupplier,
  initialLiveFx,
}) => {
  const [activeTab, setActiveTab] = useState<'pricing' | 'catalog' | 'orders'>('pricing');
  const [config, setConfig] = useState(initialConfig);
  const [products, setProducts] = useState(initialProducts);
  const [orders, setOrders] = useState(initialOrders);
  const [supplier, setSupplier] = useState(initialSupplier);
  const [liveFx, setLiveFx] = useState(initialLiveFx);

  // Form states (Automated FX - No manual mode)
  const [fxBufferPercent, setFxBufferPercent] = useState<number>(initialConfig?.pricing?.fxBufferPercent ?? 0.5);
  const [marginPercent, setMarginPercent] = useState<number>(initialConfig?.pricing?.marginPercent ?? 20);
  const [gatewayFeePercent, setGatewayFeePercent] = useState<number>(initialConfig?.pricing?.gatewayFeePercent ?? 5.0);
  const [fixedFee, setFixedFee] = useState<number>(initialConfig?.pricing?.fixedFeeIdr ?? 0);
  const [simUsdt, setSimUsdt] = useState<number>(1.00);

  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRefreshingFx, setIsRefreshingFx] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [searchCatalog, setSearchCatalog] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const showNotification = (type: 'success' | 'error', text: string) => {
    setNotification({ type, text });
    setTimeout(() => setNotification(null), 4000);
  };

  const formatLastUpdate = (isoString?: string) => {
    if (!isoString) return 'Baru saja';
    try {
      const date = new Date(isoString);
      return date.toLocaleString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }) + ' WIB';
    } catch {
      return 'Baru saja';
    }
  };

  const handleRefreshLiveFx = async () => {
    setIsRefreshingFx(true);
    try {
      const { data, error } = await actions.getAdminSettings();
      if (!error && data?.liveFx) {
        setLiveFx(data.liveFx);
        showNotification('success', `Kurs berhasil diperbarui: Rp ${data.liveFx.rate.toLocaleString('id-ID')} (${data.liveFx.source})`);
      } else {
        showNotification('error', error?.message || 'Gagal memperbarui kurs.');
      }
    } catch (err) {
      showNotification('error', (err as Error).message);
    } finally {
      setIsRefreshingFx(false);
    }
  };

  const handleSavePricing = async (e: React.FormEvent) => {
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
        showNotification('error', error?.message || 'Gagal menyimpan pengaturan.');
        return;
      }

      showNotification('success', 'Pengaturan berhasil disimpan dan harga seluruh katalog toko telah diperbarui!');
      setTimeout(() => window.location.reload(), 1000);
    } catch (err) {
      showNotification('error', (err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSyncCatalog = async () => {
    setIsSyncing(true);
    try {
      const { data, error } = await actions.syncCatalogNow();
      if (error || !data) {
        showNotification('error', error?.message || 'Gagal sinkronisasi katalog.');
        return;
      }

      showNotification('success', `Berhasil memperbarui data ${data.count} produk dari supplier!`);
      setTimeout(() => window.location.reload(), 1000);
    } catch (err) {
      showNotification('error', (err as Error).message);
    } finally {
      setIsSyncing(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(text);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleLogout = async () => {
    try {
      await actions.adminLogout();
      window.location.href = '/admin/login';
    } catch {
      window.location.href = '/admin/login';
    }
  };

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(searchCatalog.toLowerCase()) ||
    p.category.toLowerCase().includes(searchCatalog.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100 font-sans">
      {/* Top Admin Navigation */}
      <header className="sticky top-0 z-30 bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a
              href="/"
              className="p-2 rounded-xl text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 transition"
              title="Kembali ke Toko"
            >
              <ArrowLeft className="w-4 h-4" />
            </a>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-sm tracking-tight text-zinc-900 dark:text-white">
                SIGMA<span className="text-emerald-500 ml-0.5">STORE</span>
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 font-medium text-zinc-600 dark:text-zinc-400">
                Panel Pengelola Toko
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <a
              href="/"
              target="_blank"
              rel="noreferrer"
              className="px-3.5 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900 text-xs font-semibold text-zinc-700 dark:text-zinc-300 transition flex items-center gap-1.5 shadow-xs"
            >
              <span>Kunjungi Toko</span>
              <ExternalLink className="w-3.5 h-3.5 text-zinc-400" />
            </a>

            <button
              onClick={handleLogout}
              className="px-3.5 py-1.5 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50/50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-900/50 text-xs font-semibold text-red-600 dark:text-red-400 transition flex items-center gap-1.5 shadow-xs cursor-pointer"
              title="Keluar dari Panel Admin"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Keluar</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Notification Alert */}
        {notification && (
          <div
            className={`p-4 rounded-2xl border flex items-center gap-3 text-sm animate-in fade-in duration-200 ${
              notification.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
            }`}
          >
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
            )}
            <span className="font-medium">{notification.text}</span>
          </div>
        )}

        {/* Overview KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Saldo Supplier */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 space-y-2 shadow-xs">
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span className="flex items-center gap-1.5 font-medium text-zinc-700 dark:text-zinc-300">
                <Coins className="w-4 h-4 text-amber-500" />
                Saldo Supplier (USDT)
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                {supplier?.status === 'active' ? 'Terhubung' : 'Aktif'}
              </span>
            </div>
            <div className="text-2xl font-black text-zinc-900 dark:text-white font-mono">
              {supplier?.balanceUsdt?.toFixed(2) || '0.00'} <span className="text-xs font-medium text-zinc-400">USDT</span>
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Saldo siap pakai untuk pembelian voucher otomatis.</p>
          </div>

          {/* Card 2: Kurs Realtime */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 space-y-2 shadow-xs">
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span className="flex items-center gap-1.5 font-medium text-zinc-700 dark:text-zinc-300">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
                Kurs Nilai Tukar Hari Ini
              </span>
              <div className="flex items-center gap-1.5">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                  Pasar {liveFx?.source || 'Indodax'}
                </span>
                <button
                  type="button"
                  onClick={handleRefreshLiveFx}
                  disabled={isRefreshingFx}
                  className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                  title="Segarkan Kurs Sekarang"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingFx ? 'animate-spin text-emerald-500' : ''}`} />
                </button>
              </div>
            </div>
            <div className="text-2xl font-black text-zinc-900 dark:text-white font-mono">
              Rp {liveFx?.rate?.toLocaleString('id-ID') || '17.879'}
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Diperbarui berkala mengikuti pasar uang dunia.</p>
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400 pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
              <Clock className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              <span>
                Terakhir diperbarui:{' '}
                <strong className="text-zinc-700 dark:text-zinc-300 font-semibold">
                  {formatLastUpdate(liveFx?.updatedAt)}
                </strong>
              </span>
            </div>
          </div>

          {/* Card 3: Margin Aktif */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 space-y-2 shadow-xs">
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span className="flex items-center gap-1.5 font-medium text-zinc-700 dark:text-zinc-300">
                <Sliders className="w-4 h-4 text-indigo-500" />
                Keuntungan Bersih Toko
              </span>
              <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                Fee Tako {gatewayFeePercent}%
              </span>
            </div>
            <div className="text-2xl font-black text-zinc-900 dark:text-white font-mono">
              {marginPercent}%
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Laba bersih murni toko (biaya penarikan Tako {gatewayFeePercent}% otomatis ter-cover).</p>
          </div>

          {/* Card 4: Total Produk */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 space-y-2 shadow-xs">
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span className="flex items-center gap-1.5 font-medium text-zinc-700 dark:text-zinc-300">
                <Layers className="w-4 h-4 text-purple-500" />
                Total Produk di Toko
              </span>
              <span className="text-[11px] font-medium text-zinc-500">{orders.length} Pesanan Masuk</span>
            </div>
            <div className="text-2xl font-black text-zinc-900 dark:text-white font-mono">
              {products.length} <span className="text-xs font-medium text-zinc-400">Produk</span>
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Produk aktif yang siap dipesan oleh pelanggan.</p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800">
          <button
            onClick={() => setActiveTab('pricing')}
            className={`pb-3 px-3 text-xs font-bold border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'pricing'
                ? 'border-zinc-900 text-zinc-900 dark:border-white dark:text-white'
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Pengaturan Harga & Keuntungan</span>
          </button>

          <button
            onClick={() => setActiveTab('catalog')}
            className={`pb-3 px-3 text-xs font-bold border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'catalog'
                ? 'border-zinc-900 text-zinc-900 dark:border-white dark:text-white'
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Katalog Produk ({products.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('orders')}
            className={`pb-3 px-3 text-xs font-bold border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'orders'
                ? 'border-zinc-900 text-zinc-900 dark:border-white dark:text-white'
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <Receipt className="w-4 h-4" />
            <span>Riwayat Pesanan ({orders.length})</span>
          </button>
        </div>

        {/* TAB 1: PENGATURAN HARGA & KEUNTUNGAN (TAKO WITHDRAWAL-AWARE PRICING REFACTOR) */}
        {activeTab === 'pricing' && (() => {
          const currentFxRate = liveFx?.rate ?? 17879;
          const effectiveFxRate = Math.round(currentFxRate * (1 + (Number(fxBufferPercent) || 0) / 100));
          const simCostIdr = Math.round(simUsdt * effectiveFxRate);
          const simMarginIdr = Math.round(simCostIdr * ((Number(marginPercent) || 0) / 100));
          const simFixedIdr = Number(fixedFee) || 0;
          const simSubtotalPreTako = simCostIdr + simMarginIdr + simFixedIdr;
          const simTakoFeeIdr = Math.round(simSubtotalPreTako * ((Number(gatewayFeePercent) || 0) / 100));
          const simRawRetail = simSubtotalPreTako + simTakoFeeIdr;
          const simRetailPrice = Math.ceil(simRawRetail / 1000) * 1000;
          const simRoundingSurplus = simRetailPrice - simRawRetail;
          const simNetProfit = simMarginIdr + simRoundingSurplus;

          return (
            <div className="space-y-6">
              {/* Banner: System Automated FX Status */}
              <div className="p-4 sm:p-5 bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-500/30 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
                <div className="flex items-start sm:items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-sm">
                    <Zap className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-zinc-900 dark:text-white">
                        Sistem Nilai Tukar Otomatis Aktif
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 uppercase tracking-wider font-mono">
                        Auto by System
                      </span>
                    </div>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5 leading-relaxed">
                      Nilai tukar USDT/IDR dikelola 100% otomatis oleh sistem via pasar {liveFx?.source || 'Indodax'} secara realtime. Tidak ada input manual sehingga harga katalog selalu aman dan akurat.
                    </p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap text-[11px] text-zinc-500 dark:text-zinc-400">
                      <span>Kurs Pasar: <strong className="font-mono text-zinc-900 dark:text-white">Rp {currentFxRate.toLocaleString('id-ID')}</strong></span>
                      <span>•</span>
                      <span>Proteksi: <strong className="font-mono text-emerald-600 dark:text-emerald-400">+{fxBufferPercent}%</strong></span>
                      <span>•</span>
                      <span>Kurs Efektif: <strong className="font-mono text-zinc-900 dark:text-white">Rp {effectiveFxRate.toLocaleString('id-ID')}</strong></span>
                      <span>•</span>
                      <span>Update: {formatLastUpdate(liveFx?.updatedAt)}</span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleRefreshLiveFx}
                  disabled={isRefreshingFx}
                  className="px-3.5 py-2.5 bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-semibold text-zinc-800 dark:text-zinc-200 transition flex items-center justify-center gap-2 shrink-0 shadow-2xs cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingFx ? 'animate-spin text-emerald-500' : ''}`} />
                  <span>Segarkan Kurs Sekarang</span>
                </button>
              </div>

              {/* Grid 2 Columns: Controls Form & Interactive Simulation */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left: Financial Refactor Controls Form */}
                <div className="lg:col-span-7 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 space-y-6 shadow-xs">
                  <div>
                    <h3 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                      <Sliders className="w-4 h-4 text-emerald-500" />
                      <span>Refactor Biaya Penarikan Tako & Margin Keuntungan</span>
                    </h3>
                    <p className="text-xs text-zinc-500 mt-1">
                      Transaksi Tako tidak memotong fee di depan, melainkan saat Anda melakukan penarikan saldo ke bank (4.5% - 5.0%). Sistem otomatis meng-cover biaya ini ke dalam harga jual agar keuntungan bersih Anda tetap utuh.
                    </p>
                  </div>

                  <form onSubmit={handleSavePricing} className="space-y-5">
                    {/* Control 1: Biaya Penarikan Saldo Tako (%) */}
                    <div className="p-4 bg-zinc-50 dark:bg-zinc-800/40 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 space-y-3">
                      <div>
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                            1. Biaya Penarikan Saldo Tako (%)
                          </label>
                          <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                            Dipungut saat Withdrawal
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed">
                          Alokasi persentase untuk menutupi potongan Tako saat penarikan saldo ke bank (default normal: 5.0%).
                        </p>
                      </div>

                      <div className="space-y-2">
                        <div className="relative">
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            max="20"
                            value={gatewayFeePercent}
                            onChange={(e) => setGatewayFeePercent(Number(e.target.value))}
                            className="w-full pl-3.5 pr-8 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-mono font-bold text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white"
                          />
                          <span className="absolute right-3.5 top-2 text-xs text-zinc-400 font-bold">%</span>
                        </div>

                        {/* Quick Presets based on Tako Withdrawal Tiers */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] text-zinc-400 font-medium mr-1">Tier Tako:</span>
                          {[
                            { label: '5.0% (Normal)', val: 5.0 },
                            { label: '4.9% (>Rp1Jt)', val: 4.9 },
                            { label: '4.8% (>Rp3Jt)', val: 4.8 },
                            { label: '4.5% (>Rp10Jt)', val: 4.5 },
                          ].map((t) => (
                            <button
                              key={t.val}
                              type="button"
                              onClick={() => setGatewayFeePercent(t.val)}
                              className={`px-2 py-1 rounded-lg text-[10px] font-mono transition cursor-pointer ${
                                gatewayFeePercent === t.val
                                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 font-bold shadow-xs'
                                  : 'bg-zinc-200/60 dark:bg-zinc-700/60 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200'
                              }`}
                            >
                              {t.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Control 2: Margin Keuntungan Bersih Toko (%) */}
                    <div className="p-4 bg-zinc-50 dark:bg-zinc-800/40 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 space-y-3">
                      <div>
                        <label className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                          2. Margin Keuntungan Bersih Toko (%)
                        </label>
                        <p className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed">
                          Persentase laba bersih murni yang Anda nikmati dari modal grosir supplier setelah biaya penarikan Tako tertutupi.
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="relative flex-1">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={marginPercent}
                            onChange={(e) => setMarginPercent(Number(e.target.value))}
                            className="w-full pl-3.5 pr-8 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-mono font-bold text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white"
                          />
                          <span className="absolute right-3.5 top-2 text-xs text-zinc-400 font-bold">%</span>
                        </div>

                        {/* Quick Presets */}
                        <div className="flex items-center gap-1">
                          {[15, 20, 25, 30].map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => setMarginPercent(preset)}
                              className={`px-2.5 py-1.5 rounded-lg text-[10px] font-mono font-medium transition cursor-pointer ${
                                marginPercent === preset
                                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 font-bold'
                                  : 'bg-zinc-200/60 dark:bg-zinc-700/60 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200'
                              }`}
                            >
                              {preset}%
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Control 3: Cadangan Pengaman Fluktuasi Kurs (%) */}
                    <div className="p-4 bg-zinc-50 dark:bg-zinc-800/40 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 space-y-3">
                      <div>
                        <label className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                          3. Cadangan Fluktuasi Kurs Pasar (%)
                        </label>
                        <p className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed">
                          Tambahan buffer keamanan untuk mengantisipasi pergerakan nilai tukar USDT saat pembeli sedang dalam proses transfer QRIS.
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="relative flex-1">
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            max="5"
                            value={fxBufferPercent}
                            onChange={(e) => setFxBufferPercent(Number(e.target.value))}
                            className="w-full pl-3.5 pr-8 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-mono font-bold text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white"
                          />
                          <span className="absolute right-3.5 top-2 text-xs text-zinc-400 font-bold">%</span>
                        </div>

                        {/* Quick Presets */}
                        <div className="flex items-center gap-1">
                          {[0.3, 0.5, 1.0].map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => setFxBufferPercent(preset)}
                              className={`px-2.5 py-1.5 rounded-lg text-[10px] font-mono font-medium transition cursor-pointer ${
                                fxBufferPercent === preset
                                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 font-bold'
                                  : 'bg-zinc-200/60 dark:bg-zinc-700/60 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200'
                              }`}
                            >
                              +{preset}%
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isSaving}
                      className="w-full py-3.5 px-5 bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 font-bold rounded-xl text-xs transition flex items-center justify-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Menyimpan & Menghitung Ulang Semua Produk...</span>
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4" />
                          <span>Simpan & Terapkan Perubahan ke Seluruh Toko</span>
                        </>
                      )}
                    </button>
                  </form>
                </div>

                {/* Right: Interactive Realtime Simulation & Breakdown */}
                <div className="lg:col-span-5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 space-y-5 shadow-xs flex flex-col justify-between">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                          <Calculator className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-white">
                            Simulasi Transparansi Finansial
                          </h4>
                          <p className="text-[11px] text-zinc-400">Rincian per 1 unit pesanan</p>
                        </div>
                      </div>
                    </div>

                    {/* Simulation Tester Controller */}
                    <div className="p-3.5 bg-zinc-50 dark:bg-zinc-800/40 rounded-xl border border-zinc-200/70 dark:border-zinc-800 space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-semibold text-zinc-600 dark:text-zinc-400">Contoh Modal Grosir (USDT):</span>
                        <div className="flex items-center gap-1">
                          {[0.5, 1.0, 2.0, 5.0].map((sample) => (
                            <button
                              key={sample}
                              type="button"
                              onClick={() => setSimUsdt(sample)}
                              className={`px-2 py-0.5 rounded text-[10px] font-mono cursor-pointer transition ${
                                simUsdt === sample
                                  ? 'bg-indigo-600 text-white font-bold'
                                  : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300'
                              }`}
                            >
                              ${sample}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="relative">
                        <span className="absolute left-3 top-2 text-xs text-zinc-400 font-bold">$</span>
                        <input
                          type="number"
                          step="0.1"
                          min="0.1"
                          max="100"
                          value={simUsdt}
                          onChange={(e) => setSimUsdt(Math.max(0.1, Number(e.target.value)))}
                          className="w-full pl-7 pr-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-mono font-bold"
                        />
                      </div>
                    </div>

                    {/* Breakdown Math Breakdown */}
                    <div className="p-4 bg-zinc-50 dark:bg-zinc-800/30 rounded-2xl border border-zinc-100 dark:border-zinc-800 space-y-3 text-xs">
                      <div className="flex items-center justify-between text-zinc-600 dark:text-zinc-400">
                        <span>1. Modal Grosir ({simUsdt} USDT × Rp {effectiveFxRate.toLocaleString('id-ID')})</span>
                        <span className="font-mono font-semibold text-zinc-900 dark:text-white">
                          Rp {simCostIdr.toLocaleString('id-ID')}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
                        <span>2. Margin Keuntungan Bersih Toko ({marginPercent}%)</span>
                        <span className="font-mono font-bold">
                          + Rp {simMarginIdr.toLocaleString('id-ID')}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-amber-700 dark:text-amber-400">
                        <span>3. Alokasi Biaya Penarikan Tako ({gatewayFeePercent}%)</span>
                        <span className="font-mono font-bold">
                          + Rp {simTakoFeeIdr.toLocaleString('id-ID')}
                        </span>
                      </div>

                      <div className="pt-2.5 border-t border-zinc-200 dark:border-zinc-700 flex items-center justify-between">
                        <div>
                          <span className="font-bold text-zinc-900 dark:text-white block">Harga Jual Resmi Konsumen</span>
                          <span className="text-[10px] text-zinc-400 font-mono">Dibulatkan ke atas kelipatan Rp 1.000</span>
                        </div>
                        <div className="text-right">
                          <span className="text-base font-black text-zinc-900 dark:text-white font-mono block">
                            Rp {simRetailPrice.toLocaleString('id-ID')}
                          </span>
                        </div>
                      </div>

                      {/* Profit Highlight Box */}
                      <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 rounded-xl flex items-center justify-between">
                        <div>
                          <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-200 block">
                            Estimasi Laba Bersih Masuk Rekening
                          </span>
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                            Setelah dipotong fee penarikan Tako
                          </span>
                        </div>
                        <div className="text-base font-black font-mono text-emerald-600 dark:text-emerald-400">
                          Rp {simNetProfit.toLocaleString('id-ID')}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Summary Note on Tako Batch Withdrawal */}
                  <div className="p-3 bg-zinc-100/70 dark:bg-zinc-800/50 rounded-xl text-[11px] text-zinc-500 dark:text-zinc-400 space-y-1">
                    <div className="font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Transparansi Biaya Penarikan Tako</span>
                    </div>
                    <p className="leading-relaxed">
                      Saldo dari pembeli masuk utuh 100% ke akun Tako Anda. Saat Anda menarik dana ke bank, alokasi {gatewayFeePercent}% memastikan Anda tidak nombok biaya transfer dan potongan withdrawal.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* TAB 2: KATALOG PRODUK */}
        {activeTab === 'catalog' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 rounded-2xl shadow-xs">
              <div className="relative w-full sm:w-80">
                <input
                  type="text"
                  placeholder="Cari nama produk atau kategori..."
                  value={searchCatalog}
                  onChange={(e) => setSearchCatalog(e.target.value)}
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition"
                />
                <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-3" />
              </div>

              <button
                type="button"
                onClick={handleSyncCatalog}
                disabled={isSyncing}
                className="w-full sm:w-auto py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-xs transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? 'Mengambil Data Produk...' : 'Sinkronkan Produk dari Supplier'}</span>
              </button>
            </div>

            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-50 dark:bg-zinc-800/60 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 uppercase tracking-wider font-semibold">
                    <tr>
                      <th className="py-3 px-4">Nama Produk & Layanan</th>
                      <th className="py-3 px-4">Kategori</th>
                      <th className="py-3 px-4">Harga Modal (USDT)</th>
                      <th className="py-3 px-4">Harga Jual Toko (Rp)</th>
                      <th className="py-3 px-4">Stok Real-time</th>
                      <th className="py-3 px-4">Status Ketersediaan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                    {filteredProducts.map((p) => {
                      const stockCount = p.stock ?? 0;
                      return (
                        <tr key={p.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <ServiceLogo name={p.name} category={p.category} className="w-8 h-8" />
                              <div>
                                <div className="font-bold text-zinc-900 dark:text-white">{p.name}</div>
                                <div className="text-[10px] text-zinc-400 font-mono">ID Produk: #{p.supplierProductId}</div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-[10px] font-medium text-zinc-600 dark:text-zinc-300">
                              {p.category}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono font-semibold text-zinc-700 dark:text-zinc-300">
                            ${p.basePriceUsdt.toFixed(2)} USDT
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            Rp {p.retailPriceIdr.toLocaleString('id-ID')}
                          </td>
                          <td className="py-3 px-4">
                            {stockCount > 10 ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 font-mono">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                {stockCount} unit
                              </span>
                            ) : stockCount > 0 ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 font-mono">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                                Sisa {stockCount} unit
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60 font-mono">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                                0 unit (Habis)
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            {stockCount > 0 ? (
                              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/60">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                Tersedia di Toko
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-2.5 py-0.5 rounded-full border border-rose-200 dark:border-rose-800/60">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                                Stok Kosong
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: RIWAYAT PESANAN */}
        {activeTab === 'orders' && (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-xs">
            {orders.length === 0 ? (
              <div className="text-center py-16 p-6 space-y-2">
                <Receipt className="w-8 h-8 text-zinc-400 mx-auto" />
                <h4 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Belum Ada Pesanan Masuk</h4>
                <p className="text-xs text-zinc-500">
                  Data transaksi pembeli, status pembayaran QRIS, dan kode lisensi yang terbit akan otomatis muncul di sini.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-50 dark:bg-zinc-800/60 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 uppercase tracking-wider font-semibold">
                    <tr>
                      <th className="py-3 px-4">No. Invoice</th>
                      <th className="py-3 px-4">Data Pembeli</th>
                      <th className="py-3 px-4">Produk Dipesan</th>
                      <th className="py-3 px-4">Total Pembayaran</th>
                      <th className="py-3 px-4">Status Pesanan</th>
                      <th className="py-3 px-4">Kode Lisensi / Voucher</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                    {orders.map((o) => {
                      let codes: string[] = [];
                      if (o.licenseCodes) {
                        try {
                          codes = JSON.parse(o.licenseCodes);
                        } catch {
                          codes = [o.licenseCodes];
                        }
                      }

                      let statusBadge = (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                          Menunggu Pembayaran
                        </span>
                      );

                      if (o.status === 'COMPLETED') {
                        statusBadge = (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                            Selesai
                          </span>
                        );
                      } else if (o.status === 'FULFILLING') {
                        statusBadge = (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                            Sedang Diproses
                          </span>
                        );
                      } else if (o.status === 'FAILED_SUPPLIER') {
                        statusBadge = (
                          <div className="space-y-1">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 inline-block">
                              ⚠️ Stok Kosong / Butuh Refund
                            </span>
                            {o.failureReason && (
                              <p className="text-[10px] text-red-600 dark:text-red-400 max-w-[200px] truncate" title={o.failureReason}>
                                {o.failureReason}
                              </p>
                            )}
                          </div>
                        );
                      }

                      return (
                        <tr key={o.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition">
                          <td className="py-3 px-4 font-mono font-bold text-zinc-900 dark:text-white">
                            {o.orderNumber}
                          </td>
                          <td className="py-3 px-4">
                            <div className="text-zinc-900 dark:text-white font-medium">{o.customerEmail}</div>
                            <div className="text-[10px] text-zinc-400 font-mono">{o.customerWhatsapp}</div>
                          </td>
                          <td className="py-3 px-4 text-zinc-800 dark:text-zinc-200">
                            {o.productName} (x{o.quantity})
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            Rp {o.totalAmountIdr.toLocaleString('id-ID')}
                          </td>
                          <td className="py-3 px-4">
                            {statusBadge}
                          </td>
                          <td className="py-3 px-4">
                            {codes.length > 0 ? (
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold truncate max-w-[140px]">
                                  {codes[0]}
                                </span>
                                <button
                                  onClick={() => copyToClipboard(codes[0])}
                                  className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition cursor-pointer"
                                  title="Salin Kode"
                                >
                                  {copiedKey === codes[0] ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5 text-zinc-400" />
                                  )}
                                </button>
                              </div>
                            ) : o.failureReason ? (
                              <span className="text-xs text-red-500 dark:text-red-400 line-clamp-1" title={o.failureReason}>
                                {o.failureReason}
                              </span>
                            ) : (
                              <span className="text-zinc-400 italic">Belum terbit (menunggu bayar)</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
