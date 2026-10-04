import React from 'react';
import { ShieldCheck, Zap, Headphones, Lock } from 'lucide-react';

export const StoreFooter: React.FC = () => {
  return (
    <footer className="mt-auto border-t border-zinc-200/80 dark:border-zinc-800/80 py-10 bg-white dark:bg-zinc-950 text-xs text-zinc-500 transition-colors">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 pb-8 border-b border-zinc-100 dark:border-zinc-900">
          {/* Brand Info */}
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="Pixel Store" className="w-8 h-8 rounded-lg shadow-xs" />
            <div>
              <span className="font-extrabold text-sm tracking-tight text-zinc-900 dark:text-zinc-100 block">
                PIXEL STORE
              </span>
            </div>
          </div>
        </div>

        {/* Bottom Links & Copyright */}
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-zinc-400">
          <div>© {new Date().getFullYear()} Pixel Store. All Rights Reserved.</div>

          <div className="flex items-center gap-4 flex-wrap">
            <a
              href="/"
              className="hover:text-zinc-700 dark:hover:text-zinc-200 transition underline underline-offset-2"
            >
              Katalog Produk
            </a>
            <a
              href="/user"
              className="hover:text-zinc-700 dark:hover:text-zinc-200 transition underline underline-offset-2"
            >
              Dashboard Pelanggan
            </a>
            <a
              href="/support"
              className="hover:text-zinc-700 dark:hover:text-zinc-200 transition underline underline-offset-2"
            >
              Live Chat Bantuan
            </a>
            <a
              href="/admin"
              className="hover:text-zinc-700 dark:hover:text-zinc-200 transition underline underline-offset-2"
            >
              Portal Admin
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};
