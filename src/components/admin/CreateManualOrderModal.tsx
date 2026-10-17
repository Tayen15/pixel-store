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
  QrCode,
  Copy,
  Check,
  Download,
  MessageCircle,
  ExternalLink,
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

interface QrisResultState {
  orderNumber: string;
  productName: string;
  totalAmountIdr: number;
  customerEmail: string;
  customerWhatsapp: string;
  qrCodeString: string | null;
  paymentUrl: string | null;
  qrCodeDataUrl: string | null;
  expiresAt: string;
  gatewayProvider: string;
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
  const [paymentMode, setPaymentMode] = useState<'QRIS' | 'MANUAL'>('QRIS');
  const [status, setStatus] = useState<'COMPLETED' | 'PENDING_PAYMENT'>('COMPLETED');
  const [licenseCodesRaw, setLicenseCodesRaw] = useState<string>('');
  const [sendEmailNotification, setSendEmailNotification] = useState<boolean>(true);
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Result state after QRIS is successfully generated
  const [qrisResult, setQrisResult] = useState<QrisResultState | null>(null);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [copiedRawQr, setCopiedRawQr] = useState<boolean>(false);

  // Synchronize when product selection changes
  const handleProductSelect = (val: string) => {
    if (val === 'CUSTOM') {
      setSelectedProductId('');
      setCustomProductName('');
      setUnitPriceIdr(0);
      setTotalAmountIdr(0);
      return;
    }

    const id = Number(val);
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
    if (isOpen) {
      setQrisResult(null);
      setErrorMessage('');
      setCopiedLink(false);
      setCopiedRawQr(false);

      if (products.length > 0 && !selectedProductId) {
        const first = products[0];
        setSelectedProductId(first.id);
        setCustomProductName(first.name);
        setUnitPriceIdr(first.retailPriceIdr);
        setTotalAmountIdr(first.retailPriceIdr);
      }
    }
  }, [isOpen, products]);

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

    if (totalAmountIdr <= 0) {
      setErrorMessage('Total tagihan nominal harus lebih besar dari Rp 0.');
      return;
    }

    if (paymentMode === 'QRIS' && totalAmountIdr < 1000) {
      setErrorMessage('Nominal tagihan QRIS minimal Rp 1.000');
      return;
    }

    const codes = licenseCodesRaw
      .split('\n')
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    setIsSubmitting(true);
    try {
      const isQris = paymentMode === 'QRIS';
      const res = await actions.adminCreateManualOrder({
        productId: typeof selectedProductId === 'number' ? selectedProductId : undefined,
        productName: customProductName.trim(),
        quantity,
        totalAmountIdr,
        customerEmail: customerEmail.trim().toLowerCase(),
        customerWhatsapp: customerWhatsapp.trim() || undefined,
        status: isQris ? 'PENDING_PAYMENT' : status,
        generateQris: isQris,
        licenseCodes: codes,
        sendEmailNotification,
        notes: notes.trim() || undefined,
      });

      if (res.error) {
        setErrorMessage(res.error.message);
        showToast('error', res.error.message);
      } else if (res.data) {
        showToast('success', res.data.message || 'Transaksi manual berhasil dicatat!');

        // If QRIS was generated, switch to QRIS showcase screen
        if (isQris && res.data.qris) {
          setQrisResult({
            orderNumber: res.data.order.orderNumber,
            productName: customProductName.trim(),
            totalAmountIdr: res.data.qris.amountIdr || totalAmountIdr,
            customerEmail: customerEmail.trim(),
            customerWhatsapp: customerWhatsapp.trim(),
            qrCodeString: res.data.qris.qrCodeString,
            paymentUrl: res.data.qris.paymentUrl,
            qrCodeDataUrl: res.data.qris.qrCodeDataUrl,
            expiresAt: res.data.qris.expiresAt,
            gatewayProvider: res.data.qris.gatewayProvider,
          });
          onOrderCreated(); // Refresh background table
        } else {
          onOrderCreated();
          onClose();
        }
      }
    } catch (err) {
      const msg = (err as Error).message || 'Terjadi kesalahan sistem';
      setErrorMessage(msg);
      showToast('error', msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyLink = () => {
    if (!qrisResult) return;
    const url = qrisResult.paymentUrl || `${window.location.origin}/user?orderNumber=${qrisResult.orderNumber}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    showToast('success', 'Link pembayaran berhasil disalin!');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyRawQr = () => {
    if (!qrisResult?.qrCodeString) return;
    navigator.clipboard.writeText(qrisResult.qrCodeString);
    setCopiedRawQr(true);
    showToast('success', 'String EMVCo QRIS berhasil disalin!');
    setTimeout(() => setCopiedRawQr(false), 2000);
  };

  const handleDownloadQr = () => {
    if (!qrisResult?.qrCodeDataUrl) return;
    const a = document.createElement('a');
    a.href = qrisResult.qrCodeDataUrl;
    a.download = `QRIS-${qrisResult.orderNumber}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('success', 'Barcode QRIS berhasil diunduh!');
  };

  const parsedCodesCount = licenseCodesRaw
    .split('\n')
    .map((c) => c.trim())
    .filter((c) => c.length > 0).length;

  const paymentUrl = qrisResult?.paymentUrl || (typeof window !== 'undefined' ? `${window.location.origin}/user?orderNumber=${qrisResult?.orderNumber}` : '');
  const waText = qrisResult
    ? encodeURIComponent(
        `Halo kak, berikut tagihan QRIS untuk pembelian *${qrisResult.productName}* (${qrisResult.orderNumber}) sebesar *Rp ${qrisResult.totalAmountIdr.toLocaleString('id-ID')}*.\n\nSilakan scan barcode QRIS atau klik tautan pembayaran berikut:\n${paymentUrl}\n\nTerima kasih!`
      )
    : '';

  const cleanWaNumber = qrisResult?.customerWhatsapp ? qrisResult.customerWhatsapp.replace(/[^0-9]/g, '') : '';
  const waUrl = cleanWaNumber ? `https://wa.me/${cleanWaNumber}?text=${waText}` : `https://wa.me/?text=${waText}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* ==================== 1. QRIS RESULT SUCCESS VIEW ==================== */}
        {qrisResult ? (
          <div className="flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/60 dark:bg-zinc-900/40">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                    Barcode QRIS Berhasil Diterbitkan!
                  </h3>
                  <p className="text-[11px] text-zinc-500 font-mono">
                    {qrisResult.orderNumber}
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

            {/* Body */}
            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 flex flex-col items-center text-center space-y-3">
                <div className="w-full flex items-center justify-between px-2 text-[10px] text-zinc-400 font-bold uppercase tracking-wider border-b border-zinc-200/60 dark:border-zinc-800/60 pb-2">
                  <span>QRIS Nasional</span>
                  <span className="font-mono">{qrisResult.gatewayProvider.toUpperCase()}</span>
                </div>

                {/* QR Image Box */}
                <div className="bg-white p-3.5 rounded-2xl shadow-sm border border-zinc-200 inline-block">
                  {qrisResult.qrCodeDataUrl ? (
                    <img
                      src={qrisResult.qrCodeDataUrl}
                      alt="Barcode QRIS"
                      className="w-52 h-52 object-contain"
                    />
                  ) : (
                    <div className="w-52 h-52 flex items-center justify-center bg-zinc-100 rounded-xl text-zinc-400 text-center p-4">
                      Tautan QRIS tersedia via tombol di bawah
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <div className="text-[11px] text-zinc-500">Nominal Tagihan:</div>
                  <div className="text-2xl font-extrabold text-zinc-900 dark:text-white font-mono">
                    Rp {qrisResult.totalAmountIdr.toLocaleString('id-ID')}
                  </div>
                  <div className="text-xs text-zinc-600 dark:text-zinc-400 font-medium">
                    {qrisResult.productName}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-3 py-1 rounded-full border border-amber-200 dark:border-amber-900/60">
                  <span>Menunggu Pembayaran Pembeli</span>
                </div>
              </div>

              {/* Action Buttons Strip */}
              <div className="grid grid-cols-2 gap-2.5">
                {qrisResult.qrCodeDataUrl && (
                  <button
                    type="button"
                    onClick={handleDownloadQr}
                    className="py-2.5 px-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141416] hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Gambar QR</span>
                  </button>
                )}

                <a
                  href={waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Bagikan ke WhatsApp</span>
                </a>
              </div>

              {/* Payment URL field */}
              {paymentUrl && (
                <div className="space-y-1.5 p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800">
                  <div className="flex items-center justify-between text-[11px] text-zinc-500 font-medium">
                    <span>Tautan Pembayaran:</span>
                    <button
                      type="button"
                      onClick={handleCopyLink}
                      className="text-zinc-900 dark:text-white font-bold flex items-center gap-1 hover:underline cursor-pointer"
                    >
                      {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedLink ? 'Tersalin' : 'Salin Link'}</span>
                    </button>
                  </div>
                  <div className="text-[11px] font-mono text-zinc-700 dark:text-zinc-300 truncate bg-white dark:bg-[#141416] p-2 rounded-lg border border-zinc-200 dark:border-zinc-800">
                    {paymentUrl}
                  </div>
                </div>
              )}

              {/* Raw QR String (optional) */}
              {qrisResult.qrCodeString && (
                <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-1">
                  <span>String Kode QR (EMVCo):</span>
                  <button
                    type="button"
                    onClick={handleCopyRawQr}
                    className="text-zinc-700 dark:text-zinc-300 font-medium flex items-center gap-1 hover:underline cursor-pointer"
                  >
                    {copiedRawQr ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedRawQr ? 'Tersalin' : 'Salin Teks QRIS'}</span>
                  </button>
                </div>
              )}

              <div className="p-3 bg-sky-50/70 dark:bg-sky-950/20 border border-sky-200/60 dark:border-sky-800/40 rounded-xl flex items-start gap-2.5 text-sky-800 dark:text-sky-300">
                <ShieldCheck className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" />
                <p className="text-[11px] leading-relaxed">
                  <strong>Otomatisasi Lunas:</strong> Begitu pembeli menyelesaikan transfer QRIS, sistem otomatis memverifikasi dan mengubah status pesanan menjadi <strong>COMPLETED</strong> tanpa mengurangi saldo wholesale supplier.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/60 dark:bg-zinc-900/40 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-bold hover:opacity-90 transition cursor-pointer"
              >
                Selesai & Tutup
              </button>
            </div>
          </div>
        ) : (
          /* ==================== 2. CREATION FORM VIEW ==================== */
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/60 dark:bg-zinc-900/40">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 flex items-center justify-center shadow-xs">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                    Buat Transaksi / Pembayaran Manual
                  </h3>
                  <p className="text-[11px] text-zinc-500">
                    Bisa untuk produk katalog maupun produk kustom / jasa lainnya
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
                  <strong>Proteksi Saldo Aktif:</strong> Transaksi manual ini murni dicatat ke toko Pixel Store. Sistem <strong>TIDAK</strong> akan memotong saldo USDT wholesale InsightXPro maupun mengurangi stok kuota supplier.
                </p>
              </div>

              {/* 1. Pilih Produk & Kuantitas */}
              <div className="space-y-3 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
                <div className="font-bold text-zinc-900 dark:text-zinc-100 flex items-center justify-between">
                  <span>1. Detail Produk / Item</span>
                  <span className="text-[10px] text-zinc-400 font-normal">Katalog toko atau custom produk lain</span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] text-zinc-600 dark:text-zinc-400 font-medium">Pilihan Sumber Produk:</label>
                  <select
                    value={selectedProductId || 'CUSTOM'}
                    onChange={(e) => handleProductSelect(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white focus:outline-none"
                  >
                    <option value="CUSTOM">-- Kustom / Produk Lainnya (Ketik Bebas) --</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        [Katalog] {p.name} — Rp {p.retailPriceIdr.toLocaleString('id-ID')}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2 space-y-1.5">
                    <label className="text-[11px] text-zinc-600 dark:text-zinc-400 font-medium">Nama Produk di Resi / Riwayat: <strong className="text-red-500">*</strong></label>
                    <input
                      type="text"
                      value={customProductName}
                      onChange={(e) => setCustomProductName(e.target.value)}
                      placeholder="Contoh: Jasa Setup Domain / Gemini Pro / Netflix"
                      required
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white focus:outline-none font-medium"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] text-zinc-600 dark:text-zinc-400 font-medium">Jumlah (Qty):</label>
                    <input
                      type="number"
                      min="1"
                      max="1000"
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
                    <label className="text-[11px] text-zinc-600 dark:text-zinc-400 font-medium">Total Tagihan (IDR): <strong className="text-red-500">*</strong></label>
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
                      <span>WhatsApp (Untuk Kirim QRIS):</span>
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

              {/* 3. Opsi Pembayaran & QRIS Barcode */}
              <div className="space-y-3 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
                <div className="font-bold text-zinc-900 dark:text-zinc-100 flex items-center justify-between">
                  <span>3. Metode Pembayaran & QRIS Barcode</span>
                  <span className="text-[10px] text-zinc-400 font-normal">Pilih terbitkan barcode atau catat manual</span>
                </div>

                {/* Mode Selector */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setPaymentMode('QRIS')}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer flex items-start gap-2.5 ${
                      paymentMode === 'QRIS'
                        ? 'border-zinc-900 dark:border-white bg-white dark:bg-[#18181b] shadow-xs ring-1 ring-zinc-900 dark:ring-white'
                        : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141416] hover:bg-zinc-50 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <div className="w-7 h-7 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 flex items-center justify-center shrink-0 mt-0.5">
                      <QrCode className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                        <span>Buat Barcode & Link QRIS</span>
                        <span className="px-1.5 py-0.2 rounded text-[9px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-mono">
                          Auto
                        </span>
                      </div>
                      <p className="text-[10.5px] text-zinc-500 mt-0.5">
                        Terbitkan barcode QRIS resmi & link bayar untuk discan/dibayar pelanggan
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMode('MANUAL')}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer flex items-start gap-2.5 ${
                      paymentMode === 'MANUAL'
                        ? 'border-zinc-900 dark:border-white bg-white dark:bg-[#18181b] shadow-xs ring-1 ring-zinc-900 dark:ring-white'
                        : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141416] hover:bg-zinc-50 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <div className="w-7 h-7 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 flex items-center justify-center shrink-0 mt-0.5">
                      <CreditCard className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-bold text-zinc-900 dark:text-white">
                        Catat Manual Saja
                      </div>
                      <p className="text-[10.5px] text-zinc-500 mt-0.5">
                        Pembayaran via transfer bank langsung / tunai / offline
                      </p>
                    </div>
                  </button>
                </div>

                {/* Sub-status options if MANUAL mode */}
                {paymentMode === 'MANUAL' && (
                  <div className="space-y-1.5 pt-1">
                    <label className="text-[11px] text-zinc-600 dark:text-zinc-400 font-medium">Status Pembayaran Manual:</label>
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
                )}
              </div>

              {/* 4. Kredensial Lisensi / Catatan */}
              <div className="space-y-3 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
                <div className="font-bold text-zinc-900 dark:text-zinc-100 flex items-center justify-between">
                  <span>4. Lisensi Digital / Akun (Opsional)</span>
                  {parsedCodesCount > 0 && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400">
                      {parsedCodesCount} lisensi terisi
                    </span>
                  )}
                </div>

                <div className="space-y-1.5">
                  <textarea
                    rows={2}
                    value={licenseCodesRaw}
                    onChange={(e) => setLicenseCodesRaw(e.target.value)}
                    placeholder="Contoh:&#10;user@mail.com:password123&#10;https://one.google.com/promo/claim/XXXX-YYYY"
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white font-mono text-xs focus:outline-none"
                  />
                  <p className="text-[10px] text-zinc-400">
                    Lisensi ini akan tampil di dashboard pelanggan (/user) setelah pesanan lunas.
                  </p>
                </div>

                {/* Email dispatch toggle */}
                {paymentMode === 'MANUAL' && status === 'COMPLETED' && (
                  <label className="flex items-center gap-2.5 pt-1 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={sendEmailNotification}
                      onChange={(e) => setSendEmailNotification(e.target.checked)}
                      className="rounded border-zinc-300 dark:border-zinc-700 text-zinc-900 focus:ring-0 w-4 h-4"
                    />
                    <span className="text-[11px] text-zinc-700 dark:text-zinc-300 font-medium">
                      Kirimkan email resi & lisensi otomatis ke alamat email pembeli (via Sumopod SMTP)
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
                    placeholder="Misal: Order kustom via WhatsApp / Direct Deal"
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
                      <span>{paymentMode === 'QRIS' ? 'Menerbitkan QRIS...' : 'Menyimpan...'}</span>
                    </>
                  ) : paymentMode === 'QRIS' ? (
                    <>
                      <QrCode className="w-4 h-4" />
                      <span>Terbitkan & Buat Barcode QRIS</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Simpan Transaksi Manual</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
};
