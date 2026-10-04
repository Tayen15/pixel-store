import React from 'react';
import {
  LayoutDashboard,
  Receipt,
  Layers,
  Users,
  Percent,
  Settings,
  ExternalLink,
  Coins,
  ShieldCheck,
  ChevronRight,
  MessageSquare,
} from 'lucide-react';

export type AdminTab =
  | 'overview'
  | 'orders'
  | 'catalog'
  | 'chats'
  | 'users'
  | 'pricing'
  | 'settings';

interface AdminSidebarProps {
  activeTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
  orderCount: number;
  productCount: number;
  userCount: number;
  unreadChatCount?: number;
  supplierBalanceUsdt: number;
  supplierStatus: string;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
  activeTab,
  onTabChange,
  orderCount,
  productCount,
  userCount,
  unreadChatCount = 0,
  supplierBalanceUsdt,
  supplierStatus,
  isMobileOpen = false,
  onCloseMobile,
}) => {
  const navItems = [
    {
      id: 'overview' as AdminTab,
      label: 'Ringkasan',
      icon: LayoutDashboard,
      badge: null,
    },
    {
      id: 'orders' as AdminTab,
      label: 'Pesanan Masuk',
      icon: Receipt,
      badge: orderCount > 0 ? String(orderCount) : null,
      badgeColor: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
    },
    {
      id: 'chats' as AdminTab,
      label: 'Chat Bantuan',
      icon: MessageSquare,
      badge: unreadChatCount > 0 ? String(unreadChatCount) : null,
      badgeColor: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
    },
    {
      id: 'catalog' as AdminTab,
      label: 'Katalog & Stok',
      icon: Layers,
      badge: String(productCount),
      badgeColor: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
    },
    {
      id: 'users' as AdminTab,
      label: 'Pelanggan',
      icon: Users,
      badge: userCount > 0 ? String(userCount) : null,
      badgeColor: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    },
    {
      id: 'pricing' as AdminTab,
      label: 'Margin & Kurs FX',
      icon: Percent,
      badge: 'Auto',
      badgeColor: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
    },
    {
      id: 'settings' as AdminTab,
      label: 'Pengaturan Toko',
      icon: Settings,
      badge: null,
    },
  ];

  const handleSelect = (tab: AdminTab) => {
    onTabChange(tab);
    if (onCloseMobile) onCloseMobile();
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs lg:hidden"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-white dark:bg-[#0f0f11] border-r border-zinc-200 dark:border-zinc-800/80 flex flex-col justify-between transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col flex-1 overflow-y-auto">
          {/* Logo Brand Header */}
          <div className="h-16 px-5 border-b border-zinc-200/80 dark:border-zinc-800/80 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <img
                src="/logo.svg"
                alt="Pixel Store"
                className="w-8 h-8 rounded-lg shadow-xs text-zinc-900 dark:text-white"
              />
              <div className="flex flex-col">
                <span className="font-extrabold text-sm tracking-tight text-zinc-900 dark:text-white leading-none">
                  PIXEL STORE
                </span>
                <span className="text-[10px] text-zinc-400 font-semibold tracking-wider uppercase mt-0.5">
                  Control Center
                </span>
              </div>
            </div>

            {/* Public Link Shortcut */}
            <a
              href="/"
              target="_blank"
              rel="noreferrer"
              title="Kunjungi Toko Publik"
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>

          {/* Nav Items */}
          <nav className="p-3 space-y-1">
            <div className="px-3 py-2 text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
              Menu Utama
            </div>
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleSelect(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-xs'
                      : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 hover:text-zinc-900 dark:hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-white dark:text-zinc-900' : 'text-zinc-400 dark:text-zinc-500'}`} />
                    <span>{item.label}</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {item.badge && (
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          isActive
                            ? 'bg-white/20 text-white dark:bg-zinc-900/20 dark:text-zinc-900'
                            : item.badgeColor
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                    {isActive && <ChevronRight className="w-3.5 h-3.5 opacity-60" />}
                  </div>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Supplier Balance & Live Status Widget */}
        <div className="p-3 border-t border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/30">
          <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141416] space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">
                <Coins className="w-3.5 h-3.5 text-amber-500" />
                Saldo Supplier
              </span>
              <span
                className={`w-2 h-2 rounded-full ${
                  supplierStatus === 'active' ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'
                }`}
                title={supplierStatus === 'active' ? 'API Terhubung' : 'API Tidak Terjangkau'}
              />
            </div>
            <div className="font-mono text-base font-extrabold text-zinc-900 dark:text-white leading-tight">
              ${supplierBalanceUsdt.toFixed(2)}{' '}
              <span className="text-[10px] text-zinc-400 font-sans font-medium">USDT</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
