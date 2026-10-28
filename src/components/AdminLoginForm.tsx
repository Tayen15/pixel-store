'use client';

import React, { useState, useEffect } from 'react';
import { actions } from '@/actions';
import { 
  Lock, 
  Mail,
  User,
  Eye, 
  EyeOff, 
  ArrowRight, 
  AlertCircle, 
  Loader2, 
  ArrowLeft,
  ShieldCheck,
  KeyRound,
  UserCheck
} from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { authClient } from '@/lib/auth/client';

const GoogleIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
    />
  </svg>
);

export const AdminLoginForm: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');
  
  // Login form states
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [useEmergencyPin, setUseEmergencyPin] = useState(false);
  const [emergencyPin, setEmergencyPin] = useState('');
  
  // Register form states
  const [registerName, setRegisterName] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerAdminKey, setRegisterAdminKey] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const authErr = params.get('auth_error');
      if (authErr === 'forbidden_not_admin') {
        setErrorMessage('Akun Google ini terdaftar sebagai pelanggan biasa dan tidak memiliki hak akses Administrator.');
      } else if (authErr === 'missing_google_credentials') {
        setErrorMessage('Kredensial Google OAuth belum disetel di server.');
      } else if (authErr && authErr !== 'oauth_cancelled') {
        setErrorMessage(`Autentikasi Google gagal (${authErr}).`);
      }
    }
  }, []);

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await authClient.signIn.social({
        provider: 'google',
        callbackURL: typeof window !== 'undefined' ? `${window.location.origin}/admin` : '/admin',
      });
    } catch (err) {
      console.error('Admin Google sign-in error:', err);
      setErrorMessage((err as Error).message || 'Gagal memulai autentikasi Google.');
      setIsGoogleLoading(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      if (useEmergencyPin) {
        if (!emergencyPin.trim()) {
          setErrorMessage('PIN Akses tidak boleh kosong.');
          setIsLoading(false);
          return;
        }
        const { data, error } = await actions.adminLogin({ pin: emergencyPin.trim() });
        if (error || !data) {
          setErrorMessage(error?.message || 'PIN Akses tidak valid.');
          setIsLoading(false);
          return;
        }
      } else {
        if (!loginEmail.trim() || !loginPassword.trim()) {
          setErrorMessage('Email dan Kata Sandi wajib diisi.');
          setIsLoading(false);
          return;
        }
        const { data, error } = await actions.adminLogin({
          email: loginEmail.trim(),
          password: loginPassword,
        });
        if (error || !data) {
          setErrorMessage(error?.message || 'Email atau kata sandi tidak valid.');
          setIsLoading(false);
          return;
        }
      }

      setSuccessMessage('Autentikasi berhasil! Mengalihkan ke dashboard...');
      setTimeout(() => {
        window.location.href = '/admin';
      }, 500);
    } catch (err) {
      setErrorMessage((err as Error).message || 'Terjadi kesalahan sistem.');
      setIsLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const { data, error } = await actions.adminRegister({
        name: registerName.trim(),
        email: registerEmail.trim(),
        password: registerPassword,
        adminKey: registerAdminKey.trim(),
      });

      if (error || !data) {
        setErrorMessage(error?.message || 'Gagal mendaftarkan akun admin.');
        setIsLoading(false);
        return;
      }

      setSuccessMessage('Akun admin berhasil didaftarkan! Mengalihkan ke dashboard...');
      setTimeout(() => {
        window.location.href = '/admin';
      }, 500);
    } catch (err) {
      setErrorMessage((err as Error).message || 'Terjadi kesalahan sistem.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#09090b] flex flex-col justify-center items-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        {/* Back Link & Theme Toggle */}
        <div className="flex items-center justify-between">
          <a
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Kembali ke Toko Publik</span>
          </a>
          <ThemeToggle />
        </div>

        {/* Card Container */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-7 shadow-xs space-y-6">
          {/* Header */}
          <div className="space-y-1.5 text-center">
            <div className="flex justify-center pb-1">
              <img
                src="/logo.svg"
                alt="Pixel Store"
                className="w-12 h-12 rounded-xl shadow-xs text-zinc-900 dark:text-white"
              />
            </div>
            <h1 className="text-xl font-extrabold tracking-tight text-zinc-900 dark:text-white pt-1">
              Portal Administrator
            </h1>
            <p className="text-xs text-zinc-500">
              Akses khusus staf pengelola toko Pixel Store via Better Auth
            </p>
          </div>

          {/* Tab Selector */}
          <div className="grid grid-cols-2 p-1 bg-zinc-100 dark:bg-zinc-800/80 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setActiveTab('login');
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
              className={`py-2 text-xs font-semibold rounded-lg transition ${
                activeTab === 'login'
                  ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-xs'
                  : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              Masuk Akun Admin
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('register');
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
              className={`py-2 text-xs font-semibold rounded-lg transition ${
                activeTab === 'register'
                  ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-xs'
                  : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              Daftar Akun Admin
            </button>
          </div>

          {/* Feedback Alerts */}
          {errorMessage && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl flex items-center gap-2 text-xs text-red-600 dark:text-red-400 animate-in fade-in duration-150">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-xl flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 animate-in fade-in duration-150">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* TAB 1: LOGIN */}
          {activeTab === 'login' && (
            <div className="space-y-4">
              {!useEmergencyPin && (
                <>
                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={isGoogleLoading || isLoading}
                    className="w-full py-2.5 px-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800/80 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-semibold text-xs transition flex items-center justify-center gap-2.5 shadow-2xs hover:shadow-xs disabled:opacity-50 cursor-pointer"
                  >
                    {isGoogleLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
                        <span>Menghubungkan ke Google...</span>
                      </>
                    ) : (
                      <>
                        <GoogleIcon className="w-4 h-4 shrink-0" />
                        <span>Masuk dengan Google (Akun Admin)</span>
                      </>
                    )}
                  </button>

                  <div className="relative flex items-center justify-center">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-zinc-200 dark:border-zinc-800" />
                    </div>
                    <span className="relative bg-white dark:bg-zinc-900 px-2.5 text-[10px] font-medium tracking-wider text-zinc-400 uppercase">
                      atau gunakan email & kata sandi
                    </span>
                  </div>
                </>
              )}

              <form onSubmit={handleLoginSubmit} className="space-y-4">
              {!useEmergencyPin ? (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                      Email Administrator
                    </label>
                    <div className="relative">
                      <input
                        type="email"
                        required
                        autoFocus
                        placeholder="admin@pixelstore.id"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition"
                      />
                      <Mail className="w-4 h-4 text-zinc-400 absolute left-3 top-3" />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                        Kata Sandi
                      </label>
                      <a
                        href="/reset-password"
                        className="text-[11px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 transition font-medium"
                      >
                        Lupa kata sandi?
                      </a>
                    </div>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        placeholder="••••••••"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        className="w-full pl-9 pr-10 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition"
                      />
                      <Lock className="w-4 h-4 text-zinc-400 absolute left-3 top-3" />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-2.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                      Master PIN Darurat
                    </label>
                    <span className="text-[10px] text-amber-500 font-medium">Bypass Mode</span>
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoFocus
                      placeholder="Masukkan Master PIN..."
                      value={emergencyPin}
                      onChange={(e) => setEmergencyPin(e.target.value)}
                      className="w-full pl-9 pr-10 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition"
                    />
                    <KeyRound className="w-4 h-4 text-zinc-400 absolute left-3 top-3" />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-2.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 font-semibold rounded-xl text-xs transition flex items-center justify-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Memverifikasi Akses...</span>
                  </>
                ) : (
                  <>
                    <span>Masuk ke Dashboard</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="pt-1 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setUseEmergencyPin(!useEmergencyPin);
                    setErrorMessage(null);
                  }}
                  className="text-[11px] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 underline transition cursor-pointer"
                >
                  {useEmergencyPin ? 'Gunakan Login Akun (Email & Password)' : 'Gunakan Master PIN Darurat'}
                </button>
              </div>
            </form>
          </div>
        )}

          {/* TAB 2: REGISTER ADMIN */}
          {activeTab === 'register' && (
            <form onSubmit={handleRegisterSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Nama Lengkap
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    placeholder="Nama Administrator"
                    value={registerName}
                    onChange={(e) => setRegisterName(e.target.value)}
                    className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition"
                  />
                  <User className="w-4 h-4 text-zinc-400 absolute left-3 top-3" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Email Administrator
                </label>
                <div className="relative">
                  <input
                    type="email"
                    required
                    placeholder="admin@pixelstore.id"
                    value={registerEmail}
                    onChange={(e) => setRegisterEmail(e.target.value)}
                    className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition"
                  />
                  <Mail className="w-4 h-4 text-zinc-400 absolute left-3 top-3" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Kata Sandi (Min. 6 Karakter)
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="••••••••"
                    value={registerPassword}
                    onChange={(e) => setRegisterPassword(e.target.value)}
                    className="w-full pl-9 pr-10 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition"
                  />
                  <Lock className="w-4 h-4 text-zinc-400 absolute left-3 top-3" />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Kunci Otorisasi Toko (Master PIN)
                  </label>
                  <span className="text-[10px] text-zinc-400">Verifikasi Kepemilikan</span>
                </div>
                <div className="relative">
                  <input
                    type="password"
                    required
                    placeholder="Masukkan Master PIN..."
                    value={registerAdminKey}
                    onChange={(e) => setRegisterAdminKey(e.target.value)}
                    className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-xs font-mono focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition"
                  />
                  <KeyRound className="w-4 h-4 text-zinc-400 absolute left-3 top-3" />
                </div>
                <p className="text-[11px] text-zinc-400 mt-1">
                  Diperlukan Master PIN (dari .env: ADMIN_SECRET_PIN) untuk mencegah pendaftaran publik ilegal.
                </p>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 font-semibold rounded-xl text-xs transition flex items-center justify-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Mendaftarkan Akun...</span>
                  </>
                ) : (
                  <>
                    <UserCheck className="w-4 h-4" />
                    <span>Daftarkan Akun & Masuk</span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
