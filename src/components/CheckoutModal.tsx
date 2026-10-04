import React, { useState, useEffect } from 'react';
import { actions } from 'astro:actions';
import QRCode from 'qrcode';
import { 
  X, 
  QrCode, 
  CheckCircle2, 
  Copy, 
  Clock, 
  ShieldCheck, 
  Sparkles, 
  ArrowRight, 
  Loader2, 
  AlertCircle,
  ExternalLink,
  Zap,
  Info,
  ChevronDown,
  ChevronUp,
  Download
} from 'lucide-react';
import { ServiceLogo } from './ServiceLogo';
import { parseCatalogDescription } from './ProductDetailModal';

export interface ProductData {
  id: number;
  name: string;
  category: string;
  description: string;
  retailPriceIdr: number;
  basePriceUsdt: number;
  inStock: boolean;
  stock?: number;
  imageUrl?: string;
}

interface CheckoutModalProps {
  product: ProductData | null;
  initialQuantity?: number;
  onClose: () => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({ 
  product, 
  initialQuantity = 1,
  onClose 
}) => {
  const [step, setStep] = useState<'form' | 'qris' | 'success' | 'failed_supplier'>('form');
  const [quantity, setQuantity] = useState(initialQuantity || 1);
  const [unitPrice, setUnitPrice] = useState<number>(product?.retailPriceIdr || 0);
  const [priceNotice, setPriceNotice] = useState<string | null>(null);
  const [isVerifyingPrice, setIsVerifyingPrice] = useState<boolean>(true);
  const [canPurchase, setCanPurchase] = useState<boolean>(true);
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null);

  // Synchronize initial unit price and trigger realtime pre-flight check from database
  useEffect(() => {
    if (!product) return;
    setUnitPrice(product.retailPriceIdr);
    setIsVerifyingPrice(true);
    setPriceNotice(null);

    let isMounted = true;
    actions
      .getLatestProductPrice({ productId: product.id, quantity: 1 })
      .then(({ data, error }) => {
        if (!isMounted) return;
        if (!error && data) {
          if (data.canPurchase === false) {
            setCanPurchase(false);
            setUnavailableReason(data.unavailableReason || 'Stok / saldo kuota sedang kosong');
          } else {
            setCanPurchase(true);
            setUnavailableReason(null);
          }

          if (data.unitPriceIdr !== product.retailPriceIdr) {
            setPriceNotice(
              `Tarif telah disesuaikan dengan harga terbaru toko: Rp ${data.unitPriceIdr.toLocaleString('id-ID')} (sebelumnya Rp ${product.retailPriceIdr.toLocaleString('id-ID')}).`
            );
          }
          setUnitPrice(data.unitPriceIdr);
        }
      })
      .catch((err) => {
        console.warn('Realtime price check failed:', err);
      })
      .finally(() => {
        if (isMounted) setIsVerifyingPrice(false);
      });

    return () => {
      isMounted = false;
    };
  }, [product?.id]);

  useEffect(() => {
    if (initialQuantity && initialQuantity >= 1) {
      setQuantity(initialQuantity);
    }
  }, [initialQuantity, product?.id]);
  const [showOptionalFields, setShowOptionalFields] = useState(false);
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [failureReason, setFailureReason] = useState('');

  // Invoice & Order state
  const [orderData, setOrderData] = useState<{
    orderNumber: string;
    amountIdr: number;
    qrCodeString: string;
    paymentUrl?: string;
    qrCodeImageUrl?: string;
    qrCodeDataUrl?: string;
    gatewayProvider?: string;
    expiresAt: string;
  } | null>(null);

  // QR Code Rendering & action states
  const [renderedQrUrl, setRenderedQrUrl] = useState<string>('');
  const [isQrLoading, setIsQrLoading] = useState<boolean>(true);
  const [copiedAmount, setCopiedAmount] = useState<boolean>(false);
  const [copiedOrderNumber, setCopiedOrderNumber] = useState<boolean>(false);

