import React, { useState } from 'react';
import { actions } from 'astro:actions';
import { 
  Lock, 
  Eye, 
  EyeOff, 
  ArrowRight, 
  AlertCircle, 
  Loader2, 
  ArrowLeft,
  ShieldCheck
} from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';

export const AdminLoginForm: React.FC = () => {
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin.trim()) return;

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const { data, error } = await actions.adminLogin({ pin: pin.trim() });
      if (error || !data) {
        setErrorMessage(error?.message || 'PIN Akses tidak valid. Silakan coba lagi.');
        setIsLoading(false);
        return;
      }

      // Success -> Redirect to Admin Panel
      window.location.href = '/admin';
    } catch (err) {
      setErrorMessage((err as Error).message || 'Terjadi kesalahan sistem.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#09090b] flex flex-col justify-center items-center px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
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

        {/* Login Card */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-7 shadow-xs space-y-6">
          <div className="space-y-1.5 text-center">
            <div className="flex justify-center pb-1">
              <img
                src="/logo.svg"
                alt="Pixel Store"
                className="w-12 h-12 rounded-xl shadow-xs text-zinc-900 dark:text-white"
              />
            </div>
            <h1 className="text-xl font-extrabold tracking-tight text-zinc-900 dark:text-white pt-1">
              Dashboard PIXEL STORE
            </h1>
            <p className="text-xs text-zinc-500">
              Masukkan PIN Rahasia Admin untuk login.
            </p>
          </div>

          {errorMessage && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl flex items-center gap-2 text-xs text-red-600 dark:text-red-400 animate-in fade-in duration-150">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                PIN Rahasia Admin
              </label>
              <div className="relative">
                <input
                  type={showPin ? 'text' : 'password'}
                  required
                  autoFocus
                  placeholder="Masukkan PIN..."
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  className="w-full pl-3.5 pr-10 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="absolute right-3 top-2.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                  tabIndex={-1}
                >
                  {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || !pin.trim()}
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
          </form>
        </div>
      </div>
    </div>
  );
};
