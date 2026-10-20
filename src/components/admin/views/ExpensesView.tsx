'use client';

import React, { useState, useMemo } from 'react';
import {
  CalendarDays,
  Plus,
  Trash2,
  Zap,
  Building2,
  TrendingUp,
  Receipt,
  Filter,
  ArrowUpDown,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Coins,
  Wallet,
  Sparkles,
} from 'lucide-react';
import { actions } from '@/actions';

export interface StoreExpenseItem {
  id: string;
  expenseDate: string;
  category: 'SUPPLIER_GAS_FEE' | 'BANK_WITHDRAWAL' | 'OPERATIONAL' | 'OTHER';
  title: string;
  amountIdr: number;
  amountUsdt?: number | null;
  notes?: string | null;
  createdAt?: string | null;
}

interface ExpensesViewProps {
  orders: any[];
  liveFx: { rate: number; source: string; updatedAt?: string };
  showToast: (type: 'success' | 'error', text: string) => void;
}

export const ExpensesView: React.FC<ExpensesViewProps> = ({
  orders,
  liveFx,
  showToast,
}) => {
  const [expenses, setExpenses] = useState<StoreExpenseItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter States
  const [selectedMonth, setSelectedMonth] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [filterDate, setFilterDate] = useState<string>('');

  // Form State
  const todayStr = new Date().toISOString().split('T')[0];
  const [formDate, setFormDate] = useState<string>(todayStr);
  const [formCategory, setFormCategory] = useState<'SUPPLIER_GAS_FEE' | 'BANK_WITHDRAWAL' | 'OPERATIONAL' | 'OTHER'>('SUPPLIER_GAS_FEE');
  const [formTitle, setFormTitle] = useState<string>('');
  const [formAmountIdr, setFormAmountIdr] = useState<number>(0);
  const [formAmountUsdt, setFormAmountUsdt] = useState<string>('');
  const [formNotes, setFormNotes] = useState<string>('');

  // Initial load
  React.useEffect(() => {
    loadExpenses();
  }, []);

  const loadExpenses = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await actions.adminGetExpenses();
      if (error || !data) {
        showToast('error', error?.message || 'Gagal memuat catatan buku kas.');
        return;
      }
      setExpenses(data.expenses as StoreExpenseItem[]);
    } catch (err) {
      showToast('error', (err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  // Open Modal with Presets
  const openPresetModal = (type: 'GAS_FEE' | 'WITHDRAW' | 'CUSTOM') => {
    setFormDate(todayStr);
    if (type === 'GAS_FEE') {
      const defaultUsdt = 0.1;
      const calcIdr = Math.round(defaultUsdt * (liveFx?.rate || 17800));
      setFormCategory('SUPPLIER_GAS_FEE');
      setFormTitle('Gas Fee Transfer Saldo Supplier');
      setFormAmountUsdt('0.1');
      setFormAmountIdr(calcIdr);
      setFormNotes('Biaya gas fee crypto (TRC20/BEP20) saat kirim saldo ke dompet supplier.');
    } else if (type === 'WITHDRAW') {
      setFormCategory('BANK_WITHDRAWAL');
      setFormTitle('Biaya Penarikan SumoPod ke Rekening Bank');
      setFormAmountUsdt('');
      setFormAmountIdr(2500);
      setFormNotes('Biaya flat 1x penarikan (withdraw) dari SumoPod ke rekening bank pemilik toko.');
    } else {
      setFormCategory('OPERATIONAL');
      setFormTitle('');
      setFormAmountUsdt('');
      setFormAmountIdr(0);
      setFormNotes('');
    }
    setIsModalOpen(true);
  };

  const handleUsdtChange = (val: string) => {
    setFormAmountUsdt(val);
    const normalized = val.replace(',', '.');
    const num = parseFloat(normalized);
    if (!isNaN(num) && num > 0) {
      setFormAmountIdr(Math.round(num * (liveFx?.rate || 17800)));
    }
  };

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      showToast('error', 'Silakan masukkan judul pengeluaran.');
      return;
    }
    if (formAmountIdr < 0) {
      showToast('error', 'Nominal pengeluaran tidak boleh negatif.');
      return;
    }

    setIsSubmitting(true);
    try {
      const parsedUsdt = formAmountUsdt ? parseFloat(formAmountUsdt.replace(',', '.')) : null;
      const { data, error } = await actions.adminCreateExpense({
        expenseDate: formDate,
        category: formCategory,
        title: formTitle.trim(),
        amountIdr: Number(formAmountIdr),
        amountUsdt: !isNaN(parsedUsdt as number) ? parsedUsdt : null,
        notes: formNotes.trim() || null,
      });

      if (error || !data) {
        showToast('error', error?.message || 'Gagal menyimpan pengeluaran.');
        return;
      }

      showToast('success', 'Catatan biaya berhasil disimpan ke Buku Kas!');
      setIsModalOpen(false);
      loadExpenses();
    } catch (err) {
      showToast('error', (err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteExpense = async (id: string, title: string) => {
    if (!confirm(`Hapus catatan biaya "${title}"?`)) return;

    try {
      const { data, error } = await actions.adminDeleteExpense({ id });
      if (error || !data) {
        showToast('error', error?.message || 'Gagal menghapus catatan biaya.');
        return;
      }
      showToast('success', 'Catatan biaya berhasil dihapus.');
      setExpenses((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      showToast('error', (err as Error).message);
    }
  };

  // Available Months for Filtering
  const availableMonths = useMemo(() => {
    const setM = new Set<string>();
    expenses.forEach((e) => {
      if (e.expenseDate && e.expenseDate.length >= 7) {
        setM.add(e.expenseDate.substring(0, 7)); // e.g. "2026-10"
      }
    });
    return Array.from(setM).sort().reverse();
  }, [expenses]);

  // Filtered Expenses
  const filteredExpenses = useMemo(() => {
    return expenses.filter((item) => {
      if (selectedCategory !== 'ALL' && item.category !== selectedCategory) return false;
      if (selectedMonth !== 'ALL' && !item.expenseDate.startsWith(selectedMonth)) return false;
      if (filterDate && item.expenseDate !== filterDate) return false;
      return true;
    });
  }, [expenses, selectedCategory, selectedMonth, filterDate]);

  // Metrics Aggregation
  const totalExpenseIdr = filteredExpenses.reduce((sum, item) => sum + item.amountIdr, 0);
  const totalGasFeeIdr = filteredExpenses
    .filter((e) => e.category === 'SUPPLIER_GAS_FEE')
    .reduce((sum, item) => sum + item.amountIdr, 0);
  const totalGasFeeUsdt = filteredExpenses
    .filter((e) => e.category === 'SUPPLIER_GAS_FEE')
    .reduce((sum, item) => sum + (item.amountUsdt || 0), 0);
  const totalWithdrawIdr = filteredExpenses
    .filter((e) => e.category === 'BANK_WITHDRAWAL')
    .reduce((sum, item) => sum + item.amountIdr, 0);

  // Financial Order Aggregation (COMPLETED Orders)
  const completedOrders = useMemo(() => {
    return orders.filter((o) => o.status === 'COMPLETED');
  }, [orders]);

  const grossRevenueIdr = completedOrders.reduce((sum, o) => sum + (o.totalAmountIdr || 0), 0);
  const totalWholesaleIdr = completedOrders.reduce((sum, o) => {
    return sum + (o.basePriceUsdt || 0) * (o.exchangeRateIdr || liveFx.rate);
  }, 0);
  const totalSumopodMdrIdr = Math.round(grossRevenueIdr * 0.007); // 0.7% MDR SumoPod
  const realNetProfitIdr = grossRevenueIdr - totalWholesaleIdr - totalSumopodMdrIdr - totalExpenseIdr;

  const categoryBadges: Record<string, { label: string; class: string }> = {
    SUPPLIER_GAS_FEE: {
      label: 'Gas Fee Supplier',
      class: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    },
    BANK_WITHDRAWAL: {
      label: 'Withdraw Bank',
      class: 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    },
    OPERATIONAL: {
      label: 'Operasional',
      class: 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200 border-zinc-200 dark:border-zinc-700',
    },
    OTHER: {
      label: 'Lainnya',
      class: 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800',
    },
  };

  return (
    <div className="space-y-6">
      {/* 1. Header & Quick Action Presets */}
      <div className="p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141416] shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-amber-500" />
              <span>Buku Kas & Biaya Operasional Toko</span>
            </h2>
            <p className="text-xs text-zinc-500 mt-1">
              Catat gas fee top-up supplier dan biaya withdraw bank SumoPod secara riil berdasarkan kalender tanpa membebani harga jual produk per transaksi.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => openPresetModal('GAS_FEE')}
              className="px-3.5 py-2 rounded-xl text-xs font-bold border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              <span>+ Gas Fee Top-up</span>
            </button>

            <button
              type="button"
              onClick={() => openPresetModal('WITHDRAW')}
              className="px-3.5 py-2 rounded-xl text-xs font-bold border border-blue-200 dark:border-blue-800/60 bg-blue-50 dark:bg-blue-950/30 text-blue-800 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <Building2 className="w-3.5 h-3.5 text-blue-500" />
              <span>+ Biaya Withdraw Bank</span>
            </button>

            <button
              type="button"
              onClick={() => openPresetModal('CUSTOM')}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 hover:opacity-90 transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Catat Biaya</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. P&L & Expense Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Pengeluaran Riil */}
        <div className="p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141416] space-y-2 shadow-xs">
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span className="flex items-center gap-1.5 font-medium text-zinc-700 dark:text-zinc-300">
              <Wallet className="w-4 h-4 text-rose-500" />
              Total Biaya Riil Dicatat
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300">
              {filteredExpenses.length} Catatan
            </span>
          </div>
          <div className="font-mono text-2xl font-black text-rose-600 dark:text-rose-400">
            Rp {totalExpenseIdr.toLocaleString('id-ID')}
          </div>
          <p className="text-[11px] text-zinc-400">
            Akumulasi gas fee top-up & biaya withdraw bank.
          </p>
        </div>

        {/* Card 2: Gas Fee Top-up Supplier */}
        <div className="p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141416] space-y-2 shadow-xs">
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span className="flex items-center gap-1.5 font-medium text-zinc-700 dark:text-zinc-300">
              <Zap className="w-4 h-4 text-amber-500" />
              Total Gas Fee Crypto
            </span>
            {totalGasFeeUsdt > 0 && (
              <span className="font-mono text-[11px] font-bold text-amber-600 dark:text-amber-400">
                ${totalGasFeeUsdt.toFixed(2)} USDT
              </span>
            )}
          </div>
          <div className="font-mono text-2xl font-black text-zinc-900 dark:text-white">
            Rp {totalGasFeeIdr.toLocaleString('id-ID')}
          </div>
          <p className="text-[11px] text-zinc-400">
            Biaya network saat isi saldo $1 / $5 ke supplier.
          </p>
        </div>

        {/* Card 3: Biaya Penarikan Bank SumoPod */}
        <div className="p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141416] space-y-2 shadow-xs">
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span className="flex items-center gap-1.5 font-medium text-zinc-700 dark:text-zinc-300">
              <Building2 className="w-4 h-4 text-blue-500" />
              Biaya Withdraw Bank
            </span>
            <span className="text-[10px] text-blue-600 dark:text-blue-400 font-bold">
              Flat Rp 2.500/tarik
            </span>
          </div>
          <div className="font-mono text-2xl font-black text-zinc-900 dark:text-white">
            Rp {totalWithdrawIdr.toLocaleString('id-ID')}
          </div>
          <p className="text-[11px] text-zinc-400">
            Biaya pencairan berkala dari SumoPod ke rekening.
          </p>
        </div>

        {/* Card 4: Laba Bersih Bersih Riil (True Net Profit) */}
        <div className="p-5 rounded-2xl border border-emerald-200 dark:border-emerald-800/80 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-2 shadow-xs">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 font-bold text-emerald-800 dark:text-emerald-300">
              <TrendingUp className="w-4 h-4 text-emerald-500" />
              Laba Bersih Bersih Riil
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              True P&L
            </span>
          </div>
          <div className="font-mono text-2xl font-black text-emerald-600 dark:text-emerald-400">
            Rp {Math.round(realNetProfitIdr).toLocaleString('id-ID')}
          </div>
          <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
            Omzet - Modal - MDR QRIS 0.7% - Biaya Riil Tercatat.
          </p>
        </div>
      </div>

      {/* 3. Filters & Calendar Date Bar */}
      <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141416] flex flex-wrap items-center justify-between gap-3 text-xs shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          {/* Category Filter */}
          <div className="flex items-center gap-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-3 py-1.5 rounded-xl">
            <Filter className="w-3.5 h-3.5 text-zinc-400" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-transparent text-zinc-900 dark:text-zinc-100 font-medium focus:outline-none cursor-pointer"
            >
              <option value="ALL">Semua Kategori</option>
              <option value="SUPPLIER_GAS_FEE">Gas Fee Top-up Supplier</option>
              <option value="BANK_WITHDRAWAL">Biaya Withdraw Bank</option>
              <option value="OPERATIONAL">Operasional Toko</option>
              <option value="OTHER">Lainnya</option>
            </select>
          </div>

          {/* Month Filter */}
          {availableMonths.length > 0 && (
            <div className="flex items-center gap-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-3 py-1.5 rounded-xl">
              <Calendar className="w-3.5 h-3.5 text-zinc-400" />
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-transparent text-zinc-900 dark:text-zinc-100 font-medium focus:outline-none cursor-pointer"
              >
                <option value="ALL">Semua Bulan</option>
                {availableMonths.map((m) => (
                  <option key={m} value={m}>
                    Bulan {m}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Quick Date Picker */}
          <div className="flex items-center gap-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-3 py-1.5 rounded-xl">
            <span className="text-zinc-400 text-[11px]">Tanggal:</span>
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="bg-transparent text-zinc-900 dark:text-zinc-100 font-medium focus:outline-none cursor-pointer"
            />
            {filterDate && (
              <button
                type="button"
                onClick={() => setFilterDate('')}
                className="text-zinc-400 hover:text-zinc-600 text-[10px] ml-1"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        <div className="text-zinc-500 text-xs">
          Menampilkan <strong>{filteredExpenses.length}</strong> catatan
        </div>
      </div>

      {/* 4. Expenses Ledger Table */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141416] overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/40 text-zinc-500 font-semibold">
                <th className="py-3 px-4">Tanggal</th>
                <th className="py-3 px-4">Kategori</th>
                <th className="py-3 px-4">Keterangan / Judul</th>
                <th className="py-3 px-4 text-right">Biaya (IDR)</th>
                <th className="py-3 px-4 text-right">Biaya (USDT)</th>
                <th className="py-3 px-4">Catatan</th>
                <th className="py-3 px-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60 text-zinc-700 dark:text-zinc-300">
              {filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-zinc-400">
                    <CalendarDays className="w-8 h-8 mx-auto mb-2 text-zinc-300 dark:text-zinc-700" />
                    <p className="font-medium text-xs">Belum ada catatan pengeluaran operasional.</p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      Klik tombol preset "+ Gas Fee Top-up" atau "+ Biaya Withdraw Bank" di atas untuk mencatat.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredExpenses.map((item) => {
                  const badge = categoryBadges[item.category] || categoryBadges.OTHER;
                  return (
                    <tr key={item.id} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-900/30 transition">
                      <td className="py-3 px-4 font-mono font-medium whitespace-nowrap text-zinc-900 dark:text-zinc-100">
                        {item.expenseDate}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${badge.class}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-medium text-zinc-900 dark:text-zinc-100">
                        {item.title}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-rose-600 dark:text-rose-400 whitespace-nowrap">
                        Rp {item.amountIdr.toLocaleString('id-ID')}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-zinc-500 whitespace-nowrap">
                        {item.amountUsdt !== null && item.amountUsdt !== undefined && item.amountUsdt > 0
                          ? `$${item.amountUsdt.toFixed(2)} USDT`
                          : '-'}
                      </td>
                      <td className="py-3 px-4 text-zinc-500 max-w-xs truncate" title={item.notes || ''}>
                        {item.notes || '-'}
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleDeleteExpense(item.id, item.title)}
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                          title="Hapus catatan"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. Modal: Add Expense */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="relative w-full max-w-md bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xl overflow-hidden p-6 space-y-5">
            <div className="border-b border-zinc-100 dark:border-zinc-800 pb-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-amber-500" />
                  <span>Catat Biaya Operasional</span>
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Catat pengeluaran riil untuk laporan Laba Rugi tanpa mengubah harga jual
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveExpense} className="space-y-4 text-xs">
              {/* Tanggal */}
              <div className="space-y-1">
                <label className="font-semibold text-zinc-800 dark:text-zinc-200">
                  Tanggal Pengeluaran:
                </label>
                <input
                  type="date"
                  required
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white font-mono focus:outline-none"
                />
              </div>

              {/* Kategori */}
              <div className="space-y-1">
                <label className="font-semibold text-zinc-800 dark:text-zinc-200">
                  Kategori Biaya:
                </label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value as any)}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white font-medium focus:outline-none cursor-pointer"
                >
                  <option value="SUPPLIER_GAS_FEE">Gas Fee Top-up Saldo Supplier (Crypto)</option>
                  <option value="BANK_WITHDRAWAL">Biaya Penarikan Bank SumoPod (Flat Rp 2.500)</option>
                  <option value="OPERATIONAL">Biaya Operasional Toko (Hosting, Domain, dll)</option>
                  <option value="OTHER">Lainnya</option>
                </select>
              </div>

              {/* Judul */}
              <div className="space-y-1">
                <label className="font-semibold text-zinc-800 dark:text-zinc-200">
                  Keterangan / Judul:
                </label>
                <input
                  type="text"
                  required
                  placeholder="Misal: Gas Fee Top-up $5 USDT ke InsightXPro"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none"
                />
              </div>

              {/* Optional USDT Amount */}
              {formCategory === 'SUPPLIER_GAS_FEE' && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-semibold text-zinc-800 dark:text-zinc-200">
                      Nominal Gas Fee (USDT):
                    </label>
                    <span className="text-[10px] text-zinc-400">
                      Kurs: Rp {liveFx?.rate?.toLocaleString('id-ID')}
                    </span>
                  </div>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="0.1"
                    value={formAmountUsdt}
                    onChange={(e) => handleUsdtChange(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white font-mono focus:outline-none"
                  />
                </div>
              )}

              {/* Nominal Biaya IDR */}
              <div className="space-y-1">
                <label className="font-semibold text-zinc-800 dark:text-zinc-200">
                  Nominal Biaya Riil (IDR):
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  step="1"
                  value={formAmountIdr}
                  onChange={(e) => setFormAmountIdr(Number(e.target.value))}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white font-mono font-bold text-sm focus:outline-none"
                />
              </div>

              {/* Catatan */}
              <div className="space-y-1">
                <label className="font-semibold text-zinc-800 dark:text-zinc-200">
                  Catatan Tambahan (Opsional):
                </label>
                <textarea
                  rows={2}
                  placeholder="Detail transaksi, hash transfer, atau catatan admin..."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none resize-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 font-medium transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 hover:opacity-90 font-bold transition cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Menyimpan...' : 'Simpan ke Buku Kas'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