  // Success keys state
  const [licenseCodes, setLicenseCodes] = useState<string[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(15 * 60);

  // Countdown timer for QRIS
  useEffect(() => {
    if (step !== 'qris') return;

    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [step]);

  // Polling for order completion when on QRIS step
  useEffect(() => {
    if (step !== 'qris' || !orderData) return;

    const pollInterval = setInterval(async () => {
      try {
        const { data, error } = await actions.getOrderStatus({
          orderNumber: orderData.orderNumber,
        });

        if (!error && data) {
          if (data.status === 'COMPLETED' && data.licenseCodes.length > 0) {
            setLicenseCodes(data.licenseCodes);
            setStep('success');
            clearInterval(pollInterval);
          } else if (data.status === 'FAILED_SUPPLIER') {
            setFailureReason(data.failureReason || 'Stok supplier wholesale kosong saat verifikasi pembayaran.');
            setStep('failed_supplier');
            clearInterval(pollInterval);
          }
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 2500);

    return () => clearInterval(pollInterval);
  }, [step, orderData]);

  if (!product) return null;

  const totalAmount = unitPrice * quantity;
  const { features, notes } = parseCatalogDescription(product.description);

  // Handle Order Submission -> Request QRIS (Instant, zero-friction)
  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage('');

    try {
      const { data, error } = await actions.checkout({
        productId: product.id,
        quantity,
        email: email.trim() || undefined,
        whatsapp: whatsapp.trim() || undefined,
      });

      if (error || !data) {
        setErrorMessage(error?.message || 'Gagal membuat pesanan QRIS');
        setIsLoading(false);
        return;
      }

      setOrderData(data);
      setStep('qris');
    } catch (err) {
      setErrorMessage((err as Error).message || 'Terjadi kesalahan sistem');
    } finally {
      setIsLoading(false);
    }
  };

  // Simulate Instant Sandbox Payment
  const handleSimulatePayment = async () => {
    if (!orderData) return;
    setIsLoading(true);

    try {
      const { data, error } = await actions.simulatePayment({
        orderNumber: orderData.orderNumber,
      });

      if (error || !data) {
        setErrorMessage(error?.message || 'Simulasi pembayaran gagal');
        setIsLoading(false);
        return;
      }

      if (data.codes) {
        setLicenseCodes(data.codes);
        setStep('success');
      }
    } catch (err) {
      setErrorMessage((err as Error).message || 'Gagal simulasi pembayaran');
    } finally {
      setIsLoading(false);
    }
  };

  const copyCode = (code: string, idx: number) => {
    navigator.clipboard.writeText(code);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2500);
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Real-time QR Code resolution (server Data URL -> direct image URL -> client QRCode generator fallback)
  useEffect(() => {
    if (!orderData) {
      setRenderedQrUrl('');
      setIsQrLoading(false);
      return;
    }

    let isMounted = true;
    setIsQrLoading(true);

    const resolveQr = async () => {
      // 1. Direct base64 data URL from server (zero CORS, guaranteed instant rendering)
      if (orderData.qrCodeDataUrl) {
        if (isMounted) {
          setRenderedQrUrl(orderData.qrCodeDataUrl);
          setIsQrLoading(false);
        }
        return;
      }

      // 2. Direct QR image URL (e.g. Midtrans PNG via Tako)
      if (orderData.qrCodeImageUrl) {
        if (isMounted) {
          setRenderedQrUrl(orderData.qrCodeImageUrl);
          setIsQrLoading(false);
        }
        return;
      }

      // 3. Robust client-side generation using QRCode library from raw string or paymentUrl
      try {
        const textToEncode = orderData.qrCodeString || orderData.paymentUrl || orderData.orderNumber;
        const generated = await QRCode.toDataURL(textToEncode, {
          width: 320,
          margin: 1,
          errorCorrectionLevel: 'M',
          color: {
            dark: '#000000',
            light: '#ffffff',
          },
        });
        if (isMounted) {
          setRenderedQrUrl(generated);
          setIsQrLoading(false);
        }
      } catch (err) {
        console.error('Failed to generate client QR code:', err);
        if (isMounted) {
          setIsQrLoading(false);
        }
      }
    };

    resolveQr();

    return () => {
      isMounted = false;
    };
  }, [orderData]);

  const handleQrImgError = async () => {
    if (!orderData) return;
    try {
      const textToEncode = orderData.qrCodeString || orderData.paymentUrl || orderData.orderNumber;
      const fallback = await QRCode.toDataURL(textToEncode, {
        width: 320,
        margin: 1,
        errorCorrectionLevel: 'M',
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      });
      setRenderedQrUrl(fallback);
    } catch {}
  };

  const handleDownloadQr = () => {
    if (!renderedQrUrl || !orderData) return;
    const link = document.createElement('a');
    link.href = renderedQrUrl;
    link.download = `QRIS-${orderData.orderNumber}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const copyAmount = () => {
    if (!orderData) return;
    navigator.clipboard.writeText(orderData.amountIdr.toString());
    setCopiedAmount(true);
    setTimeout(() => setCopiedAmount(false), 2000);
  };

  const copyOrderNumber = () => {
    if (!orderData) return;
    navigator.clipboard.writeText(orderData.orderNumber);
    setCopiedOrderNumber(true);
    setTimeout(() => setCopiedOrderNumber(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-white dark:bg-[#1E1E1E] border border-[#E5E7EB] dark:border-[#374151] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E7EB] dark:border-[#374151] bg-[#F8F9FA]/60 dark:bg-[#1E1E1E]">
          <div className="flex items-center gap-3">
            <ServiceLogo 
              name={product.name} 
              category={product.category} 
              imageUrl={product.imageUrl} 
              className="w-10 h-10 rounded-xl shrink-0" 
            />
            <div>
              <span className="text-[10px] font-bold tracking-wider uppercase text-emerald-600 dark:text-emerald-400">
                {step === 'form' 
                  ? 'Pilih Jumlah & Bayar' 
                  : step === 'qris' 
                  ? 'Pembayaran QRIS' 
                  : step === 'failed_supplier'
                  ? 'Garansi Stok Kosong'
                  : 'Link Registrasi Siap'}
              </span>
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 leading-snug">
                {product.name}
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-4">
          {errorMessage && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* STEP 1: PILIH JUMLAH & DETAIL KATALOG */}
          {step === 'form' && (
            <form onSubmit={handleSubmitOrder} className="space-y-4">
              {/* Detail Katalog & Spesifikasi */}
              <div className="p-3.5 bg-zinc-50 dark:bg-zinc-800/40 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-2.5">
                <div className="flex items-center justify-between text-xs font-bold text-zinc-700 dark:text-zinc-300">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                    Spesifikasi Produk
                  </span>
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300">
                    {product.category}
                  </span>
                </div>

                <div className="space-y-1.5">
                  {features.slice(0, 4).map((f, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      <span className="leading-tight">{f}</span>
                    </div>
                  ))}
                  {features.length > 4 && (
                    <p className="text-[11px] text-zinc-400 italic pl-5.5">
                      +{features.length - 4} spesifikasi lainnya...
                    </p>
                  )}
                </div>

                {notes.length > 0 && (
                  <div className="mt-2 p-2 bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200/60 dark:border-amber-900/60 rounded-xl text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-1.5">
                    <Info className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                    <span>{notes[0]}</span>
                  </div>
                )}

                {priceNotice && (
                  <div className="mt-2.5 p-2.5 bg-blue-50/90 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800/70 rounded-xl text-[11px] text-blue-800 dark:text-blue-300 flex items-start gap-1.5 animate-in fade-in duration-200">
                    <Sparkles className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
                    <span>{priceNotice}</span>
                  </div>
                )}
              </div>

              {/* Quantity Picker & Total */}
              <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl border border-zinc-200 dark:border-zinc-800/80 space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-500">Harga Satuan</span>
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5 font-mono">
                    Rp {unitPrice.toLocaleString('id-ID')}
                    {isVerifyingPrice && (
                      <span className="text-[10px] text-zinc-400 font-sans">(cek tarif...)</span>
                    )}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <div>
                    <span className="font-semibold text-zinc-700 dark:text-zinc-300 block">Pilih Jumlah</span>
                    <span className={`text-[11px] font-medium ${(product.stock ?? 0) <= 5 ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-500 dark:text-zinc-400'}`}>
                      {(product.stock ?? 0) > 0 ? `Tersedia: ${product.stock} unit` : 'Stok habis'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      disabled={quantity <= 1 || (product.stock ?? 0) <= 0}
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      className="w-8 h-8 flex items-center justify-center rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 font-bold transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      -
                    </button>
                    <span className="w-8 text-center font-bold text-base text-zinc-900 dark:text-zinc-100 font-mono">
                      {quantity}
                    </span>
                    <button
                      type="button"
                      disabled={quantity >= Math.min(10, Math.max(1, product.stock ?? 1)) || (product.stock ?? 0) <= 0}
                      onClick={() => setQuantity(Math.min(Math.min(10, Math.max(1, product.stock ?? 1)), quantity + 1))}
                      className="w-8 h-8 flex items-center justify-center rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 font-bold transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="pt-3 border-t border-zinc-200 dark:border-zinc-700/60 flex justify-between items-center">
                  <div>
                    <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 block">Total Pembayaran</span>
                    <span className="text-[10px] text-zinc-400 font-mono">
                      ≈ {(product.basePriceUsdt * quantity).toFixed(2)} USDT
                    </span>
                  </div>
                  <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
                    Rp {totalAmount.toLocaleString('id-ID')}
                  </div>
                </div>
              </div>

              {/* Optional Archiving Accordion */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowOptionalFields(!showOptionalFields)}
                  className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 flex items-center gap-1 transition cursor-pointer py-1"
                >
                  <span>Kirim bukti ke WhatsApp / Email (Opsional)</span>
                  {showOptionalFields ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>

                {showOptionalFields && (
                  <div className="mt-2.5 p-3.5 bg-zinc-50 dark:bg-zinc-800/40 rounded-xl border border-zinc-200 dark:border-zinc-700 space-y-2.5 animate-in fade-in duration-150">
                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                        Email Penerima (Opsional)
                      </label>
                      <input
                        type="email"
                        placeholder="nama@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                        Nomor WhatsApp (Opsional)
                      </label>
                      <input
                        type="tel"
                        placeholder="08123456789"
                        value={whatsapp}
                        onChange={(e) => setWhatsapp(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Unavailable / Saldo notice */}
              {unavailableReason && !canPurchase && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{unavailableReason}</span>
                </div>
              )}

              {/* Submit CTA */}
              <button
                type="submit"
                disabled={isLoading || !canPurchase || (product.stock !== undefined && product.stock <= 0)}
                className="w-full py-3.5 px-4 bg-[#2563EB] hover:bg-blue-700 dark:bg-[#3B82F6] dark:hover:bg-blue-600 text-white font-bold rounded-xl text-sm transition flex items-center justify-center gap-2 shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Menyiapkan QRIS...</span>
                  </>
                ) : !canPurchase ? (
                  <span>{unavailableReason || 'Stok / Saldo Kuota Kosong'}</span>
                ) : (product.stock !== undefined && product.stock <= 0) ? (
                  <span>Stok Produk Habis</span>
                ) : (
                  <>
                    <span>Bayar — Rp {totalAmount.toLocaleString('id-ID')}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* STEP 2: QRIS PAYMENT */}
          {step === 'qris' && orderData && (
            <div className="text-center space-y-4">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/60 text-amber-700 dark:text-amber-400 text-xs font-medium">
                <Clock className="w-3.5 h-3.5" />
                <span>Batas Waktu: {formatTimer(timeRemaining)}</span>
              </div>

              {/* Authentic QRIS National Standard Card */}
              <div className="p-4 sm:p-5 bg-white border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-md inline-block text-zinc-900 max-w-[320px] w-full text-left">
                {/* Official QRIS Header */}
                <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-zinc-200">
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-black text-red-600 text-xl tracking-tighter leading-none">QRIS</span>
                    <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">
                      Pembayaran Digital
                    </span>
                  </div>
                  <div className="text-[11px] font-bold text-zinc-800 uppercase tracking-tight">
                    PIXEL STORE
                  </div>
                </div>

                {/* Scannable Real QR Code */}
                <div className="w-60 h-60 mx-auto bg-white rounded-xl flex flex-col items-center justify-center p-1 relative overflow-hidden border border-zinc-100">
                  {isQrLoading || !renderedQrUrl ? (
                    <div className="flex flex-col items-center justify-center gap-2 text-zinc-400 py-10">
                      <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
                      <span className="text-xs font-medium">Menyiapkan QR Code...</span>
                    </div>
                  ) : (
                    <img
                      src={renderedQrUrl}
                      alt={`QRIS ${orderData.orderNumber}`}
                      onError={handleQrImgError}
                      className="w-56 h-56 object-contain rounded-md select-none"
                    />
                  )}
                </div>

                {/* Official QRIS Footer */}
                <div className="mt-3 pt-2.5 border-t border-zinc-200 flex items-center justify-between text-[10px] text-zinc-500 font-mono">
                  <span>NMID: ID1020021123456</span>
                  <span className="font-semibold text-zinc-700">ASPI / BI</span>
                </div>
              </div>

              {/* Quick Actions: Download QR & Direct Payment Link */}
              <div className="flex items-center justify-center gap-2 pt-1 max-w-[320px] mx-auto">
                <button
                  type="button"
                  onClick={handleDownloadQr}
                  disabled={!renderedQrUrl || isQrLoading}
                  className="flex-1 py-2 px-3 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                  title="Unduh QR"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Unduh QR</span>
                </button>

                {orderData.paymentUrl && (
                  <a
                    href={orderData.paymentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-xs transition flex items-center justify-center gap-1.5 shadow-xs"
                    title="Buka halaman pembayaran"
                  >
                    <span>Buka Pembayaran</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>

              {/* Amount and Order ID */}
              <div className="space-y-1 pt-1">
                <div className="flex items-center justify-center gap-2">
                  <h4 className="text-2xl font-black text-zinc-900 dark:text-zinc-100 font-mono tracking-tight">
                    Rp {orderData.amountIdr.toLocaleString('id-ID')}
                  </h4>
                  <button
                    type="button"
                    onClick={copyAmount}
                    className="p-1.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition cursor-pointer"
                    title="Salin Nominal"
                  >
                    {copiedAmount ? (
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold font-sans">Tersalin!</span>
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                <div className="flex items-center justify-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-500 font-mono">
                  <span>ID: {orderData.orderNumber}</span>
                  <button
                    type="button"
                    onClick={copyOrderNumber}
                    className="p-1 hover:text-zinc-900 dark:hover:text-zinc-100 transition rounded cursor-pointer"
                    title="Salin ID Pesanan"
                  >
                    {copiedOrderNumber ? (
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                </div>
              </div>

              {/* Status Indicator */}
              <div className="flex items-center justify-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 pt-1">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />
                <span>Menunggu pembayaran...</span>
              </div>

              {/* Sandbox Quick Tester */}
              <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
                <button
                  type="button"
                  onClick={handleSimulatePayment}
                  disabled={isLoading}
                  className="w-full py-2 px-3 bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Simulasi Pembayaran Berhasil</span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: LINK REGISTRASI LANGSUNG TAMPIL */}
          {step === 'success' && (
            <div className="text-center space-y-5 animate-in zoom-in-95 duration-200">
              <div className="w-14 h-14 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  Pembayaran Berhasil
                </span>
                <h4 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mt-1">
                  Akses Produk Anda
                </h4>
              </div>

              {/* Credentials & License / Registration Links Cards per DESIGN.md Section 4.D */}
              <div className="space-y-3">
                {licenseCodes.map((code, idx) => {
                  const isUrl = code.startsWith('http://') || code.startsWith('https://');

                  return (
                    <div
                      key={idx}
                      className="p-4 bg-[#F8F9FA] dark:bg-[#1E1E1E] text-[#1A1D20] dark:text-[#F9FAFB] rounded-2xl border border-[#E5E7EB] dark:border-[#374151] space-y-3 shadow-sm text-left"
                    >
                      <div className="flex items-center justify-between text-[11px] text-[#6C757D] dark:text-[#9CA3AF] uppercase tracking-widest font-mono">
                        <span>{isUrl ? 'Tautan Aktivasi / Registrasi' : 'Credentials / Kode Lisensi'} {licenseCodes.length > 1 ? `#${idx + 1}` : ''}</span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold lowercase">siap digunakan</span>
                      </div>

                      {/* Display Code / Link with Credentials Box */}
                      <div className="p-3 bg-white dark:bg-black/60 rounded-xl border border-[#E5E7EB] dark:border-[#374151] font-mono text-xs text-[#1A1D20] dark:text-emerald-400 break-all select-all flex items-center justify-between gap-2">
                        <span className="truncate">{code}</span>
                      </div>

                      {/* Direct Action Buttons */}
                      <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
                        {isUrl && (
                          <a
                            href={code}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full sm:flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-2 shadow-xs"
                          >
                            <span>Buka Link Registrasi</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}

                        <button
                          type="button"
                          onClick={() => copyCode(code, idx)}
                          className={`w-full ${isUrl ? 'sm:w-auto' : 'w-full'} py-2.5 px-4 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                            copiedIndex === idx
                              ? 'bg-emerald-500 text-white'
                              : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
                          }`}
                        >
                          {copiedIndex === idx ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Link Tersalin!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>{isUrl ? 'Salin Link' : 'Salin Kode'}</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Simple Guide Note */}
              <div className="p-3 bg-zinc-50 dark:bg-zinc-800/40 rounded-xl text-left text-xs text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800">
                <p>Gunakan link registrasi atau kode lisensi di atas untuk mengaktifkan layanan pada situs resmi.</p>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-full py-3 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 font-semibold rounded-xl text-xs transition cursor-pointer"
              >
                Selesai
              </button>
            </div>
          )}

          {/* STEP 4: STOK KOSONG SAAT PEMBAYARAN TERKONFIRMASI (GARANSI 100%) */}
          {step === 'failed_supplier' && (
            <div className="text-center space-y-5 animate-in zoom-in-95 duration-200">
              <div className="w-14 h-14 bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 rounded-full flex items-center justify-center mx-auto">
                <AlertCircle className="w-8 h-8" />
              </div>

              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  Pembayaran Berhasil Diterima
                </span>
                <h4 className="text-xl font-extrabold text-zinc-900 dark:text-zinc-100 mt-1">
                  Stok Supplier Sedang Kosong
                </h4>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                  Pembayaran QRIS Anda sebesar <strong className="text-zinc-900 dark:text-white font-mono">Rp {orderData?.amountIdr?.toLocaleString('id-ID')}</strong> telah tercatat di sistem kami, namun kuota supplier habis tepat saat verifikasi pembayaran.
                </p>
              </div>

              <div className="p-4 bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-2xl text-left text-xs space-y-2 text-amber-900 dark:text-amber-200">
                <div className="font-bold flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
                  <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>Garansi 100% Hak Pesanan & Dana Terjamin</span>
                </div>
                <div className="text-[11px] leading-relaxed">
                  ID Pesanan Anda:{' '}
                  <strong className="font-mono text-zinc-900 dark:text-white bg-white dark:bg-zinc-800 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-700/80">
                    {orderData?.orderNumber}
                  </strong>
                </div>
                <p className="text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-300">
                  Jangan khawatir! Admin CS kami telah menerima notifikasi ini dan siap mengaktifkan lisensi secara manual atau mengembalikan dana (refund) 100% tanpa potongan.
                </p>
              </div>

              <div className="space-y-2 pt-1">
                <a
                  href={`https://wa.me/628123456789?text=${encodeURIComponent(
                    `Halo Admin Pixel Store, saya sudah bayar QRIS untuk pesanan ${orderData?.orderNumber} (Rp ${orderData?.amountIdr?.toLocaleString('id-ID')}), status sistem: stok supplier habis. Mohon bantuan aktivasi manual atau refund.`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-2 shadow-xs"
                >
                  <span>Hubungi CS WhatsApp untuk Bantuan / Refund ↗</span>
                </a>

                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-2.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-semibold rounded-xl text-xs transition cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
