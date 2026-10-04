import React, { useState, useEffect } from 'react';
import { actions } from 'astro:actions';
import {
  User,
  Package,
  Key,
  CreditCard,
  LogOut,
  Search,
  ExternalLink,
  Copy,
  Check,
  CheckCircle2,
  Clock,
  AlertCircle,
  ShieldCheck,
  ArrowRight,
  Sparkles,
  ShoppingBag,
  MessageCircle,
  Lock,
  Mail,
  Phone,
  RefreshCw,
} from 'lucide-react';
import { ServiceLogo } from '@/components/ServiceLogo';

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: string;
}

export interface UserOrder {
  id: string;
  orderNumber: string;
  productName: string;
  quantity: number;
  totalAmountIdr: number;
  status: string;
  licenseCodes: string[];
  paidAt?: string | null;
  createdAt?: string | null;
}

interface UserDashboardProps {
  initialUser?: AuthenticatedUser | null;
  initialOrders?: UserOrder[];
}

export const UserDashboard: React.FC<UserDashboardProps> = ({
  initialUser = null,
  initialOrders = [],
}) => {
  const [user, setUser] = useState<AuthenticatedUser | null>(initialUser);
  const [orders, setOrders] = useState<UserOrder[]>(initialOrders);
  const [activeTab, setActiveTab] = useState<'all' | 'completed' | 'pending' | 'lookup'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Auth form states (for non-logged in visitors)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState('');
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);

  // Guest lookup state
  const [guestOrderNumber, setGuestOrderNumber] = useState('');
  const [guestOrderResult, setGuestOrderResult] = useState<UserOrder | null>(null);
  const [guestLookupError, setGuestLookupError] = useState('');
  const [isLookingUp, setIsLookingUp] = useState(false);

  // Load user data on client mount if initialUser was not passed
  useEffect(() => {
    if (!initialUser) {
      actions.getCurrentUser().then(({ data }) => {
        if (data?.user) {
          setUser(data.user);
          loadOrders();
        }
      });
    }
  }, []);

  const loadOrders = async () => {
    setIsLoading(true);
    try {
      const { data } = await actions.getUserOrders();
      if (data?.orders) {
        setOrders(data.orders);
      }
    } catch (err) {
      console.warn('Failed loading orders:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(text);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingAuth(true);
    setAuthError('');
    setAuthSuccess('');

    try {
      const res = await actions.loginUser({
        email: loginEmail,
        password: loginPassword,
      });

      if (res.error) {
        setAuthError(res.error.message || 'Gagal masuk. Periksa email dan kata sandi Anda.');
        return;
      }

      if (res.data?.user) {
        setUser(res.data.user);
        setAuthSuccess('Berhasil masuk ke akun Anda!');
        await loadOrders();
      }
    } catch (err) {
      setAuthError((err as Error).message || 'Terjadi kesalahan sistem.');
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingAuth(true);
    setAuthError('');
    setAuthSuccess('');

    try {
      const res = await actions.registerUser({
        name: regName,
        email: regEmail,
        password: regPassword,
        phone: regPhone,
      });

      if (res.error) {
        setAuthError(res.error.message || 'Gagal mendaftar. Silakan periksa kembali data Anda.');
        return;
      }

      if (res.data?.user) {
        setUser(res.data.user);
        setAuthSuccess('Pendaftaran berhasil! Selamat datang di Pixel Store.');
        await loadOrders();
      }
    } catch (err) {
      setAuthError((err as Error).message || 'Terjadi kesalahan sistem.');
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  const handleLogout = async () => {
    try {
      await actions.logoutUser();
      setUser(null);
      setOrders([]);
    } catch (err) {
      console.warn('Logout error:', err);
    }
  };

  const handleGuestLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    const orderNum = guestOrderNumber.trim();
    if (!orderNum) return;

    setIsLookingUp(true);
    setGuestLookupError('');
    setGuestOrderResult(null);

    try {
      const { data, error } = await actions.getOrderStatus({ orderNumber: orderNum });
      if (error || !data) {
        setGuestLookupError(error?.message || 'Nomor pesanan tidak ditemukan.');
        return;
      }

      setGuestOrderResult({
        id: data.orderNumber,
        orderNumber: data.orderNumber,
        productName: data.productName,
        quantity: data.quantity,
        totalAmountIdr: data.totalAmountIdr,
        status: data.status,
        licenseCodes: data.licenseCodes || [],
        createdAt: data.createdAt,
      });
    } catch (err) {
      setGuestLookupError((err as Error).message || 'Gagal memeriksa pesanan.');
    } finally {
      setIsLookingUp(false);
    }
  };

  // Filter orders
  const filteredOrders = orders.filter((o) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      o.orderNumber?.toLowerCase().includes(q) ||
      o.productName?.toLowerCase().includes(q);

    if (!matchesSearch) return false;

    if (activeTab === 'all') return true;
    if (activeTab === 'completed') return o.status === 'COMPLETED';
    if (activeTab === 'pending') return o.status === 'PENDING_PAYMENT';
    return true;
  });

  const totalSpent = orders
    .filter((o) => o.status === 'COMPLETED')
    .reduce((sum, o) => sum + (o.totalAmountIdr || 0), 0);

  const completedCount = orders.filter((o) => o.status === 'COMPLETED').length;
  const activeLicensesCount = orders
    .filter((o) => o.status === 'COMPLETED')
    .reduce((sum, o) => sum + (o.licenseCodes?.length || 0), 0);

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6">
      {/* If Not Logged In */}
      {!user ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Account Login / Register */}
          <div className="lg:col-span-7 bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-xs space-y-6">
            <div className="border-b border-zinc-100 dark:border-zinc-800 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                  Dashboard Pelanggan
                </span>
              </div>
              <h2 className="text-xl font-black text-zinc-900 dark:text-white">
                Masuk ke Akun Pixel Store Anda
              </h2>
              <p className="text-xs text-zinc-500 mt-1">
                Akses seluruh riwayat pesanan, lisensi aktivasi resmi, dan status transaksi Anda di satu tempat.
              </p>
            </div>

            {/* Mode Switcher */}
            <div className="flex p-1 bg-zinc-100 dark:bg-zinc-800/80 rounded-xl">
              <button
                type="button"
                onClick={() => setAuthMode('login')}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition cursor-pointer ${
                  authMode === 'login'
                    ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-xs'
                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
                }`}
              >
                Masuk (Login)
              </button>
              <button
                type="button"
                onClick={() => setAuthMode('register')}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition cursor-pointer ${
                  authMode === 'register'
                    ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-xs'
                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
                }`}
              >
                Daftar Akun Baru
              </button>
            </div>

            {authError && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            {authSuccess && (
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{authSuccess}</span>
              </div>
            )}

            {authMode === 'login' ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Alamat Email
                  </label>
                  <div className="relative">
                    <input
                      type="email"
                      required
                      placeholder="nama@email.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      className="w-full pl-9 pr-3.5 py-2.5 rounded-xl text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition"
                    />
                    <Mail className="w-4 h-4 text-zinc-400 absolute left-3 top-3" />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Kata Sandi
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className="w-full pl-9 pr-3.5 py-2.5 rounded-xl text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition"
                    />
                    <Lock className="w-4 h-4 text-zinc-400 absolute left-3 top-3" />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingAuth}
                  className="w-full py-3 bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 font-bold rounded-xl text-xs transition cursor-pointer disabled:opacity-50 shadow-xs"
                >
                  {isSubmittingAuth ? 'Memverifikasi...' : 'Masuk ke Dashboard Akun'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleRegister} className="space-y-3.5">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Nama Lengkap
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Nama Anda"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Alamat Email
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="nama@email.com"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Nomor WhatsApp (Opsional)
                  </label>
                  <input
                    type="tel"
                    placeholder="08123456789"
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Kata Sandi
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="Minimal 6 karakter"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingAuth}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition cursor-pointer disabled:opacity-50 shadow-xs"
                >
                  {isSubmittingAuth ? 'Mendaftarkan Akun...' : 'Daftar Akun Baru'}
                </button>
              </form>
            )}
          </div>

          {/* Right Column: Instant Guest Order Lookup */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-xs space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <Search className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                    Cek Pesanan Instan (Tanpa Akun)
                  </h3>
                  <p className="text-[11px] text-zinc-500">
                    Cari pesanan Anda menggunakan Nomor Pesanan
                  </p>
                </div>
              </div>

              <form onSubmit={handleGuestLookup} className="space-y-3">
                <input
                  type="text"
                  placeholder="Contoh: PIXEL-20261004-XXXXXX"
                  value={guestOrderNumber}
                  onChange={(e) => setGuestOrderNumber(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl text-xs font-mono uppercase bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition"
                />

                <button
                  type="submit"
                  disabled={isLookingUp || !guestOrderNumber.trim()}
                  className="w-full py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 text-xs font-semibold hover:opacity-90 transition cursor-pointer disabled:opacity-40"
                >
                  {isLookingUp ? 'Mencari...' : 'Cari Pesanan & Tampilkan Lisensi'}
                </button>
              </form>

              {guestLookupError && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-400">
                  {guestLookupError}
                </div>
              )}

              {/* Guest Result Card */}
              {guestOrderResult && (
                <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 space-y-3 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-xs text-zinc-900 dark:text-white">
                      {guestOrderResult.orderNumber}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        guestOrderResult.status === 'COMPLETED'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                      }`}
                    >
                      {guestOrderResult.status === 'COMPLETED' ? 'Selesai' : guestOrderResult.status}
                    </span>
                  </div>

                  <div className="text-xs text-zinc-700 dark:text-zinc-300 font-medium">
                    {guestOrderResult.quantity}x {guestOrderResult.productName}
                  </div>

                  <div className="text-sm font-black font-mono text-zinc-900 dark:text-white">
                    Rp {guestOrderResult.totalAmountIdr?.toLocaleString('id-ID')}
                  </div>

                  {guestOrderResult.licenseCodes && guestOrderResult.licenseCodes.length > 0 && (
                    <div className="pt-2 border-t border-zinc-200 dark:border-zinc-700 space-y-1.5">
                      <span className="text-[10px] uppercase font-bold text-zinc-500 block">
                        Lisensi / Tautan Aktivasi:
                      </span>
                      {guestOrderResult.licenseCodes.map((code, idx) => (
                        <div
                          key={idx}
                          className="p-2 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-between gap-2 font-mono text-[11px] text-emerald-600 dark:text-emerald-400 break-all"
                        >
                          <span className="truncate">{code}</span>
                          <button
                            onClick={() => handleCopy(code)}
                            className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700 transition shrink-0 cursor-pointer"
                            title="Salin"
                          >
                            {copiedKey === code ? (
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                            ) : (
                              <Copy className="w-3.5 h-3.5 text-zinc-500" />
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Support Card */}
            <div className="p-5 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141416] space-y-3">
              <h4 className="text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                <MessageCircle className="w-4 h-4 text-emerald-500" />
                <span>Bantuan & Dukungan Pelanggan</span>
              </h4>
              <p className="text-xs text-zinc-500 leading-relaxed">
                Mengalami kendala pada pembayaran atau aktivasi akun? Tim kami siap membantu Anda 24/7.
              </p>
              <a
                href="/support"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
              >
                <span>Buka Layanan Support Chat</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      ) : (
        /* Authenticated User Dashboard View */
        <div className="space-y-6">
          {/* User Header Profile Card */}
          <div className="p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141416] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 font-black text-xl flex items-center justify-center shrink-0 shadow-sm">
                {user.name?.slice(0, 1).toUpperCase() || 'U'}
              </div>

              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-lg font-black text-zinc-900 dark:text-white">
                    {user.name}
                  </h1>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                    Pelanggan Terverifikasi
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-zinc-500 mt-1 flex-wrap">
                  <span>{user.email}</span>
                  {user.phone && <span>• {user.phone}</span>}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <a
                href="/"
                className="px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-xs font-semibold text-zinc-800 dark:text-zinc-200 transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <ShoppingBag className="w-3.5 h-3.5 text-blue-500" />
                <span>Belanja Lagi</span>
              </a>

              <a
                href="/support"
                className="px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-xs font-semibold text-zinc-800 dark:text-zinc-200 transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <MessageCircle className="w-3.5 h-3.5 text-emerald-500" />
                <span>Support</span>
              </a>

              <button
                type="button"
                onClick={handleLogout}
                className="px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-semibold text-red-600 dark:text-red-400 transition flex items-center gap-1.5 cursor-pointer"
                title="Keluar dari akun"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Keluar</span>
              </button>
            </div>
          </div>

          {/* Metric KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141416] shadow-2xs">
              <span className="text-[11px] text-zinc-500 font-medium block">Total Pesanan</span>
              <span className="text-xl font-black text-zinc-900 dark:text-white font-mono mt-1 block">
                {orders.length}
              </span>
            </div>

            <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141416] shadow-2xs">
              <span className="text-[11px] text-zinc-500 font-medium block">Pesanan Selesai</span>
              <span className="text-xl font-black text-emerald-600 dark:text-emerald-400 font-mono mt-1 block">
                {completedCount}
              </span>
            </div>

            <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141416] shadow-2xs">
              <span className="text-[11px] text-zinc-500 font-medium block">Lisensi / Link Aktif</span>
              <span className="text-xl font-black text-blue-600 dark:text-blue-400 font-mono mt-1 block">
                {activeLicensesCount}
              </span>
            </div>

            <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141416] shadow-2xs">
              <span className="text-[11px] text-zinc-500 font-medium block">Total Belanja</span>
              <span className="text-xl font-black text-zinc-900 dark:text-white font-mono mt-1 block truncate">
                Rp {totalSpent.toLocaleString('id-ID')}
              </span>
            </div>
          </div>

          {/* Orders Section & Filter Tabs */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              {/* Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
                {[
                  { id: 'all', label: `Semua Pesanan (${orders.length})` },
                  { id: 'completed', label: `Selesai (${completedCount})` },
                  {
                    id: 'pending',
                    label: `Menunggu (${orders.filter((o) => o.status === 'PENDING_PAYMENT').length})`,
                  },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                      activeTab === tab.id
                        ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-xs'
                        : 'bg-white dark:bg-[#141416] text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Search */}
              <div className="relative w-full sm:w-64">
                <input
                  type="text"
                  placeholder="Cari pesanan atau produk..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3.5 py-1.5 rounded-xl text-xs bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition"
                />
                <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-2" />
              </div>
            </div>

            {/* Orders Cards Grid */}
            {filteredOrders.length === 0 ? (
              <div className="text-center py-16 bg-white dark:bg-[#141416] rounded-3xl border border-zinc-200 dark:border-zinc-800 space-y-3">
                <Package className="w-10 h-10 text-zinc-300 dark:text-zinc-700 mx-auto" />
                <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-300">
                  Belum Ada Pesanan
                </h3>
                <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                  Anda belum memiliki pesanan pada kategori ini. Jelajahi katalog produk untuk mulai berbelanja.
                </p>
                <a
                  href="/"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition"
                >
                  <ShoppingBag className="w-3.5 h-3.5" />
                  <span>Lihat Katalog Produk</span>
                </a>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredOrders.map((order) => {
                  const isCompleted = order.status === 'COMPLETED';
                  const isPending = order.status === 'PENDING_PAYMENT';
                  const isCanceled = order.status === 'CANCELED';

                  return (
                    <div
                      key={order.id}
                      className="p-5 bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 rounded-3xl space-y-3.5 shadow-2xs hover:border-zinc-300 dark:hover:border-zinc-700 transition"
                    >
                      {/* Order Header Row */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-100 dark:border-zinc-800/80 pb-3">
                        <div className="flex items-center gap-2 font-mono">
                          <span className="font-bold text-xs text-zinc-900 dark:text-white">
                            {order.orderNumber}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopy(order.orderNumber)}
                            className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition"
                            title="Salin nomor pesanan"
                          >
                            {copiedKey === order.orderNumber ? (
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-zinc-400">
                            {order.createdAt
                              ? new Date(order.createdAt).toLocaleDateString('id-ID', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : '-'}
                          </span>
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                              isCompleted
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : isPending
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                : isCanceled
                                ? 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                                : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                            }`}
                          >
                            {isCompleted
                              ? 'Selesai'
                              : isPending
                              ? 'Menunggu Bayar'
                              : isCanceled
                              ? 'Dibatalkan'
                              : 'Bermasalah'}
                          </span>
                        </div>
                      </div>

                      {/* Product & Price Row */}
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <ServiceLogo name={order.productName} size="sm" />
                          <div>
                            <h4 className="text-xs font-bold text-zinc-900 dark:text-white">
                              {order.productName}
                            </h4>
                            <span className="text-[11px] text-zinc-400 font-mono">
                              Kuantitas: {order.quantity} unit
                            </span>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="text-sm font-black font-mono text-zinc-900 dark:text-white block">
                            Rp {order.totalAmountIdr?.toLocaleString('id-ID')}
                          </span>
                        </div>
                      </div>

                      {/* License Codes Box if Completed */}
                      {isCompleted && order.licenseCodes && order.licenseCodes.length > 0 && (
                        <div className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 space-y-2">
                          <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">
                            <span className="flex items-center gap-1.5">
                              <Key className="w-3.5 h-3.5 text-emerald-500" />
                              Tautan / Kode Aktivasi Resmi:
                            </span>
                            <span className="text-emerald-600 dark:text-emerald-400 text-[10px] uppercase font-bold">
                              Siap Digunakan
                            </span>
                          </div>

                          <div className="space-y-1.5">
                            {order.licenseCodes.map((code, idx) => {
                              const isUrl = code.startsWith('http://') || code.startsWith('https://');

                              return (
                                <div
                                  key={idx}
                                  className="p-2.5 rounded-xl bg-white dark:bg-black/40 border border-zinc-200 dark:border-zinc-700/80 flex items-center justify-between gap-2 font-mono text-xs text-emerald-600 dark:text-emerald-400 break-all select-all"
                                >
                                  <span className="truncate">{code}</span>
                                  <div className="flex items-center gap-1 shrink-0">
                                    {isUrl && (
                                      <a
                                        href={code}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="p-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 hover:opacity-80 transition"
                                        title="Buka Tautan"
                                      >
                                        <ExternalLink className="w-3 h-3" />
                                      </a>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => handleCopy(code)}
                                      className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 transition cursor-pointer"
                                      title="Salin Kode"
                                    >
                                      {copiedKey === code ? (
                                        <Check className="w-3 h-3 text-emerald-500" />
                                      ) : (
                                        <Copy className="w-3 h-3" />
                                      )}
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
