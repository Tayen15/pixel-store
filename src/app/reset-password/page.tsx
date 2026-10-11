import { Suspense } from 'react';
import type { Metadata } from 'next';
import { StoreNavbar } from '@/components/layout/StoreNavbar';
import { StoreFooter } from '@/components/layout/StoreFooter';
import { ResetPasswordCard } from '@/components/ResetPasswordCard';

export const metadata: Metadata = {
  title: 'Reset Kata Sandi | Pixel Store',
  description: 'Atur ulang kata sandi akun pelanggan Pixel Store Anda dengan aman.',
};

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100 flex flex-col selection:bg-emerald-500 selection:text-white">
      <StoreNavbar activePage="home" />

      <main className="flex-1 max-w-lg w-full mx-auto px-4 py-12 flex flex-col items-center justify-center">
        <Suspense fallback={
          <div className="w-full bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 animate-pulse text-center text-xs text-zinc-400">
            Memuat formulir reset kata sandi...
          </div>
        }>
          <ResetPasswordCard />
        </Suspense>
      </main>

      <StoreFooter />
    </div>
  );
}
