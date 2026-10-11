import React from 'react';
import { cookies } from 'next/headers';
import { SupportChat } from '@/components/SupportChat';
import { StoreNavbar } from '@/components/layout/StoreNavbar';
import { StoreFooter } from '@/components/layout/StoreFooter';
import { getEffectiveUser } from '@/lib/auth/user';

export const revalidate = 0;

export default async function SupportPage() {
  const user = await getEffectiveUser();

  const initialUser = user
    ? {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image || null,
      }
    : null;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100 flex flex-col font-sans transition-colors duration-200">
      <StoreNavbar activePage="support" />

      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 my-4">
        <SupportChat initialUser={initialUser} />
      </main>

      <StoreFooter />
    </div>
  );
}
