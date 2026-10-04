import React, { useState, useEffect } from 'react';
import { 
  X, 
  User, 
  Mail, 
  Lock, 
  Phone, 
  LogOut, 
  Key, 
  Check, 
  Copy, 
  Package, 
  ExternalLink, 
  ShieldCheck, 
  Clock, 
  AlertCircle,
  Loader2 
} from 'lucide-react';
import { actions } from 'astro:actions';

interface UserAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUserChanged?: (user: AuthenticatedUser | null) => void;
}

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

export const UserAccountModal: React.FC<UserAccountModalProps> = ({ 
  isOpen, 
  onClose,
  onUserChanged 
}) => {
  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(null);
  const [activeTab, setActiveTab] = useState<'login' | 'register' | 'orders'>('login');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');

  // Form states
  const [loginEmail, setLoginEmail] = useState<string>('');
  const [loginPassword, setLoginPassword] = useState<string>('');

  const [registerName, setRegisterName] = useState<string>('');
  const [registerEmail, setRegisterEmail] = useState<string>('');
  const [registerPassword, setRegisterPassword] = useState<string>('');
  const [registerPhone, setRegisterPhone] = useState<string>('');

  // Orders state
  const [orders, setOrders] = useState<UserOrder[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState<boolean>(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Check auth status on open
  useEffect(() => {
    if (isOpen) {
      checkAuthStatus();
    }
  }, [isOpen]);

  const checkAuthStatus = async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const res = await actions.getCurrentUser();
      if (res.data?.user) {
        setCurrentUser(res.data.user);
        setActiveTab('orders');
        fetchUserOrders();
        onUserChanged?.(res.data.user);
      } else {
        setCurrentUser(null);
        setActiveTab('login');
        onUserChanged?.(null);
      }
    } catch {
      setCurrentUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchUserOrders = async () => {
    setIsLoadingOrders(true);
    try {
      const res = await actions.getUserOrders();
      if (res.data?.orders) {
        setOrders(res.data.orders);
      }
    } catch (err) {
      console.warn('Failed to load user orders:', err);
    } finally {
      setIsLoadingOrders(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const res = await actions.loginUser({
        email: loginEmail,
        password: loginPassword,
      });

      if (res.error) {
        setErrorMessage(res.error.message || 'Gagal masuk. Periksa email dan kata sandi Anda.');
        return;
      }

      if (res.data?.user) {
        setCurrentUser(res.data.user);
        onUserChanged?.(res.data.user);
        setSuccessMessage('Berhasil masuk!');
        setActiveTab('orders');
        fetchUserOrders();
      }
    } catch (err) {
      setErrorMessage((err as Error).message || 'Terjadi kesalahan saat masuk.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const res = await actions.registerUser({
        name: registerName,
        email: registerEmail,
        password: registerPassword,
        phone: registerPhone,
      });

      if (res.error) {
        setErrorMessage(res.error.message || 'Gagal mendaftar. Silakan coba lagi.');
        return;
      }

      if (res.data?.user) {
        setCurrentUser(res.data.user);
        onUserChanged?.(res.data.user);
        setSuccessMessage('Akun berhasil dibuat!');
        setActiveTab('orders');
        fetchUserOrders();
      }
    } catch (err) {
      setErrorMessage((err as Error).message || 'Terjadi kesalahan saat pendaftaran.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    setIsSubmitting(true);
    try {
      await actions.logoutUser();
      setCurrentUser(null);
      onUserChanged?.(null);
      setOrders([]);
      setActiveTab('login');
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(text);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 flex items-center justify-center font-bold text-xs">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                {currentUser ? 'Akun Pelanggan' : 'Masuk atau Buat Akun'}
              </h3>
              <p className="text-[11px] text-zinc-500">
                {currentUser ? `Halo, ${currentUser.name}` : 'Akses riwayat lisensi & transaksi Anda'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3">
              <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
              <p className="text-xs text-zinc-500">Memeriksa status akun...</p>
            </div>
          ) : currentUser ? (
            /* Logged In State */
            <div className="space-y-5">
              {/* User Profile Card */}
              <div className="bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold flex items-center justify-center text-sm">
                    {currentUser.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-zinc-900 dark:text-zinc-100">{currentUser.name}</span>
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-100/60 dark:bg-emerald-950/60 px-1.5 py-0.2 rounded-md">
                        <ShieldCheck className="w-3 h-3" /> Member
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-500">{currentUser.email}</p>
                    {currentUser.phone && <p className="text-[11px] text-zinc-400">{currentUser.phone}</p>}
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  disabled={isSubmitting}
                  className="px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition flex items-center gap-1.5"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Keluar</span>
                </button>
              </div>

              {/* Order History */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-xs text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5 text-zinc-500" />
                    <span>Riwayat Pesanan & Lisensi ({orders.length})</span>
                  </h4>
                  <button
                    onClick={fetchUserOrders}
                    disabled={isLoadingOrders}
                    className="text-[11px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                  >
                    Segarkan
                  </button>
                </div>

                {isLoadingOrders ? (
                  <div className="py-8 text-center text-xs text-zinc-400 flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Memuat daftar lisensi...</span>
                  </div>
                ) : orders.length === 0 ? (
                  <div className="text-center py-8 bg-zinc-50/50 dark:bg-zinc-900/30 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl p-6">
                    <Package className="w-8 h-8 text-zinc-300 dark:text-zinc-700 mx-auto mb-2" />
                    <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Belum ada pesanan</p>
                    <p className="text-[11px] text-zinc-400 mt-0.5">Pesanan yang Anda buat akan otomatis tercatat di sini.</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                    {orders.map((ord) => (
                      <div
                        key={ord.id}
                        className="bg-zinc-50 dark:bg-[#18181b] border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl p-3.5 space-y-2.5 transition"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <div>
                            <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">{ord.orderNumber}</span>
                            <span className="text-[10px] text-zinc-400 ml-2">
                              {ord.createdAt ? new Date(ord.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                            </span>
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            ord.status === 'COMPLETED'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800'
                              : ord.status === 'PENDING_PAYMENT'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-400 border border-amber-300 dark:border-amber-800'
                              : 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                          }`}>
                            {ord.status === 'COMPLETED' ? 'Selesai' : ord.status === 'PENDING_PAYMENT' ? 'Menunggu Bayar' : ord.status}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-xs pt-1 border-t border-zinc-200/50 dark:border-zinc-800/50">
                          <span className="text-zinc-700 dark:text-zinc-300 font-medium">
                            {ord.productName} <span className="text-zinc-400">x{ord.quantity}</span>
                          </span>
                          <span className="font-bold text-zinc-900 dark:text-zinc-100">
                            Rp {ord.totalAmountIdr.toLocaleString('id-ID')}
                          </span>
                        </div>

                        {/* License keys display */}
                        {ord.status === 'COMPLETED' && ord.licenseCodes && ord.licenseCodes.length > 0 && (
                          <div className="mt-2 space-y-1.5 pt-2 border-t border-zinc-200/60 dark:border-zinc-800/60">
                            <span className="text-[10px] font-bold tracking-wider uppercase text-zinc-400 flex items-center gap-1">
                              <Key className="w-3 h-3 text-emerald-500" /> Lisensi / Tautan Aktivasi
                            </span>
                            {ord.licenseCodes.map((code, idx) => {
                              const isLink = code.startsWith('http://') || code.startsWith('https://');
                              return (
                                <div
                                  key={idx}
                                  className="bg-white dark:bg-black/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-2 flex items-center justify-between gap-2"
                                >
                                  <div className="font-mono text-[11px] text-zinc-800 dark:text-zinc-200 truncate select-all">
                                    {code}
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {isLink ? (
                                      <a
                                        href={code}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="p-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 hover:opacity-80 transition"
                                        title="Buka Tautan"
                                      >
                                        <ExternalLink className="w-3.5 h-3.5" />
                                      </a>
                                    ) : null}
                                    <button
                                      onClick={() => copyToClipboard(code)}
                                      className="p-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 transition"
                                      title="Salin Lisensi"
                                    >
                                      {copiedKey === code ? (
                                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                                      ) : (
                                        <Copy className="w-3.5 h-3.5" />
                                      )}
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Logged Out: Login or Register */
            <div className="space-y-4">
              {/* Tab Selector */}
              <div className="flex items-center p-1 bg-zinc-100 dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => { setActiveTab('login'); setErrorMessage(''); }}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition ${
                    activeTab === 'login'
                      ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs'
                      : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                  }`}
                >
                  Masuk Akun
                </button>
                <button
                  type="button"
                  onClick={() => { setActiveTab('register'); setErrorMessage(''); }}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition ${
                    activeTab === 'register'
                      ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs'
                      : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                  }`}
                >
                  Daftar Baru
                </button>
              </div>

              {/* Error / Success Notifications */}
              {errorMessage && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {successMessage && (
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2">
                  <Check className="w-4 h-4 shrink-0" />
                  <span>{successMessage}</span>
                </div>
              )}

              {activeTab === 'login' ? (
                /* Login Form */
                <form onSubmit={handleLogin} className="space-y-3.5">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-zinc-600 dark:text-zinc-400">
                      Alamat Email
                    </label>
                    <div className="relative">
                      <input
                        type="email"
                        required
                        placeholder="nama@email.com"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        className="w-full pl-9 pr-3.5 py-2.5 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition"
                      />
                      <Mail className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-3" />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-zinc-600 dark:text-zinc-400">
                      Kata Sandi
                    </label>
                    <div className="relative">
                      <input
                        type="password"
                        required
                        placeholder="••••••••"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        className="w-full pl-9 pr-3.5 py-2.5 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition"
                      />
                      <Lock className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-3" />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full mt-2 py-3 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-bold text-xs hover:opacity-90 transition shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Memverifikasi...</span>
                      </>
                    ) : (
                      <span>Masuk Akun</span>
                    )}
                  </button>
                </form>
              ) : (
                /* Register Form */
                <form onSubmit={handleRegister} className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-zinc-600 dark:text-zinc-400">
                      Nama Lengkap
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        required
                        placeholder="Rian Kurniawan"
                        value={registerName}
                        onChange={(e) => setRegisterName(e.target.value)}
                        className="w-full pl-9 pr-3.5 py-2.5 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition"
                      />
                      <User className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-3" />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-zinc-600 dark:text-zinc-400">
                      Alamat Email
                    </label>
                    <div className="relative">
                      <input
                        type="email"
                        required
                        placeholder="rian@example.com"
                        value={registerEmail}
                        onChange={(e) => setRegisterEmail(e.target.value)}
                        className="w-full pl-9 pr-3.5 py-2.5 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition"
                      />
                      <Mail className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-3" />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-zinc-600 dark:text-zinc-400">
                      Nomor WhatsApp (Opsional)
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="08123456789"
                        value={registerPhone}
                        onChange={(e) => setRegisterPhone(e.target.value)}
                        className="w-full pl-9 pr-3.5 py-2.5 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition"
                      />
                      <Phone className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-3" />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-zinc-600 dark:text-zinc-400">
                      Kata Sandi (Minimal 6 Karakter)
                    </label>
                    <div className="relative">
                      <input
                        type="password"
                        required
                        minLength={6}
                        placeholder="••••••••"
                        value={registerPassword}
                        onChange={(e) => setRegisterPassword(e.target.value)}
                        className="w-full pl-9 pr-3.5 py-2.5 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition"
                      />
                      <Lock className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-3" />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full mt-2 py-3 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-bold text-xs hover:opacity-90 transition shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Membuat akun...</span>
                      </>
                    ) : (
                      <span>Daftar Akun Pixel Store</span>
                    )}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
