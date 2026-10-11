import React from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AdminLoginForm } from '@/components/AdminLoginForm';
import { getAdminSession } from '@/lib/auth/admin';

export const revalidate = 0;

export default async function AdminLoginPage() {
  const adminState = await getAdminSession();
  if (adminState.isAuthenticated) {
    redirect('/admin');
  }

  return <AdminLoginForm />;
}
