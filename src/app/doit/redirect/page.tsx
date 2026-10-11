'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { CheckCircle2, ArrowRight } from 'lucide-react';

export default function DoitRedirectPage() {
  useEffect(() => {
    const timer = setTimeout(() => {
      window.location.href = '/user';
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-[75vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full p-8 bg-white dark:bg-[#121214] border border-zinc-200 dark:border-zinc-800 rounded-3xl text-center space-y-5 shadow-xs animate-in zoom-in-95 duration-200">
        <div className="w-16 h-16 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center mx-auto border border-emerald-500/20">
          <CheckCircle2 className="w-8 h-8" />
        </div>

        <div className="space-y-1.5">
          <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">Pembayaran Diterima</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
            Terima kasih! Pembayaran QRIS Anda melalui Doit.id telah terverifikasi secara instan.
          </p>
        </div>

        <div className="pt-2 space-y-2">
          <Link
            href="/user"
            className="w-full py-3 px-4 bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 font-bold rounded-xl text-xs transition flex items-center justify-center gap-1.5 shadow-xs"
          >
            <span>Buka Dashboard & Lihat Lisensi</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
          <Link
            href="/"
            className="w-full py-2.5 px-4 text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 transition block"
          >
            Kembali ke Katalog
          </Link>
        </div>
      </div>
    </div>
  );
}
