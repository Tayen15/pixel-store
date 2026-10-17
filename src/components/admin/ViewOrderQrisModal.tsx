'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  QrCode,
  Copy,
  Check,
  Download,
  Share2,
  ExternalLink,
  Loader2,
  AlertCircle,
  Clock,
  ShieldCheck,
  MessageCircle,
} from 'lucide-react';
import { actions } from '@/actions';

interface ViewOrderQrisModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string | null;
  showToast: (type: 'success' | 'error', text: string) => void;
}

interface PaymentDetails {
  paymentId: string;
  orderNumber: string;
  customerEmail: string;
  customerWhatsapp: string;
  productName: string;
  totalAmountIdr: number;
  orderStatus: string;
  gatewayProvider: string;
  gatewayReference: string;
  paymentMethod: string | null;
  qrCodeString: string | null;
  paymentUrl: string | null;
  qrCodeDataUrl: string | null;
  amountIdr: number;
  status: string;
  expiresAt: string;
}

export const ViewOrderQrisModal: React.FC<ViewOrderQrisModalProps> = ({
  isOpen,
  onClose,
  orderId,
  showToast,
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [payment, setPayment] = useState<PaymentDetails | null>(null);
  const [error, setError] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [copiedRawQr, setCopiedRawQr] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen || !orderId) {
      setPayment(null);
      setError('');
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError('');

    actions.adminGetOrderPaymentDetails({ orderId })
      .then((res) => {
        if (!isMounted) return;
        if (res.error) {
          setError(res.error.message);
        } else if (res.data) {
          setPayment(res.data);
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setError((err as Error).message || 'Gagal memuat detail QRIS');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, orderId]);

  if (!isOpen) return null;

  const handleCopyLink = () => {
    const url = payment?.paymentUrl || `${window.location.origin}/user?orderNumber=${payment?.orderNumber}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    showToast('success', 'Link pembayaran berhasil disalin!');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyRawQr = () => {
    if (!payment?.qrCodeString) return;
    navigator.clipboard.writeText(payment.qrCodeString);
    setCopiedRawQr(true);
    showToast('success', 'String EMVCo QRIS berhasil disalin!');
    setTimeout(() => setCopiedRawQr(false), 2000);
  };

  const handleDownloadQr = () => {
    if (!payment?.qrCodeDataUrl) return;
    const a = document.createElement('a');
    a.href = payment.qrCodeDataUrl;
    a.download = `QRIS-${payment.orderNumber}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('success', 'Barcode QRIS berhasil diunduh!');
  };

  const paymentUrl = payment?.paymentUrl || (typeof window !== 'undefined' ? `${window.location.origin}/user?orderNumber=${payment?.orderNumber}` : '');

  const waText = payment
    ? encodeURIComponent(
        `Halo kak, berikut tagihan pembayaran pesanan *${payment.orderNumber}* (${payment.productName}) sejumlah *Rp ${payment.amountIdr.toLocaleString('id-ID')}*.\n\nSilakan scan barcode QRIS atau klik tautan pembayaran berikut:\n${paymentUrl}\n\nTerima kasih!`
      )
    : '';

  const cleanWaNumber = payment?.customerWhatsapp ? payment.customerWhatsapp.replace(/[^0-9]/g, '') : '';
  const waUrl = cleanWaNumber ? `https://wa.me/${cleanWaNumber}?text=${waText}` : `https://wa.me/?text=${waText}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/60 dark:bg-zinc-900/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 flex items-center justify-center shadow-xs">
              <QrCode className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                Barcode & Tautan QRIS
              </h3>
              <p className="text-[11px] text-zinc-500 font-mono">
                {payment?.orderNumber || 'Memuat pesanan...'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {loading && (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-zinc-400">
              <Loader2 className="w-6 h-6 animate-spin text-zinc-900 dark:text-white" />
              <span>Memuat tagihan QRIS...</span>
            </div>
          )}

          {!loading && error && (
            <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl flex items-start gap-2.5 text-red-600 dark:text-red-400">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Tidak dapat menampilkan QRIS</p>
                <p className="text-[11px] mt-0.5 text-red-500">{error}</p>
              </div>
            </div>
          )}

          {!loading && payment && (
            <>
              {/* QRIS Card Component */}
              <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 flex flex-col items-center text-center space-y-3">
                {/* QRIS Header Badge */}
                <div className="w-full flex items-center justify-between px-2 text-[10px] text-zinc-400 font-bold uppercase tracking-wider border-b border-zinc-200/60 dark:border-zinc-800/60 pb-2">
                  <span>QRIS Nasional</span>
                  <span className="font-mono">{payment.gatewayProvider.toUpperCase()}</span>
                </div>

                {/* QR Image Box */}
                <div className="bg-white p-3 rounded-2xl shadow-sm border border-zinc-200 inline-block">
                  {payment.qrCodeDataUrl ? (
                    <img
                      src={payment.qrCodeDataUrl}
                      alt="Barcode QRIS"
                      className="w-48 h-48 object-contain"
                    />
                  ) : (
                    <div className="w-48 h-48 flex items-center justify-center bg-zinc-100 rounded-xl text-zinc-400 text-center p-4">
                      Tautan QRIS tersedia via tautan pembayaran di bawah
                    </div>
                  )}
                </div>

                {/* Amount & Order details */}
                <div className="space-y-1">
                  <div className="text-[11px] text-zinc-500">Total Nominal Pembayaran:</div>
                  <div className="text-xl font-extrabold text-zinc-900 dark:text-white font-mono">
                    Rp {payment.amountIdr.toLocaleString('id-ID')}
                  </div>
                  <div className="text-[11px] text-zinc-600 dark:text-zinc-400 font-medium">
                    {payment.productName}
                  </div>
                </div>

                {/* Status Badge */}
                <div className="flex items-center gap-1.5 text-[11px] font-semibold pt-1">
                  {payment.status === 'PAID' ? (
                    <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      ✓ Pembayaran Lunas (PAID)
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Menunggu Pembayaran (UNPAID)
                    </span>
                  )}
                </div>
              </div>

              {/* Action Buttons Strip */}
              <div className="grid grid-cols-2 gap-2">
                {payment.qrCodeDataUrl && (
                  <button
                    type="button"
                    onClick={handleDownloadQr}
                    className="py-2.5 px-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141416] hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download QR</span>
                  </button>
                )}

                <a
                  href={waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>Kirim ke WA</span>
                </a>
              </div>

              {/* Payment URL field */}
              {paymentUrl && (
                <div className="space-y-1.5 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800">
                  <div className="flex items-center justify-between text-[11px] text-zinc-500 font-medium">
                    <span>Tautan Pembayaran:</span>
                    <button
                      type="button"
                      onClick={handleCopyLink}
                      className="text-zinc-900 dark:text-white font-bold flex items-center gap-1 hover:underline cursor-pointer"
                    >
                      {copiedLink ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedLink ? 'Tersalin' : 'Salin Link'}</span>
                    </button>
                  </div>
                  <div className="text-[11px] font-mono text-zinc-700 dark:text-zinc-300 truncate bg-white dark:bg-[#141416] p-2 rounded-lg border border-zinc-200 dark:border-zinc-800">
                    {paymentUrl}
                  </div>
                </div>
              )}

              {/* Raw QR String (optional) */}
              {payment.qrCodeString && (
                <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-1">
                  <span>String Kode QR (EMVCo):</span>
                  <button
                    type="button"
                    onClick={handleCopyRawQr}
                    className="text-zinc-700 dark:text-zinc-300 font-medium flex items-center gap-1 hover:underline cursor-pointer"
                  >
                    {copiedRawQr ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedRawQr ? 'Tersalin' : 'Salin Teks QRIS'}</span>
                  </button>
                </div>
              )}

              {/* Safeguard badge */}
              <div className="p-2.5 bg-sky-50/60 dark:bg-sky-950/20 border border-sky-200/60 dark:border-sky-800/40 rounded-xl flex items-center gap-2 text-sky-800 dark:text-sky-300 text-[10.5px]">
                <ShieldCheck className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                <span>Status pesanan akan lunas otomatis setelah buyer scan & bayar.</span>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/60 dark:bg-zinc-900/40 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-xs font-bold hover:opacity-90 transition cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
