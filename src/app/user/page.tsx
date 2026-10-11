import React from 'react';
import { cookies } from 'next/headers';
import { UserDashboard, type AuthenticatedUser, type UserOrder } from '@/components/user/UserDashboard';
import { StoreNavbar } from '@/components/layout/StoreNavbar';
import { StoreFooter } from '@/components/layout/StoreFooter';
import { getEffectiveUser } from '@/lib/auth/user';
import { db, schema } from '@/db';
import { eq, or, desc } from 'drizzle-orm';

export const revalidate = 0;

export default async function UserPage() {
  const dbUser = await getEffectiveUser();

  let initialUser: AuthenticatedUser | null = null;
  let initialOrders: UserOrder[] = [];

  if (dbUser) {
    initialUser = {
      id: dbUser.id,
      name: dbUser.name,
      email: dbUser.email,
      phone: dbUser.phone,
      role: dbUser.role,
    };

    try {
      const rawOrders = await db
        .select()
        .from(schema.orders)
        .where(
          or(
            eq(schema.orders.userId, dbUser.id),
            eq(schema.orders.customerEmail, dbUser.email)
          )
        )
        .orderBy(desc(schema.orders.createdAt));

      initialOrders = rawOrders.map((o) => {
        let parsedCodes: string[] = [];
        if (o.licenseCodes) {
          try {
            parsedCodes = JSON.parse(o.licenseCodes);
          } catch {
            parsedCodes = [o.licenseCodes];
          }
        }

        return {
          id: o.id,
          orderNumber: o.orderNumber,
          productName: o.productName,
          quantity: o.quantity,
          totalAmountIdr: o.totalAmountIdr,
          status: o.status,
          licenseCodes: parsedCodes,
          paidAt: o.paidAt,
          createdAt: o.createdAt,
        };
      });
    } catch (err) {
      console.warn('Failed preloading user orders in user page:', err);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100 flex flex-col font-sans transition-colors duration-200">
      <StoreNavbar activePage="user" />

      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 my-4">
        <UserDashboard
          initialUser={initialUser}
          initialOrders={initialOrders}
        />
      </main>

      <StoreFooter />
    </div>
  );
}
