import React from 'react';
import {
  Menu,
  TrendingUp,
  RefreshCw,
  LogOut,
  ExternalLink,
  Clock,
} from 'lucide-react';
import { ThemeToggle } from '../ThemeToggle';
import type { AdminTab } from './AdminSidebar';

interface AdminHeaderProps {
  activeTab: AdminTab;
  liveFx: { rate: number; source: string; updatedAt?: string };
  isRefreshingFx: boolean;
  onRefreshFx: () => void;
  onLogout: () => void;
  onOpenMobileSidebar: () => void;
}

export const AdminHeader: React.FC<AdminHeaderProps> = ({
  activeTab,
  liveFx,
  isRefreshingFx,
  onRefreshFx,
  onLogout,
  onOpenMobileSidebar,
}) => {
  const getTabTitle = (tab: AdminTab) => {
    switch (tab) {
      case 'overview':
        return 'Ringkasan Toko';
      case 'orders':
        return 'Manajemen Pesanan & Transaksi';
      case 'catalog':
        return 'Katalog Produk & Kontrol Stok';
      case 'users':
        return 'Daftar Akun Pelanggan';
      case 'pricing':
        return 'Mesin Nilai Tukar & Margin Keuntungan';
      case 'settings':
        return 'Pengaturan & Profil Toko';
      default:
        return 'Dashboard Pengelola';
    }
  };

  return (
    <header className="sticky top-0 z-30 h-16 w-full bg-white/80 dark:bg-[#0f0f11]/80 backdrop-blur-md border-b border-zinc-200/80 dark:border-zinc-800/80 px-4 sm:px-6 flex items-center justify-between">
      {/* Left: Mobile Toggle & Breadcrumb */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenMobileSidebar}
          className="p-2 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 lg:hidden"
          aria-label="Buka Menu"
        >
          <Menu className="w-4 h-4" />
        </button>

        <div>
          <h1 className="text-sm sm:text-base font-extrabold text-zinc-900 dark:text-white tracking-tight leading-none">
            {getTabTitle(activeTab)}
          </h1>
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 mt-0.5">
            <span>Pixel Store</span>
            <span>/</span>
            <span className="capitalize">{activeTab}</span>
          </div>
        </div>
      </div>

      {/* Right: Live FX Widget, Theme Toggle, Public Store link, Logout */}
      <div className="flex items-center gap-2 sm:gap-2.5">
        {/* Live FX Badge */}
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 text-xs">
          <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
          <span className="text-zinc-500 text-[11px]">USDT/IDR:</span>
          <span className="font-mono font-bold text-zinc-900 dark:text-white">
            Rp {liveFx.rate?.toLocaleString('id-ID')}
          </span>
          <button
            onClick={onRefreshFx}
            disabled={isRefreshingFx}
            className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition cursor-pointer"
            title="Segarkan Kurs Realtime"
          >
            <RefreshCw className={`w-3 h-3 ${isRefreshingFx ? 'animate-spin text-emerald-500' : ''}`} />
          </button>
        </div>

        {/* Theme Toggle (Light / Dark) */}
        <ThemeToggle />

        {/* View Storefront */}
        <a
          href="/"
          target="_blank"
          rel="noreferrer"
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900 text-xs font-semibold text-zinc-700 dark:text-zinc-300 transition shadow-xs"
        >
          <span>Toko</span>
          <ExternalLink className="w-3.5 h-3.5 text-zinc-400" />
        </a>

        {/* Logout Button */}
        <button
          onClick={onLogout}
          className="p-2 sm:px-3 sm:py-1.5 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50/50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-900/50 text-xs font-semibold text-red-600 dark:text-red-400 transition flex items-center gap-1.5 shadow-xs cursor-pointer"
          title="Keluar dari Panel Admin"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Keluar</span>
        </button>
      </div>
    </header>
  );
};
