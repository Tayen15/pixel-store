import React, { useState, useEffect } from 'react';
import { 
  X, 
  CheckCircle2, 
  AlertCircle, 
  ShieldCheck, 
  ArrowRight, 
  Sparkles, 
  Zap,
  Plus,
  Minus,
  Link,
  Package,
  Star,
} from 'lucide-react';
import { ServiceLogo } from './ServiceLogo';
import type { ProductItem } from './StoreFront';

interface ProductDetailModalProps {
  product: ProductItem | null;
  isOpen: boolean;
  onClose: () => void;
  onBuy: (product: ProductItem, quantity: number) => void;
}

export function parseCatalogDescription(rawDesc?: string) {
  if (!rawDesc) {
    return {
      features: ['Lisensi original resmi siap aktivasi otomatis.'],
      notes: [] as string[],
    };
  }

  const lines = rawDesc
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const features: string[] = [];
  const notes: string[] = [];
  let isNoteSection = false;

  for (const line of lines) {
    if (
      line.toLowerCase().includes('important note') ||
      line.toLowerCase().includes('catatan penting') ||
      line.toLowerCase().includes('note:') ||
      line.startsWith('📌')
    ) {
      isNoteSection = true;
      const cleanLine = line.replace(/^[📌:\s-]+/, '').trim();
      if (cleanLine) notes.push(cleanLine);
      continue;
    }

    if (isNoteSection) {
      notes.push(line);
    } else {
      features.push(line);
    }
  }

  return {
    features: features.length > 0 ? features : [rawDesc],
    notes,
  };
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  product,
  isOpen,
  onClose,
  onBuy,
}) => {
  if (!isOpen || !product) return null;

  const [quantity, setQuantity] = useState<number>(1);

  // Reset quantity to 1 when modal opens for a new product
  useEffect(() => {
    setQuantity(1);
  }, [product.id]);

  const { features, notes } = parseCatalogDescription(product.description);
  const stock = product.stock ?? 0;
  const isOutOfStock = stock <= 0;
  const maxAllowed = Math.min(product.maxQuantity || 5, stock > 0 ? stock : 1);

  const handleIncrement = () => {
    if (quantity < maxAllowed) {
      setQuantity((prev) => prev + 1);
    }
  };

  const handleDecrement = () => {
    if (quantity > 1) {
      setQuantity((prev) => prev - 1);
    }
  };

  const unitPrice = product.retailPriceIdr;
  const totalPrice = unitPrice * quantity;

  const handleProceedCheckout = () => {
    if (isOutOfStock) return;
    onClose();
    onBuy(product, quantity);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/60 dark:bg-zinc-900/40">
          <div className="flex items-center gap-3.5">
            <ServiceLogo 
              name={product.name} 
              category={product.category} 
              imageUrl={product.imageUrl} 
              className="w-12 h-12 rounded-xl shadow-xs" 
            />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-[#2563EB] dark:text-[#3B82F6]">
                  {product.category}
                </span>
                {product.isTopProduct && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/70 border border-amber-300 dark:border-amber-700/70 px-2 py-0.5 rounded-full shadow-2xs">
                    <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-500" />
                    Top Product
                  </span>
                )}
                <span className="text-[10px] text-zinc-400 font-mono">
                  ID: #{product.id}
                </span>
              </div>
              <h3 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-white mt-1 leading-snug">
                {product.name}
              </h3>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
            aria-label="Tutup Detail"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs">
          {/* Price & Stock Overview Banner */}
          <div className="p-4 bg-zinc-50 dark:bg-zinc-900/60 rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-zinc-500">Harga Satuan:</span>
                {isOutOfStock ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50">
                    Stok Habis
                  </span>
                ) : stock <= 5 ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50 font-mono">
                    Sisa {stock} unit
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50 font-mono">
                    Stok: {stock} unit siap
                  </span>
                )}
              </div>
              <div className="text-2xl font-black text-zinc-900 dark:text-white font-mono">
                Rp {unitPrice.toLocaleString('id-ID')}
              </div>
            </div>

            <div className="text-right">
              <span className="text-[10px] text-zinc-400 uppercase font-mono block">Tarif Wholesale:</span>
              <span className="text-xs font-mono font-semibold text-zinc-700 dark:text-zinc-300">
                ≈ {product.basePriceUsdt.toFixed(2)} USDT
              </span>
            </div>
          </div>

          {/* Quantity Selector Strip */}
          <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181b] flex items-center justify-between gap-4">
            <div>
              <div className="font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-zinc-500" />
                <span>Jumlah Pembelian (Quantity)</span>
              </div>
              <div className="text-[11px] text-zinc-400 mt-0.5">
                Maksimal {maxAllowed} unit per transaksi
              </div>
            </div>

            {/* Stepper Controls */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDecrement}
                disabled={quantity <= 1 || isOutOfStock}
                className="w-8 h-8 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 disabled:opacity-40 transition flex items-center justify-center text-zinc-800 dark:text-zinc-200 cursor-pointer"
                aria-label="Kurangi Jumlah"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>

              <span className="w-10 text-center font-mono font-bold text-sm text-zinc-900 dark:text-white">
                {quantity}
              </span>

              <button
                type="button"
                onClick={handleIncrement}
                disabled={quantity >= maxAllowed || isOutOfStock}
                className="w-8 h-8 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 disabled:opacity-40 transition flex items-center justify-center text-zinc-800 dark:text-zinc-200 cursor-pointer"
                aria-label="Tambah Jumlah"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Features / Specifications */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-white flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#2563EB] dark:text-[#3B82F6]" />
              <span>Detail & Spesifikasi Layanan</span>
            </h4>
            <div className="space-y-2 bg-zinc-50/70 dark:bg-zinc-900/30 rounded-2xl p-4 border border-zinc-200/80 dark:border-zinc-800/80">
              {features.map((feature, idx) => (
                <div key={idx} className="flex items-start gap-2.5 text-zinc-800 dark:text-zinc-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{feature}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Important Notes if Available */}
          {notes.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Petunjuk Aktivasi</span>
              </h4>
              <div className="bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/60 rounded-2xl p-3.5 space-y-1.5">
                {notes.map((note, idx) => (
                  <p key={idx} className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                    {note}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Guarantee info */}
          <div className="flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span>Garansi aktivasi 100% resmi</span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-6 border-t border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/60 dark:bg-[#141416] flex items-center justify-between gap-3">
          <div className="flex flex-col">
            <span className="text-[10px] text-zinc-400 uppercase font-semibold">Total Pembayaran:</span>
            <span className="font-mono text-base sm:text-lg font-black text-zinc-900 dark:text-white">
              Rp {totalPrice.toLocaleString('id-ID')}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-300 transition cursor-pointer"
            >
              Tutup
            </button>

            <button
              disabled={isOutOfStock}
              onClick={handleProceedCheckout}
              className={`py-2.5 px-4 font-bold rounded-xl text-xs transition flex items-center gap-2 shadow-xs cursor-pointer ${
                isOutOfStock
                  ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600 cursor-not-allowed'
                  : 'bg-[#2563EB] hover:bg-blue-700 dark:bg-[#3B82F6] dark:hover:bg-blue-600 text-white'
              }`}
            >
              <span>{isOutOfStock ? 'Stok Habis' : 'Beli Sekarang'}</span>
              {!isOutOfStock && <ArrowRight className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
