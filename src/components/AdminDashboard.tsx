import React, { useState, useEffect } from 'react';
import { actions } from 'astro:actions';
import { AdminSidebar, type AdminTab } from './admin/AdminSidebar';
import { AdminHeader } from './admin/AdminHeader';
import { OverviewView } from './admin/views/OverviewView';
import { OrdersView } from './admin/views/OrdersView';
import { CatalogView } from './admin/views/CatalogView';
import { UsersView } from './admin/views/UsersView';
import { PricingEngineView } from './admin/views/PricingEngineView';
import { StoreSettingsView } from './admin/views/StoreSettingsView';
import { SupportChatView } from './admin/views/SupportChatView';
import { CheckCircle2, AlertCircle } from 'lucide-react';

interface AdminDashboardProps {
  initialConfig: any;
  initialProducts: any[];
  initialOrders: any[];
  initialUsers?: any[];
  initialSupplier: any;
  initialLiveFx: any;
  initialTab?: AdminTab;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  initialConfig,
  initialProducts,
  initialOrders,
  initialUsers = [],
  initialSupplier,
  initialLiveFx,
  initialTab = 'overview',
}) => {
  const resolveCurrentTab = (): AdminTab => {
    if (typeof window !== 'undefined') {
      const validTabs: AdminTab[] = ['overview', 'orders', 'catalog', 'chats', 'users', 'pricing', 'settings'];
      const params = new URLSearchParams(window.location.search);
      const qTab = params.get('tab') as AdminTab;
      if (qTab && validTabs.includes(qTab)) return qTab;

      const parts = window.location.pathname.split('/').filter(Boolean);
      if (parts[0] === 'admin' && parts[1]) {
        const pathTab = parts[1] as AdminTab;
        if (validTabs.includes(pathTab)) return pathTab;
      }
    }
    return initialTab || 'overview';
  };

  const [activeTab, setActiveTab] = useState<AdminTab>(resolveCurrentTab);

  const handleTabChange = (newTab: AdminTab) => {
    setActiveTab(newTab);
    if (typeof window !== 'undefined') {
      const newUrl = newTab === 'overview' ? '/admin' : `/admin/${newTab}`;
      window.history.pushState({ tab: newTab }, '', newUrl);
    }
  };

  useEffect(() => {
    const onPopState = () => {
      setActiveTab(resolveCurrentTab());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  const [config, setConfig] = useState(initialConfig);
  const [products, setProducts] = useState(initialProducts);
  const [orders, setOrders] = useState(initialOrders);
  const [users, setUsers] = useState(initialUsers);
  const [supplier, setSupplier] = useState(initialSupplier);
  const [liveFx, setLiveFx] = useState(initialLiveFx);

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isRefreshingFx, setIsRefreshingFx] = useState(false);
  const [selectedOrderForModal, setSelectedOrderForModal] = useState<any>(null);
  const [unreadChatCount, setUnreadChatCount] = useState<number>(0);

  // Poll for unread chats count
  useEffect(() => {
    const checkUnreadChats = async () => {
      try {
        const { data } = await actions.adminGetChatConversations({ status: 'ALL' });
        if (data?.totalUnread !== undefined) {
          setUnreadChatCount(data.totalUnread);
        }
      } catch {}
    };

    checkUnreadChats();
    const interval = setInterval(checkUnreadChats, 5000);
    return () => clearInterval(interval);
  }, []);

  // Toast notification state
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showToast = (type: 'success' | 'error', text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 4000);
  };

  const handleRefreshFx = async () => {
    setIsRefreshingFx(true);
    try {
      const { data, error } = await actions.getAdminSettings();
      if (!error && data?.liveFx) {
        setLiveFx(data.liveFx);
        if (data.supplier) setSupplier(data.supplier);
        if (data.config) setConfig(data.config);
        showToast(
          'success',
          `Kurs diperbarui: Rp ${data.liveFx.rate?.toLocaleString('id-ID')} (${data.liveFx.source})`
        );
      } else {
        showToast('error', error?.message || 'Gagal memperbarui kurs.');
      }
    } catch (err) {
      showToast('error', (err as Error).message);
    } finally {
      setIsRefreshingFx(false);
    }
  };

  const reloadData = async () => {
    try {
      const { data } = await actions.getAdminSettings();
      if (data) {
        if (data.config) setConfig(data.config);
        if (data.liveFx) setLiveFx(data.liveFx);
        if (data.supplier) setSupplier(data.supplier);
      }
    } catch {}
    // Trigger soft page refresh to get fresh orders & products from database
    setTimeout(() => window.location.reload(), 1200);
  };

  const handleLogout = async () => {
    if (!confirm('Apakah Anda yakin ingin keluar dari panel admin?')) return;
    try {
      await actions.adminLogout();
      window.location.href = '/admin/login';
    } catch {
      window.location.href = '/admin/login';
    }
  };

  const handleSelectOrderFromOverview = (order: any) => {
    setSelectedOrderForModal(order);
    handleTabChange('orders');
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100 flex">
      {/* 1. Sidebar Nav */}
      <AdminSidebar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        orderCount={orders.length}
        productCount={products.length}
        userCount={users.length}
        unreadChatCount={unreadChatCount}
        supplierBalanceUsdt={supplier.balanceUsdt || 0}
        supplierStatus={supplier.status || 'active'}
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      {/* 2. Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        {/* Top Header */}
        <AdminHeader
          activeTab={activeTab}
          liveFx={liveFx}
          isRefreshingFx={isRefreshingFx}
          onRefreshFx={handleRefreshFx}
          onLogout={handleLogout}
          onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
        />

        {/* Floating Toast Notification */}
        {toast && (
          <div className="fixed top-20 right-6 z-50 animate-in fade-in slide-in-from-top-4 duration-300">
            <div
              className={`p-4 rounded-2xl border shadow-xl flex items-center gap-3 text-xs font-semibold backdrop-blur-md ${
                toast.type === 'success'
                  ? 'bg-emerald-500/90 border-emerald-400 text-white'
                  : 'bg-red-500/90 border-red-400 text-white'
              }`}
            >
              {toast.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{toast.text}</span>
            </div>
          </div>
        )}

        {/* Tab View Container */}
        <main className="p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
          {activeTab === 'overview' && (
            <OverviewView
              orders={orders}
              products={products}
              supplier={supplier}
              liveFx={liveFx}
              marginPercent={config?.pricing?.marginPercent ?? 20}
              gatewayFeePercent={config?.pricing?.gatewayFeePercent ?? 5.0}
              onNavigateTab={handleTabChange}
              onSelectOrder={handleSelectOrderFromOverview}
              onRefreshFx={handleRefreshFx}
              isRefreshingFx={isRefreshingFx}
            />
          )}

          {activeTab === 'orders' && (
            <OrdersView
              orders={orders}
              onOrderUpdated={reloadData}
              showToast={showToast}
              selectedOrderForModal={selectedOrderForModal}
              onClearSelectedOrder={() => setSelectedOrderForModal(null)}
            />
          )}

          {activeTab === 'chats' && (
            <SupportChatView
              showToast={showToast}
              onNavigateOrder={(orderNum) => {
                const found = orders.find((o) => o.orderNumber === orderNum);
                if (found) {
                  setSelectedOrderForModal(found);
                  setActiveTab('orders');
                }
              }}
            />
          )}

          {activeTab === 'catalog' && (
            <CatalogView
              products={products}
              onProductsUpdated={reloadData}
              showToast={showToast}
            />
          )}

          {activeTab === 'users' && (
            <UsersView
              users={users}
              orders={orders}
            />
          )}

          {activeTab === 'pricing' && (
            <PricingEngineView
              config={config}
              liveFx={liveFx}
              products={products}
              onConfigSaved={reloadData}
              showToast={showToast}
              onRefreshFx={handleRefreshFx}
              isRefreshingFx={isRefreshingFx}
            />
          )}

          {activeTab === 'settings' && (
            <StoreSettingsView
              config={config}
              onConfigSaved={reloadData}
              showToast={showToast}
            />
          )}
        </main>
      </div>
    </div>
  );
};
