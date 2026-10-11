'use client';

import React, { useState } from 'react';
import {
  Users,
  Search,
  Shield,
  User,
  ShoppingBag,
  Calendar,
  Mail,
  Phone,
  CheckCircle2,
  Lock,
  MessageCircle,
  ExternalLink,
  KeyRound,
} from 'lucide-react';

import { actions } from '@/actions';

const GoogleIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
    />
  </svg>
);

interface UsersViewProps {
  users: any[];
  orders: any[];
}

export const UsersView: React.FC<UsersViewProps> = ({ users: initialUsers, orders }) => {
  const [usersList, setUsersList] = useState(initialUsers);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterProvider, setFilterProvider] = useState<'all' | 'google' | 'credential' | 'admin'>('all');
  const [processingId, setProcessingId] = useState<string | null>(null);

  const handleRoleToggle = async (user: any) => {
    const newRole = user.role === 'admin' ? 'customer' : 'admin';
    const confirmMsg = user.role === 'admin'
      ? `Apakah Anda yakin ingin mencabut hak akses admin dari ${user.name || user.email}?`
      : `Jadikan ${user.name || user.email} sebagai Administrator toko via Better Auth?`;
    
    if (!window.confirm(confirmMsg)) return;

    setProcessingId(user.id);
    try {
      const res = await actions.adminSetUserRole({ userId: user.id, role: newRole });
      if (res?.data) {
        setUsersList((prev) =>
          prev.map((u) => (u.id === user.id ? { ...u, role: newRole } : u))
        );
      } else if (res?.error) {
        alert(res.error.message || 'Gagal mengubah role user');
      }
    } catch (err) {
      alert((err as Error).message || 'Terjadi kesalahan sistem');
    } finally {
      setProcessingId(null);
    }
  };

  const handleAdminResetPassword = async (user: any) => {
    const actionChoice = window.confirm(
      `Pilih Aksi Reset untuk ${user.name || user.email}:\n\n- Klik [OK] untuk mengatur kata sandi baru secara langsung.\n- Klik [Batal] jika ingin mengirim email instruksi reset ke ${user.email}.`
    );

    if (actionChoice) {
      const newPass = window.prompt(
        `Masukkan kata sandi baru untuk ${user.name || user.email} (minimal 6 karakter):`
      );
      if (!newPass) return;
      if (newPass.length < 6) {
        alert('Kata sandi baru minimal 6 karakter.');
        return;
      }

      setProcessingId(user.id);
      try {
        const res = await actions.adminResetUserPassword({
          userId: user.id,
          newPassword: newPass,
        });
        if (res?.data) {
          alert(res.data.message || 'Kata sandi berhasil diatur ulang.');
        } else if (res?.error) {
          alert(res.error.message || 'Gagal mengatur ulang kata sandi.');
        }
      } catch (err) {
        alert((err as Error).message || 'Terjadi kesalahan sistem.');
      } finally {
        setProcessingId(null);
      }
    } else {
      // Send reset email
      setProcessingId(user.id);
      try {
        const res = await actions.requestPasswordReset({ email: user.email });
        if (res?.data) {
          alert(res.data.message || 'Kode verifikasi reset telah dikirim ke email user.');
        } else if (res?.error) {
          alert(res.error.message || 'Gagal mengirim email reset.');
        }
      } catch (err) {
        alert((err as Error).message || 'Terjadi kesalahan sistem.');
      } finally {
        setProcessingId(null);
      }
    }
  };

  const googleCount = usersList.filter((u) => u.provider === 'google').length;
  const credentialCount = usersList.filter((u) => u.provider !== 'google').length;
  const adminCount = usersList.filter((u) => u.role === 'admin').length;

  const filteredUsers = usersList.filter((u) => {
    // Provider/Role Filter
    if (filterProvider === 'google' && u.provider !== 'google') return false;
    if (filterProvider === 'credential' && u.provider === 'google') return false;
    if (filterProvider === 'admin' && u.role !== 'admin') return false;

    // Search Query
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      u.name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.phone?.toLowerCase().includes(q) ||
      u.id?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Metric Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#121215] border border-zinc-200/80 dark:border-zinc-800/80 shadow-2xs">
          <p className="text-[11px] font-semibold text-zinc-500">Total Akun</p>
          <p className="text-xl font-extrabold text-zinc-900 dark:text-white mt-1">
            {usersList.length}
          </p>
        </div>
        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#121215] border border-zinc-200/80 dark:border-zinc-800/80 shadow-2xs">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-500">
            <GoogleIcon className="w-3.5 h-3.5" />
            <span>Google OAuth</span>
          </div>
          <p className="text-xl font-extrabold text-zinc-900 dark:text-white mt-1">
            {googleCount}
          </p>
        </div>
        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#121215] border border-zinc-200/80 dark:border-zinc-800/80 shadow-2xs">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-500">
            <Mail className="w-3.5 h-3.5" />
            <span>Email & Sandi</span>
          </div>
          <p className="text-xl font-extrabold text-zinc-900 dark:text-white mt-1">
            {credentialCount}
          </p>
        </div>
        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#121215] border border-zinc-200/80 dark:border-zinc-800/80 shadow-2xs">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-500">
            <Shield className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
            <span>Administrator</span>
          </div>
          <p className="text-xl font-extrabold text-purple-600 dark:text-purple-400 mt-1">
            {adminCount}
          </p>
        </div>
      </div>

      {/* Top Header & Search / Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Filter Pills */}
        <div className="flex items-center gap-1 p-1 bg-zinc-100/80 dark:bg-zinc-900/80 rounded-full border border-zinc-200/60 dark:border-zinc-800/60 overflow-x-auto">
          <button
            type="button"
            onClick={() => setFilterProvider('all')}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
              filterProvider === 'all'
                ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs'
                : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            Semua ({usersList.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterProvider('google')}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition flex items-center gap-1.5 ${
              filterProvider === 'google'
                ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs'
                : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            <GoogleIcon className="w-3 h-3" />
            <span>Google ({googleCount})</span>
          </button>
          <button
            type="button"
            onClick={() => setFilterProvider('credential')}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
              filterProvider === 'credential'
                ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs'
                : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            Email ({credentialCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterProvider('admin')}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
              filterProvider === 'admin'
                ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs'
                : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            Admin ({adminCount})
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-72">
          <input
            type="text"
            placeholder="Cari nama, email, nomor HP..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3.5 py-1.5 rounded-full text-xs bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition"
          />
          <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-2" />
        </div>
      </div>

      {/* Users Table */}
      <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#121215] overflow-hidden shadow-xs">
        {filteredUsers.length === 0 ? (
          <div className="text-center py-16 text-xs text-zinc-400 space-y-2">
            <Users className="w-8 h-8 text-zinc-300 dark:text-zinc-700 mx-auto" />
            <p>Tidak ada pengguna yang cocok dengan filter atau pencarian.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50/70 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 font-semibold">
                <tr>
                  <th className="py-3 px-4">Pengguna</th>
                  <th className="py-3 px-4">Metode Auth</th>
                  <th className="py-3 px-4">Kontak & Verifikasi</th>
                  <th className="py-3 px-4">Peran (Role)</th>
                  <th className="py-3 px-4">Aktivitas Belanja</th>
                  <th className="py-3 px-4">Bergabung</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                {filteredUsers.map((u) => {
                  const userOrders = orders.filter(
                    (o) => o.userId === u.id || o.customerEmail?.toLowerCase() === u.email?.toLowerCase()
                  );
                  const totalSpent = userOrders
                    .filter((o) => o.status === 'COMPLETED')
                    .reduce((sum, o) => sum + (o.totalAmountIdr || 0), 0);

                  return (
                    <tr key={u.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30 transition">
                      {/* Name & Avatar */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          {u.image ? (
                            <img
                              src={u.image}
                              alt={u.name}
                              className="w-8 h-8 rounded-full object-cover ring-1 ring-zinc-200 dark:ring-zinc-700 shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 flex items-center justify-center font-bold text-xs uppercase shrink-0">
                              {u.name?.charAt(0) || 'U'}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-bold text-zinc-900 dark:text-white truncate">
                              {u.name}
                            </div>
                            <div className="text-[10px] text-zinc-400 font-mono truncate">
                              ID: {u.id.slice(0, 8)}...
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Auth Provider */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {u.provider === 'google' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-zinc-100 dark:bg-zinc-850 border border-zinc-200/80 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100">
                            <GoogleIcon className="w-3 h-3 shrink-0" />
                            <span>Google OAuth</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-zinc-100/70 dark:bg-zinc-850/70 border border-zinc-200/60 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400">
                            <Lock className="w-3 h-3" />
                            <span>Email / Sandi</span>
                          </span>
                        )}
                      </td>

                      {/* Contact & Verification */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300 font-medium">
                          <Mail className="w-3 h-3 text-zinc-400 shrink-0" />
                          <span className="truncate max-w-[180px]">{u.email}</span>
                          {u.emailVerified && (
                            <span
                              className="text-emerald-500 shrink-0"
                              title="Email Terverifikasi (OAuth / Better Auth)"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            </span>
                          )}
                        </div>
                        {u.phone && (
                          <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 font-mono mt-0.5">
                            <Phone className="w-3 h-3 text-zinc-400 shrink-0" />
                            <span>{u.phone}</span>
                          </div>
                        )}
                      </td>

                      {/* Role */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            u.role === 'admin'
                              ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
                              : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60'
                          }`}
                        >
                          {u.role === 'admin' ? <Shield className="w-3 h-3" /> : <User className="w-3 h-3" />}
                          <span className="capitalize">{u.role}</span>
                        </span>
                      </td>

                      {/* Shopping Activity */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-mono font-bold text-zinc-900 dark:text-white">
                          Rp {totalSpent.toLocaleString('id-ID')}
                        </div>
                        <div className="text-[11px] text-zinc-400">
                          {userOrders.length} transaksi total
                        </div>
                      </td>

                      {/* Date Joined */}
                      <td className="py-3.5 px-4 text-zinc-500 whitespace-nowrap text-[11px]">
                        {new Date(u.createdAt).toLocaleDateString('id-ID', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            disabled={processingId === u.id}
                            onClick={() => handleAdminResetPassword(u)}
                            className="px-2.5 py-1 rounded-full text-[10px] font-semibold border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer disabled:opacity-50 flex items-center gap-1 shadow-2xs"
                            title="Atur kata sandi baru atau kirim email reset"
                          >
                            <KeyRound className="w-3 h-3 text-zinc-400" />
                            <span>Reset Sandi</span>
                          </button>

                          <button
                            type="button"
                            disabled={processingId === u.id}
                            onClick={() => handleRoleToggle(u)}
                            className={`px-2.5 py-1 rounded-full text-[10px] font-semibold transition cursor-pointer disabled:opacity-50 ${
                              u.role === 'admin'
                                ? 'border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                                : 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 hover:opacity-90 shadow-2xs'
                            }`}
                          >
                            {processingId === u.id
                              ? 'Memproses...'
                              : u.role === 'admin'
                              ? 'Cabut Admin'
                              : 'Jadikan Admin'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
