'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  KeyRound, 
  Mail, 
  Lock, 
  ArrowLeft, 
  Check, 
  AlertCircle, 
  Loader2, 
  RotateCw 
} from 'lucide-react';
import { actions } from '@/actions';

interface ResetPasswordCardProps {
  onSuccess?: () => void;
  onBackToLogin?: () => void;
  initialEmail?: string;
  isModal?: boolean;
}

export const ResetPasswordCard: React.FC<ResetPasswordCardProps> = ({
  onSuccess,
  onBackToLogin,
  initialEmail = '',
  isModal = false,
}) => {
  const searchParams = useSearchParams();
  const router = useRouter();

  const queryEmail = searchParams?.get('email') || initialEmail || '';
  const queryCode = searchParams?.get('code') || '';

  const [step, setStep] = useState<'request' | 'verify'>(queryCode ? 'verify' : 'request');
  const [email, setEmail] = useState<string>(queryEmail);
  const [code, setCode] = useState<string>(queryCode);
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [resendCooldown, setResendCooldown] = useState<number>(0);

  useEffect(() => {
    if (queryEmail && !email) {
      setEmail(queryEmail);
    }
  }, [queryEmail]);

  useEffect(() => {
    if (queryCode && !code) {
      setCode(queryCode);
      setStep('verify');
    }
  }, [queryCode]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Handle Step 1: Request Code
  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setErrorMessage('Alamat email wajib diisi.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await actions.requestPasswordReset({ email: cleanEmail });
      if (res.error) {
        setErrorMessage(res.error.message || 'Gagal mengirim kode verifikasi.');
      } else {
        setSuccessMessage(res.data?.message || 'Kode verifikasi 6 digit telah dikirim ke email Anda.');
        setStep('verify');
        setResendCooldown(60);
      }
    } catch (err) {
      setErrorMessage((err as Error).message || 'Terjadi kesalahan sistem.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Step 2: Verify Code and Reset Password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    const cleanEmail = email.trim().toLowerCase();
    const cleanCode = code.trim();

    if (!cleanCode || cleanCode.length !== 6) {
      setErrorMessage('Kode verifikasi harus terdiri dari 6 digit angka.');
      return;
    }

    if (newPassword.length < 6) {
      setErrorMessage('Kata sandi baru minimal harus terdiri dari 6 karakter.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('Konfirmasi kata sandi tidak cocok.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await actions.resetPasswordWithCode({
        email: cleanEmail,
        code: cleanCode,
        newPassword,
      });

      if (res.error) {
        setErrorMessage(res.error.message || 'Gagal mengatur ulang kata sandi.');
      } else {
        setSuccessMessage('Kata sandi berhasil diperbarui! Mengalihkan ke akun Anda...');
        setTimeout(() => {
          if (onSuccess) {
            onSuccess();
          } else {
            router.push('/user');
          }
        }, 1500);
      }
    } catch (err) {
      setErrorMessage((err as Error).message || 'Terjadi kesalahan saat memproses.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || isLoading) return;
    setErrorMessage('');
    setIsLoading(true);

    try {
      const res = await actions.requestPasswordReset({ email: email.trim().toLowerCase() });
      if (res.error) {
        setErrorMessage(res.error.message || 'Gagal mengirim ulang kode.');
      } else {
        setSuccessMessage('Kode verifikasi baru telah dikirimkan ke email Anda.');
        setResendCooldown(60);
      }
    } catch (err) {
      setErrorMessage((err as Error).message || 'Gagal mengirim ulang kode.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`w-full ${isModal ? '' : 'bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-xl p-6 sm:p-8'} space-y-5 animate-in fade-in duration-200`}>
      {/* Header */}
      <div className="space-y-1.5 text-center">
        <div className="w-10 h-10 rounded-2xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 mx-auto flex items-center justify-center font-bold shadow-xs">
          <KeyRound className="w-5 h-5" />
        </div>
        <h2 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-zinc-100">
          {step === 'request' ? 'Reset Kata Sandi' : 'Verifikasi & Sandi Baru'}
        </h2>
        <p className="text-xs text-zinc-500 max-w-sm mx-auto">
          {step === 'request'
            ? 'Masukkan alamat email akun Anda. Kami akan mengirimkan kode 6 digit untuk verifikasi.'
            : `Masukkan kode 6 digit yang dikirim ke ${email || 'email Anda'} dan tentukan kata sandi baru.`}
        </p>
      </div>

      {/* Notifications */}
      {errorMessage && (
        <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2.5 animate-in fade-in">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
          <span className="leading-relaxed">{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2.5 animate-in fade-in">
          <Check className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span className="leading-relaxed">{successMessage}</span>
        </div>
      )}

      {step === 'request' ? (
        /* STEP 1: Request Email Form */
        <form onSubmit={handleRequestCode} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-zinc-600 dark:text-zinc-400">
              Alamat Email Terdaftar
            </label>
            <div className="relative">
              <input
                type="email"
                required
                autoFocus
                placeholder="nama@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition"
              />
              <Mail className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3" />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-bold text-xs hover:opacity-90 transition shadow-xs disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Mengirim Kode...</span>
              </>
            ) : (
              <span>Kirim Kode Verifikasi</span>
            )}
          </button>

          <div className="pt-2 text-center">
            {onBackToLogin ? (
              <button
                type="button"
                onClick={onBackToLogin}
                className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 font-medium transition cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Kembali ke halaman masuk</span>
              </button>
            ) : (
              <Link
                href="/user"
                className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 font-medium transition cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Kembali ke dasbor masuk</span>
              </Link>
            )}
          </div>
        </form>
      ) : (
        /* STEP 2: Verify Code and New Password */
        <form onSubmit={handleResetPassword} className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-zinc-600 dark:text-zinc-400">
                Kode Verifikasi 6 Digit
              </label>
              <button
                type="button"
                onClick={() => setStep('request')}
                className="text-[11px] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition"
              >
                Ganti Email
              </button>
            </div>
            <input
              type="text"
              required
              autoFocus
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="w-full text-center tracking-[0.35em] font-mono text-base font-bold py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-zinc-600 dark:text-zinc-400">
              Kata Sandi Baru
            </label>
            <div className="relative">
              <input
                type="password"
                required
                placeholder="Minimal 6 karakter"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition"
              />
              <Lock className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-zinc-600 dark:text-zinc-400">
              Konfirmasi Kata Sandi Baru
            </label>
            <div className="relative">
              <input
                type="password"
                required
                placeholder="Ketik ulang kata sandi baru"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition"
              />
              <Lock className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3" />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-bold text-xs hover:opacity-90 transition shadow-xs disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Memperbarui Sandi...</span>
              </>
            ) : (
              <span>Simpan & Masuk Akun</span>
            )}
          </button>

          <div className="pt-2 flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={() => setStep('request')}
              className="inline-flex items-center gap-1 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 font-medium transition cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Kembali</span>
            </button>

            <button
              type="button"
              disabled={resendCooldown > 0 || isLoading}
              onClick={handleResend}
              className="inline-flex items-center gap-1.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 font-medium transition disabled:opacity-40 cursor-pointer"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>
                {resendCooldown > 0 ? `Kirim ulang (${resendCooldown}s)` : 'Kirim Ulang Kode'}
              </span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
