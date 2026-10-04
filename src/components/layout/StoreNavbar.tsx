import React, { useState, useEffect } from 'react';
import {
  Search,
  MessageCircle,
  User,
  ShoppingBag,
  Menu,
  X,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';
import { ThemeToggle } from '../ThemeToggle';
import { OrderLookupModal } from '../OrderLookupModal';
import { actions } from 'astro:actions';

interface StoreNavbarProps {
  activePage?: 'home' | 'user' | 'support';
}

export const StoreNavbar: React.FC<StoreNavbarProps> = ({ activePage = 'home' }) => {
  const [isLookupOpen, setIsLookupOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    actions
      .getCurrentUser()
      .then((res) => {
        if (res.data?.user) {
          setCurrentUser(res.data.user);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <>
      <header className="sticky top-0 z-40 w-full backdrop-blur-md bg-white/80 dark:bg-zinc-950/80 border-b border-zinc-200/80 dark:border-zinc-800/80 transition-colors">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* Brand Logo & Name */}
          <a href="/" className="flex items-center gap-2.5 group">
            <img
              src="/logo.svg"
              alt="Pixel Store"
              className="w-8 h-8 rounded-lg shadow-xs group-hover:scale-105 transition-transform"
            />
            <div className="flex flex-col">
              <span className="font-extrabold tracking-tight text-sm text-zinc-900 dark:text-white leading-none">
                PIXEL STORE
              </span>
              <span className="text-[10px] text-zinc-400 font-medium">Digital Store</span>
            </div>
          </a>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1.5">
            <a
              href="/"
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                activePage === 'home'
                  ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
              }`}
            >
              Katalog Produk
            </a>

            <button
              onClick={() => setIsLookupOpen(true)}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition flex items-center gap-1.5 cursor-pointer"
            >
              <Search className="w-3.5 h-3.5 text-zinc-400" />
              <span>Lacak Pesanan</span>
            </button>

            <a
              href="/support"
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
                activePage === 'support'
                  ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <MessageCircle className="w-3.5 h-3.5" />
              <span>Live Support</span>
            </a>
          </nav>

          {/* Right Action Buttons */}
          <div className="flex items-center gap-2">
            <ThemeToggle />

            <a
              href="/user"
              className={`px-3.5 py-1.5 rounded-xl border text-xs font-semibold transition flex items-center gap-1.5 shadow-xs ${
                activePage === 'user'
                  ? 'border-blue-400 dark:border-blue-700 bg-blue-600 text-white'
                  : currentUser
                  ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-950/60'
                  : 'border-zinc-200 dark:border-zinc-800 bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 hover:opacity-90'
              }`}
              title="Dashboard Akun Pelanggan"
            >
              <User className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">
                {currentUser ? currentUser.name.split(' ')[0] : 'Akun Saya'}
              </span>
            </a>

            {/* Mobile Menu Toggle */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2 rounded-xl text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
              aria-label="Toggle Menu"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-4 py-3 space-y-2 animate-in slide-in-from-top-2 duration-200">
            <a
              href="/"
              className={`block px-3 py-2 rounded-xl text-xs font-semibold ${
                activePage === 'home'
                  ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white'
                  : 'text-zinc-600 dark:text-zinc-400'
              }`}
            >
              Katalog Produk
            </a>
            <button
              onClick={() => {
                setIsMobileMenuOpen(false);
                setIsLookupOpen(true);
              }}
              className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-400 flex items-center gap-2"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Lacak Pesanan</span>
            </button>
            <a
              href="/support"
              className={`block px-3 py-2 rounded-xl text-xs font-semibold ${
                activePage === 'support'
                  ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                  : 'text-zinc-600 dark:text-zinc-400'
              }`}
            >
              Live Support Chat
            </a>
            <a
              href="/user"
              className={`block px-3 py-2 rounded-xl text-xs font-semibold ${
                activePage === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'text-zinc-600 dark:text-zinc-400'
              }`}
            >
              Dashboard Pelanggan ({currentUser ? currentUser.name : 'Masuk'})
            </a>
          </div>
        )}
      </header>

      {/* Shared Order Lookup Modal */}
      <OrderLookupModal isOpen={isLookupOpen} onClose={() => setIsLookupOpen(false)} />
    </>
  );
};
