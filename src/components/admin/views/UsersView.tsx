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
} from 'lucide-react';

interface UsersViewProps {
  users: any[];
  orders: any[];
}

export const UsersView: React.FC<UsersViewProps> = ({ users, orders }) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredUsers = users.filter((u) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      u.name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.phone?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Header & Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-zinc-900 dark:text-white">
            Akun Pelanggan Terdaftar ({users.length})
          </h2>
          <p className="text-xs text-zinc-500">
            Pelanggan yang memiliki akun untuk tracking lisensi dan riwayat order
          </p>
        </div>

        <div className="relative w-full sm:w-72">
          <input
            type="text"
            placeholder="Cari nama, email, nomor HP..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3.5 py-2 rounded-xl text-xs bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition"
          />
          <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-2.5" />
        </div>
      </div>

      {/* Users Table */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141416] overflow-hidden shadow-xs">
        {filteredUsers.length === 0 ? (
          <div className="text-center py-16 text-xs text-zinc-400 space-y-2">
            <Users className="w-8 h-8 text-zinc-300 dark:text-zinc-700 mx-auto" />
            <p>Belum ada akun pelanggan yang terdaftar.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50/70 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 font-semibold">
                <tr>
                  <th className="py-3 px-4">Nama Pelanggan</th>
                  <th className="py-3 px-4">Kontak</th>
                  <th className="py-3 px-4">Peran (Role)</th>
                  <th className="py-3 px-4">Aktivitas Belanja</th>
                  <th className="py-3 px-4">Bergabung</th>
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
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 flex items-center justify-center font-bold text-xs uppercase">
                            {u.name?.charAt(0) || 'U'}
                          </div>
                          <div>
                            <div className="font-bold text-zinc-900 dark:text-white">
                              {u.name}
                            </div>
                            <div className="text-[10px] text-zinc-400 font-mono">
                              ID: {u.id.slice(0, 8)}...
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300 font-medium">
                          <Mail className="w-3 h-3 text-zinc-400" />
                          <span>{u.email}</span>
                        </div>
                        {u.phone && (
                          <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 font-mono mt-0.5">
                            <Phone className="w-3 h-3 text-zinc-400" />
                            <span>{u.phone}</span>
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            u.role === 'admin'
                              ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                              : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          }`}
                        >
                          {u.role === 'admin' ? <Shield className="w-3 h-3" /> : <User className="w-3 h-3" />}
                          <span className="capitalize">{u.role}</span>
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-mono font-bold text-zinc-900 dark:text-white">
                          Rp {totalSpent.toLocaleString('id-ID')}
                        </div>
                        <div className="text-[11px] text-zinc-400">
                          {userOrders.length} transaksi total
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-zinc-500 whitespace-nowrap text-[11px]">
                        {new Date(u.createdAt).toLocaleDateString('id-ID', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
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
