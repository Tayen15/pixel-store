'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Plus,
  CreditCard,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Mail,
  Phone,
  FileText,
  Key,
  Info,
  Sparkles,
} from 'lucide-react';
import { actions } from '@/actions';

interface ProductItem {
  id: number;
  name: string;
  category: string;
  retailPriceIdr: number;
  stock?: number;
}

interface CreateManualOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: ProductItem[];
  onOrderCreated: () => void;
  showToast: (type: 'success' | 'error', text: string) => void;
}

export const CreateManualOrderModal: React.FC<CreateManualOrderModalProps> = ({
  isOpen,
  onClose,
  products = [],
  onOrderCreated,
  showToast,
}) => {
  const [selectedProductId, setSelectedProductId] = useState<number | ''>(products[0]?.id || '');
  const [customProductName, setCustomProductName] = useState<string>(products[0]?.name || '');
  const [quantity, setQuantity] = useState<number>(1);
  const [unitPriceIdr, setUnitPriceIdr] = useState<number>(products[0]?.retailPriceIdr || 0);
  const [totalAmountIdr, setTotalAmountIdr] = useState<number>(products[0]?.retailPriceIdr || 0);
  const [customerEmail, setCustomerEmail] = useState<string>('');
  const [customerWhatsapp, setCustomerWhatsapp] = useState<string>('');
  const [status, setStatus] = useState<'COMPLETED' | 'PENDING_PAYMENT'>('COMPLETED');
  const [licenseCodesRaw, setLicenseCodesRaw] = useState<string>('');
  const [sendEmailNotification, setSendEmailNotification] = useState<boolean>(true);
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Synchronize when product selection changes
  const handleProductSelect = (id: number) => {
    setSelectedProductId(id);
    const prod = products.find((p) => p.id === id);
    if (prod) {
      setCustomProductName(prod.name);
      setUnitPriceIdr(prod.retailPriceIdr);
      setTotalAmountIdr(prod.retailPriceIdr * quantity);
    }
  };

  // Recalculate total amount when quantity or unit price changes
  const handleQuantityChange = (newQty: number) => {
    const qty = Math.max(1, newQty);
    setQuantity(qty);
    setTotalAmountIdr(unitPriceIdr * qty);
  };

  const handleUnitPriceChange = (newPrice: number) => {
    const price = Math.max(0, newPrice);
    setUnitPriceIdr(price);
    setTotalAmountIdr(price * quantity);
  };

  // Reset initial values when opened
  useEffect(() => {
    if (isOpen && products.length > 0 && !selectedProductId) {
      const first = products[0];
      setSelectedProductId(first.id);
      setCustomProductName(first.name);
      setUnitPriceIdr(first.retailPriceIdr);
      setTotalAmountIdr(first.retailPriceIdr);
    }
  }, [isOpen, products, selectedProductId]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!customerEmail.trim()) {
      setErrorMessage('Alamat email pelanggan wajib diisi.');
      return;
    }

    if (!customProductName.trim()) {
      setErrorMessage('Nama produk wajib diisi.');
      return;
    }

    const codes = licenseCodesRaw
      .split('\n')
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    setIsSubmitting(true);
    try {
      const res = await actions.adminCreateManualOrder({
        productId: typeof selectedProductId === 'number' ? selectedProductId : undefined,
        productName: customProductName.trim(),
        quantity,
        totalAmountIdr,
        customerEmail: customerEmail.trim().toLowerCase(),
        customerWhatsapp: customerWhatsapp.trim() || undefined,
        status,
        licenseCodes: codes,
        sendEmailNotification,
        notes: notes.trim() || undefined,
      });

      if (res.error) {
        setErrorMessage(res.error.message);
        showToast('error', res.error.message);
      } else if (res.data) {
        showToast('success', res.data.message || 'Transaksi manual berhasil dicatat!');
        onOrderCreated();
        onClose();
      }
    } catch (err) {
      const msg = (err as Error).message || 'Terjadi kesalahan sistem';
      setErrorMessage(msg);
      showToast('error', msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const parsedCodesCount = licenseCodesRaw
    .split('\n')
    .map((c) => c.trim())
    .filter((c) => c.length > 0).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/60 dark:bg-zinc-900/40">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                Buat Transaksi / Pembayaran Manual
              </h3>
              <p className="text-[11px] text-zinc-500">
                Pencatatan pesanan langsung tanpa memotong saldo supplier wholesale
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 text-xs">
          {errorMessage && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Zero-Upstream-Deduction Safeguard Notice */}
          <div className="p-3 bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/60 rounded-xl flex items-start gap-2.5 text-sky-800 dark:text-sky-300">
            <ShieldCheck className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed">
              <strong>Proteksi Saldo Aktif:</strong> Transaksi manual ini murni dicatat ke pembukuan toko Pixel Store. Sistem <strong>TIDAK</strong> akan memotong saldo USDT wholesale InsightXPro maupun mengurangi kuota supplier.
            </p>
          </div>

          {/* 1. Pilih Produk & Kuantitas */}
          <div className="space-y-3 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
            <div className="font-bold text-zinc-900 dark:text-zinc-100 flex items-center justify-between">
              <span>1. Detail Produk</span>
              <span className="text-[10px] text-zinc-400 font-normal">Pilih dari katalog toko atau kustom</span>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] text-zinc-600 dark:text-zinc-400 font-medium">Pilih Dari Katalog Toko:</label>
              <select
                value={selectedProductId}
                onChange={(e) => handleProductSelect(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white focus:outline-none"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — Rp {p.retailPriceIdr.toLocaleString('id-ID')}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 space-y-1.5">
                <label className="text-[11px] text-zinc-600 dark:text-zinc-400 font-medium">Nama Produk di Resi / Riwayat:</label>
                <input
                  type="text"
                  value={customProductName}
                  onChange={(e) => setCustomProductName(e.target.value)}
                  placeholder="Contoh: Gemini Pro 18 Months"
                  required
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white focus:outline-none font-medium"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] text-zinc-600 dark:text-zinc-400 font-medium">Jumlah (Qty):</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={quantity}
                  onChange={(e) => handleQuantityChange(Number(e.target.value))}
                  required
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white focus:outline-none font-bold text-center"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="space-y-1.5">
                <label className="text-[11px] text-zinc-600 dark:text-zinc-400 font-medium">Harga Satuan (IDR):</label>
                <input
                  type="number"
                  min="0"
                  step="500"
                  value={unitPriceIdr}
                  onChange={(e) => handleUnitPriceChange(Number(e.target.value))}
                  required
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white focus:outline-none font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] text-zinc-600 dark:text-zinc-400 font-medium">Total Tagihan (IDR):</label>
                <input
                  type="number"
                  min="0"
                  value={totalAmountIdr}
                  onChange={(e) => setTotalAmountIdr(Number(e.target.value))}
                  required
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#141416] border border-emerald-300 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 focus:outline-none font-bold font-mono"
                />
              </div>
            </div>
          </div>

          {/* 2. Informasi Pembeli */}
          <div className="space-y-3 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
            <div className="font-bold text-zinc-900 dark:text-zinc-100 flex items-center justify-between">
              <span>2. Informasi Pelanggan</span>
              <span className="text-[10px] text-zinc-400 font-normal">Sinkron ke akun pembeli jika terdaftar</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[11px] text-zinc-600 dark:text-zinc-400 font-medium flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Email Pembeli: <strong className="text-red-500">*</strong></span>
                </label>
                <input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="pembeli@gmail.com"
                  required
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] text-zinc-600 dark:text-zinc-400 font-medium flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-zinc-400" />
                  <span>WhatsApp (Opsional):</span>
                </label>
                <input
                  type="text"
                  value={customerWhatsapp}
                  onChange={(e) => setCustomerWhatsapp(e.target.value)}
                  placeholder="08123456789"
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* 3. Status Transaksi & Kode Lisensi */}
          <div className="space-y-3 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
            <div className="font-bold text-zinc-900 dark:text-zinc-100 flex items-center justify-between">
              <span>3. Status & Lisensi Digital</span>
              <span className="text-[10px] text-zinc-400 font-normal">Kredensial aktivasi untuk pembeli</span>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] text-zinc-600 dark:text-zinc-400 font-medium">Status Pembayaran:</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setStatus('COMPLETED')}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                    status === 'COMPLETED'
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                      : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141416] text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  <span>COMPLETED (Lunas)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setStatus('PENDING_PAYMENT')}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                    status === 'PENDING_PAYMENT'
                      ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
                      : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141416] text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
                  }`}
                >
                  <span>PENDING (Belum Bayar)</span>
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] text-zinc-600 dark:text-zinc-400 font-medium flex items-center gap-1">
                  <Key className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Kode Lisensi / Tautan Aktivasi / Akun (1 baris per item):</span>
                </label>
                {parsedCodesCount > 0 && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400">
                    {parsedCodesCount} lisensi
                  </span>
                )}
              </div>
              <textarea
                rows={3}
                value={licenseCodesRaw}
                onChange={(e) => setLicenseCodesRaw(e.target.value)}
                placeholder="Contoh:&#10;https://one.google.com/promo/claim/XXXX-YYYY-ZZZZ&#10;user@mail.com:password123"
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white font-mono text-xs focus:outline-none"
              />
              <p className="text-[10px] text-zinc-400">
                Lisensi ini akan tampil di dashboard akun pelanggan (/user) dan di resi pencarian pesanan.
              </p>
            </div>

            {/* Email dispatch toggle */}
            {status === 'COMPLETED' && (
              <label className="flex items-center gap-2.5 pt-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={sendEmailNotification}
                  onChange={(e) => setSendEmailNotification(e.target.checked)}
                  className="rounded border-zinc-300 dark:border-zinc-700 text-zinc-900 focus:ring-0 w-4 h-4"
                />
                <span className="text-[11px] text-zinc-700 dark:text-zinc-300 font-medium">
                  Kirimkan email resi & lisensi otomatis ke alamat email pembeli (via SMTP)
                </span>
              </label>
            )}

            <div className="space-y-1.5 pt-1">
              <label className="text-[11px] text-zinc-600 dark:text-zinc-400 font-medium flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-zinc-400" />
                <span>Catatan Internal Admin (Opsional):</span>
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Misal: Pembeli transfer BCA langsung ke owner / order via WA"
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white focus:outline-none"
              />
            </div>
          </div>

          {/* Modal Footer Actions */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-semibold transition cursor-pointer"
            >
              Batal
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-xs disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Simpan Transaksi Manual</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
