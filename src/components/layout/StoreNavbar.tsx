'use client';

import React, { useState, useEffect } from 'react';
import {
  Search,
  MessageCircle,
  User,
  ShoppingBag,
  Menu,
  X,
  LogIn,
  CheckCircle2,
} from 'lucide-react';
import { ThemeToggle } from '../ThemeToggle';
import { OrderLookupModal } from '../OrderLookupModal';
import { getCurrentUser } from '@/app/actions';

interface StoreNavbarProps {
  activePage?: 'home' | 'user' | 'support';
}

export const StoreNavbar: React.FC<StoreNavbarProps> = ({ activePage = 'home' }) => {
  const [isLookupOpen, setIsLookupOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    getCurrentUser()
      .then((res) => {
        if (res.data?.user) {
          setCurrentUser(res.data.user);
        } else {
          setCurrentUser(null);
        }
      })
      .catch(() => {
        setCurrentUser(null);
      })
      .finally(() => {
        setIsLoadingUser(false);
      });
  }, []);

  const getInitials = (name: string) => {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  return (
    <>
      {/* Floating Pill Navbar */}
      <header className="sticky top-3 sm:top-4 z-40 w-full px-3 sm:px-6 pointer-events-none transition-all">
        <div className="max-w-5xl mx-auto">
          {/* Main Floating Pill Bar */}
          <div className="pointer-events-auto backdrop-blur-xl bg-white/85 dark:bg-zinc-950/85 border border-zinc-200/90 dark:border-zinc-800/90 shadow-lg shadow-zinc-950/5 dark:shadow-black/40 rounded-full px-2.5 sm:px-3.5 py-2 flex items-center justify-between transition-all">
            {/* Left: Brand Logo & Title Pill */}
            <a
              href="/"
              className="flex items-center gap-2.5 pl-1 pr-3 py-1 rounded-full hover:bg-zinc-100/70 dark:hover:bg-zinc-900/70 transition-colors group"
            >
              <img
                src="/logo.svg"
                alt="Pixel Store"
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-full shadow-2xs group-hover:scale-105 transition-transform"
              />
              <div className="flex flex-col">
                <span className="font-extrabold tracking-tight text-xs sm:text-sm text-zinc-900 dark:text-white leading-none">
                  PIXEL STORE
                </span>
                <span className="text-[9px] text-zinc-400 font-medium tracking-wide">
                  DIGITAL STORE
                </span>
              </div>
            </a>

            {/* Center: Navigation Pill Segment */}
            <nav className="hidden md:flex items-center gap-1 bg-zinc-100/80 dark:bg-zinc-900/80 p-1 rounded-full border border-zinc-200/60 dark:border-zinc-800/60">
              <a
                href="/"
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  activePage === 'home'
                    ? 'bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                }`}
              >
                Katalog Produk
              </a>

              <button
                onClick={() => setIsLookupOpen(true)}
                className="px-3.5 py-1.5 rounded-full text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-zinc-800/60 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Search className="w-3.5 h-3.5 text-zinc-400" />
                <span>Lacak Pesanan</span>
              </button>

              <a
                href="/support"
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  activePage === 'support'
                    ? 'bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-zinc-800/60'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <MessageCircle className="w-3.5 h-3.5" />
                <span>Live Support</span>
              </a>
            </nav>

            {/* Right: Actions (Theme Toggle & Account Pill) */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              <ThemeToggle className="!rounded-full w-8 h-8 !p-0" />

              {/* Desktop Auth State Pill */}
              {isLoadingUser ? (
                <div className="h-8 w-22 rounded-full bg-zinc-100 dark:bg-zinc-850 animate-pulse border border-zinc-200/60 dark:border-zinc-800/60" />
              ) : currentUser ? (
                <a
                  href="/user"
                  className={`group pl-1.5 pr-3 py-1 rounded-full border text-xs font-semibold transition-all flex items-center gap-2 shadow-2xs ${
                    activePage === 'user'
                      ? 'border-zinc-900 dark:border-white bg-zinc-900 text-white dark:bg-white dark:text-zinc-950'
                      : 'border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/90 dark:bg-zinc-900/90 text-zinc-900 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-850'
                  }`}
                  title={`Akun: ${currentUser.name} (${currentUser.email})`}
                >
                  <div className="relative flex items-center justify-center shrink-0">
                    {currentUser.image ? (
                      <img
                        src={currentUser.image}
                        alt={currentUser.name}
                        className="w-6 h-6 rounded-full object-cover ring-1.5 ring-emerald-500/70"
                      />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-zinc-200 dark:bg-zinc-750 text-zinc-800 dark:text-zinc-200 text-[10px] font-bold flex items-center justify-center ring-1.5 ring-emerald-500/70">
                        {getInitials(currentUser.name)}
                      </div>
                    )}
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-zinc-900 animate-pulse" />
                  </div>
                  <div className="flex items-center gap-1.5 max-w-[110px]">
                    <span className="truncate leading-none">
                      {currentUser.name.split(' ')[0]}
                    </span>
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                        activePage === 'user'
                          ? 'bg-zinc-800 dark:bg-zinc-200 text-zinc-200 dark:text-zinc-800'
                          : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/60'
                      }`}
                    >
                      Aktif
                    </span>
                  </div>
                </a>
              ) : (
                <a
                  href="/user"
                  className={`px-4 py-1.5 rounded-full border text-xs font-semibold transition-all flex items-center gap-1.5 shadow-2xs ${
                    activePage === 'user'
                      ? 'border-blue-500 bg-blue-600 text-white'
                      : 'border-zinc-900 dark:border-white bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 hover:opacity-90'
                  }`}
                  title="Masuk atau Daftar Akun"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Masuk</span>
                </a>
              )}

              {/* Mobile Menu Toggle */}
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="md:hidden p-2 rounded-full text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                aria-label="Toggle Menu"
              >
                {isMobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Floating Mobile Dropdown Menu */}
          {isMobileMenuOpen && (
            <div className="md:hidden mt-2 pointer-events-auto rounded-3xl backdrop-blur-xl bg-white/95 dark:bg-zinc-950/95 border border-zinc-200/80 dark:border-zinc-800/80 shadow-2xl p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
              {/* Mobile Account Section */}
              {!isLoadingUser &&
                (currentUser ? (
                  <div className="p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-900/70 border border-zinc-200/80 dark:border-zinc-800/80 space-y-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="relative shrink-0">
                        {currentUser.image ? (
                          <img
                            src={currentUser.image}
                            alt={currentUser.name}
                            className="w-9 h-9 rounded-full object-cover ring-2 ring-emerald-500/50"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 text-xs font-bold flex items-center justify-center ring-2 ring-emerald-500/50">
                            {getInitials(currentUser.name)}
                          </div>
                        )}
                        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-zinc-900" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-bold text-zinc-900 dark:text-white truncate">
                            {currentUser.name}
                          </p>
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/60">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Online
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                          {currentUser.email}
                        </p>
                      </div>
                    </div>
                    <a
                      href="/user"
                      className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-full bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 text-xs font-semibold hover:opacity-90 transition shadow-2xs"
                    >
                      <User className="w-3.5 h-3.5" />
                      <span>Dashboard Akun & Riwayat</span>
                    </a>
                  </div>
                ) : (
                  <a
                    href="/user"
                    className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-full bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 text-xs font-semibold shadow-2xs hover:opacity-90 transition"
                  >
                    <LogIn className="w-4 h-4" />
                    <span>Masuk ke Akun Anda</span>
                  </a>
                ))}

              {/* Navigation links */}
              <div className="space-y-1 pt-1 border-t border-zinc-100 dark:border-zinc-850">
                <a
                  href="/"
                  className={`block px-3.5 py-2 rounded-full text-xs font-semibold ${
                    activePage === 'home'
                      ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                  }`}
                >
                  Katalog Produk
                </a>
                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    setIsLookupOpen(true);
                  }}
                  className="w-full text-left px-3.5 py-2 rounded-full text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white flex items-center gap-2"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>Lacak Pesanan</span>
                </button>
                <a
                  href="/support"
                  className={`block px-3.5 py-2 rounded-full text-xs font-semibold ${
                    activePage === 'support'
                      ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                  }`}
                >
                  Live Support Chat
                </a>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Shared Order Lookup Modal */}
      <OrderLookupModal isOpen={isLookupOpen} onClose={() => setIsLookupOpen(false)} />
    </>
  );
};
