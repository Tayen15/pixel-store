import React from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AdminDashboard } from '@/components/AdminDashboard';
import { db, schema } from '@/db';
import { insightXPro } from '@/lib/insightxpro/client';
import { getLiveUsdtRate } from '@/lib/pricing/fx-service';
import { getSystemConfig } from '@/lib/settings/service';
import { desc } from 'drizzle-orm';
import { getAdminSession, getAdminUsersList } from '@/lib/auth/admin';
import { syncRealtimeCatalog } from '@/lib/catalog/service';

export const revalidate = 0;

interface AdminTabPageProps {
  params: Promise<{ tab: string }>;
}

export default async function AdminTabPage({ params }: AdminTabPageProps) {
  const adminState = await getAdminSession();
  if (!adminState.isAuthenticated) {
    redirect('/admin/login');
  }

  const { tab } = await params;
  const validTabs = ['overview', 'orders', 'catalog', 'chats', 'users', 'pricing', 'settings'];
  if (!tab || !validTabs.includes(tab)) {
    redirect('/admin');
  }

  const config = await getSystemConfig();
  const liveFx = await getLiveUsdtRate(false);

  let supplierBalance = 0;
  let supplierStatus = 'active';

  try {
    const balanceData = await insightXPro.getBalance();
    supplierBalance = balanceData.balance;
    supplierStatus = balanceData.status || 'active';
  } catch {
    supplierStatus = 'unreachable';
  }

  const products = await db.select().from(schema.productsCache);
  const recentOrders = await db.select().from(schema.orders).orderBy(desc(schema.orders.createdAt)).limit(100);
  const registeredUsers = await getAdminUsersList();

  return (
    <AdminDashboard
      initialTab={tab as any}
      initialConfig={config}
      initialProducts={products}
      initialOrders={recentOrders}
      initialUsers={registeredUsers}
      initialSupplier={{
        balanceUsdt: supplierBalance,
        status: supplierStatus,
      }}
      initialLiveFx={liveFx}
    />
  );
}
