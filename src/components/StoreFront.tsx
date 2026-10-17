'use client';

import React, { useState, useEffect } from "react";
import {
  Search,
  ArrowUpRight,
  Layers,
  ShieldCheck,
  Zap,
  Check,
  Info,
  User,
  Star,
  MessageCircle,
  AlertCircle,
  X,
  RefreshCw,
} from "lucide-react";
import { ServiceLogo } from "./ServiceLogo";
import { CheckoutModal, clearPendingOrderStorage, type PendingOrderSession } from "./CheckoutModal";
import { OrderLookupModal } from "./OrderLookupModal";
import {
  ProductDetailModal,
  parseCatalogDescription,
} from "./ProductDetailModal";
import { UserAccountModal, type AuthenticatedUser } from "./UserAccountModal";
import { ThemeToggle } from "./ThemeToggle";
import { StoreNavbar } from "./layout/StoreNavbar";
import { StoreFooter } from "./layout/StoreFooter";
import { actions } from "@/actions";

export interface ProductItem {
  id: number;
  name: string;
  category: string;
  description: string;
  retailPriceIdr: number;
  basePriceUsdt: number;
  stock?: number;
  inStock: boolean;
  minQuantity?: number;
  maxQuantity?: number;
  imageUrl?: string;
  isTopProduct?: boolean;
  customRetailPriceIdr?: number;
}

interface StoreFrontProps {
  initialProducts: ProductItem[];
  currentFxRate?: number;
  fxSource?: string;
  isPaymentEnabled?: boolean;
  paymentDisabledReason?: string;
}

// Helper to strip emoji noise from upstream names
function cleanProductName(rawName: string): string {
  return rawName
    .replace(
      /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu,
      "",
    )
    .trim();
}

export const StoreFront: React.FC<StoreFrontProps> = ({
  initialProducts,
  currentFxRate = 17879,
  fxSource = "Indodax",
  isPaymentEnabled = true,
  paymentDisabledReason,
}) => {
  const [products, setProducts] = useState<ProductItem[]>(initialProducts);
  const [isReloadingPrice, setIsReloadingPrice] = useState<boolean>(false);
  const [lastPriceReload, setLastPriceReload] = useState<string>('');
  const [reloadToast, setReloadToast] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("Semua");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(
    null,
  );
  const [selectedQuantity, setSelectedQuantity] = useState<number>(1);
  const [restoredPendingOrder, setRestoredPendingOrder] = useState<PendingOrderSession | null>(null);
  const [detailProduct, setDetailProduct] = useState<ProductItem | null>(null);
  const [isLookupOpen, setIsLookupOpen] = useState<boolean>(false);
  const [isUserModalOpen, setIsUserModalOpen] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(
    null,
  );
  const [pendingCheckout, setPendingCheckout] = useState<{
    product: ProductItem;
    quantity: number;
  } | null>(null);

  const handleInitiatePurchase = (product: ProductItem, quantity: number = 1) => {
    if (!currentUser) {
      setPendingCheckout({ product, quantity });
      setIsUserModalOpen(true);
      return;
    }
    setSelectedQuantity(quantity);
    setSelectedProduct(product);
  };

  const handleReloadPrices = async () => {
    if (isReloadingPrice) return;
    setIsReloadingPrice(true);
    setReloadToast(null);
    try {
      const res = await actions.reloadStoreCatalog();
      if (res?.data?.products) {
        setProducts(res.data.products);
        if (res.data.updatedAt) {
          setLastPriceReload(res.data.updatedAt);
        }
        setReloadToast('Harga dan kuota katalog berhasil diperbarui.');
        setTimeout(() => setReloadToast(null), 3500);
      } else if (res?.error) {
        setReloadToast('Gagal: ' + res.error.message);
        setTimeout(() => setReloadToast(null), 3500);
      }
    } catch (err) {
      setReloadToast('Gagal memperbarui harga terkini.');
      setTimeout(() => setReloadToast(null), 3500);
    } finally {
      setIsReloadingPrice(false);
    }
  };

  // Check customer session on mount
  useEffect(() => {
    actions
      .getCurrentUser()
      .then((res) => {
        if (res.data?.user) {
          setCurrentUser(res.data.user);
        }
      })
      .catch(() => {});
  }, []);

  // Listen to synchronized pending order storage purge events
  useEffect(() => {
    const handleStorageCleared = () => {
      setRestoredPendingOrder(null);
    };
    window.addEventListener('pixel_pending_order_cleared', handleStorageCleared);
    return () => {
      window.removeEventListener('pixel_pending_order_cleared', handleStorageCleared);
    };
  }, []);

  // Check and restore active pending order upon accidental page refresh
  useEffect(() => {
    try {
      const savedRaw = localStorage.getItem('pixel_pending_order');
      if (!savedRaw) return;
      const saved = JSON.parse(savedRaw);
      if (!saved?.orderNumber || !saved?.expiresAt) {
        clearPendingOrderStorage();
        return;
      }

      // Check if order has already expired
      const expiry = new Date(saved.expiresAt).getTime();
      if (!isNaN(expiry) && Date.now() >= expiry) {
        clearPendingOrderStorage();
        return;
      }

      // Verify order status on server
      actions.getOrderStatus({ orderNumber: saved.orderNumber }).then(({ data, error }) => {
        if (!error && data && data.status === 'PENDING_PAYMENT') {
          const matchingProduct = products.find((p) => p.id === (saved.productId || data.productId)) || saved.product;
          if (matchingProduct) {
            setSelectedProduct(matchingProduct);
            setSelectedQuantity(saved.quantity || data.quantity || 1);
            setRestoredPendingOrder({
              orderNumber: saved.orderNumber,
              amountIdr: saved.amountIdr,
              qrCodeString: saved.qrCodeString,
              paymentUrl: saved.paymentUrl,
              qrCodeImageUrl: saved.qrCodeImageUrl,
              qrCodeDataUrl: saved.qrCodeDataUrl,
              gatewayProvider: saved.gatewayProvider,
              expiresAt: saved.expiresAt,
            });
          }
        } else {
          // If already completed, canceled, or expired, clear local storage
          clearPendingOrderStorage();
        }
      }).catch(() => {});
    } catch (e) {
      console.warn('Failed restoring pending payment session:', e);
    }
  }, [products]);

  // Derive categories with Top Produk filter if any top product exists
  const hasTopProducts = products.some((p) => p.isTopProduct);
  const rawCategories = Array.from(new Set(products.map((p) => p.category)));
  const categories = [
    "Semua",
    ...(hasTopProducts ? ["⭐ Top Produk"] : []),
    ...rawCategories,
  ];

  const filteredProducts = products.filter((p) => {
    const matchesCategory =
      selectedCategory === "Semua"
        ? true
        : selectedCategory === "⭐ Top Produk"
        ? Boolean(p.isTopProduct)
        : p.category === selectedCategory;
    const cleanName = cleanProductName(p.name).toLowerCase();
    const cleanDesc = p.description.toLowerCase();
    const q = searchQuery.toLowerCase();
    return matchesCategory && (cleanName.includes(q) || cleanDesc.includes(q));
  });

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100 selection:bg-emerald-500 selection:text-white">
      {/* Top Minimalist Header */}
      <StoreNavbar activePage="home" />

      {/* Catalog Main View */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Payment Maintenance Alert Banner */}
        {isPaymentEnabled === false && (
          <div className="mb-6 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 flex items-start sm:items-center gap-3 text-xs shadow-xs animate-in fade-in duration-200">
            <AlertCircle className="w-5 h-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5 sm:mt-0" />
            <div className="flex-1 space-y-0.5">
              <span className="font-bold">Pemeliharaan Gateway Pembayaran: </span>
              <span className="leading-relaxed">
                {paymentDisabledReason ||
                  "Sistem pembayaran sedang dinonaktifkan sementara untuk pemeliharaan/migrasi gateway. Katalog tetap dapat dilihat."}
              </span>
            </div>
          </div>
        )}

        {/* Search Product Bar */}
        <div className="mb-6 space-y-3">
          <div className="relative w-full">
            <input
              type="text"
              placeholder="Cari nama produk atau langganan digital (contoh: Gemini, CapCut, Canva, VPN)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-10 py-3 rounded-2xl text-xs sm:text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10 focus:border-zinc-400 dark:focus:border-zinc-600 transition shadow-xs placeholder:text-zinc-400"
            />
            <Search className="w-4 h-4 text-zinc-400 absolute left-4 top-3.5" />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3.5 top-3 p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                title="Hapus pencarian"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Category Filter & Counter */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-0.5">
            <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 scrollbar-none">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition shrink-0 cursor-pointer ${
                    selectedCategory === cat
                      ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-xs"
                      : "bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2.5 shrink-0 ml-auto sm:ml-0">
              <div className="text-[11px] text-zinc-500 font-mono">
                {searchQuery ? (
                  <span>
                    Ditemukan <strong className="text-zinc-900 dark:text-white">{filteredProducts.length}</strong> produk
                  </span>
                ) : (
                  <span>
                    Total <strong className="text-zinc-900 dark:text-white">{filteredProducts.length}</strong> produk
                  </span>
                )}
              </div>

              {/* Action Button: Reload Price */}
              <button
                type="button"
                onClick={handleReloadPrices}
                disabled={isReloadingPrice}
                className="px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-semibold flex items-center gap-1.5 transition shadow-2xs cursor-pointer disabled:opacity-50"
                title="Muat ulang harga dan stok terbaru dari database"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${
                    isReloadingPrice ? "animate-spin text-emerald-500" : "text-zinc-400"
                  }`}
                />
                <span className="hidden sm:inline">
                  {isReloadingPrice ? "Memperbarui..." : "Reload Harga"}
                </span>
                <span className="sm:hidden">
                  {isReloadingPrice ? "..." : "Reload"}
                </span>
                {lastPriceReload && (
                  <span className="text-[10px] text-zinc-400 font-mono hidden md:inline">
                    • {lastPriceReload}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Product Grid */}
        {filteredProducts.length === 0 ? (
          <div className="text-center py-20 bg-white dark:bg-zinc-900/40 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-8 space-y-3">
            <Layers className="w-8 h-8 text-zinc-400 mx-auto" />
            <h4 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              Tidak ada produk yang sesuai
            </h4>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto">
              {searchQuery
                ? `Tidak ditemukan produk dengan kata kunci "${searchQuery}". Coba kata kunci lain atau reset pencarian.`
                : "Coba ganti kata kunci pencarian atau pilih kategori lain."}
            </p>
            {(searchQuery || selectedCategory !== "Semua") && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setSelectedCategory("Semua");
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                <span>Reset Pencarian</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {filteredProducts.map((item) => {
              const cleanTitle = cleanProductName(item.name);
              const { features } = parseCatalogDescription(item.description);

              const isTop = Boolean(item.isTopProduct);

              return (
                <div
                  key={item.id}
                  className={`group bg-white dark:bg-[#121215] border rounded-2xl p-5 hover:border-zinc-400 dark:hover:border-zinc-600 hover:shadow-md transition-all duration-200 flex flex-col justify-between ${
                    isTop
                      ? "border-amber-300/80 dark:border-amber-700/60 ring-1 ring-amber-400/20 shadow-xs"
                      : "border-zinc-200 dark:border-zinc-800/80"
                  }`}
                >
                  <div>
                    {/* Header: Service Logo + Category + Realtime Stock Badge */}
                    <div className="flex items-start justify-between gap-3 mb-3.5">
                      <ServiceLogo
                        name={item.name}
                        category={item.category}
                        imageUrl={item.imageUrl}
                        className="w-10 h-10"
                      />
                      <div className="flex flex-col items-end gap-1.5">
                        <div className="flex items-center gap-1.5">
                          {isTop && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/70 border border-amber-300 dark:border-amber-700/70 px-2 py-0.5 rounded-full shadow-2xs">
                              <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-500" />
                              Top
                            </span>
                          )}
                          <span className="text-[11px] font-medium text-zinc-500 bg-zinc-100 dark:bg-zinc-800/80 px-2 py-0.5 rounded-md">
                            {item.category}
                          </span>
                        </div>
                        {/* Realtime Stock Badge */}
                        {item.stock !== undefined && item.stock !== null ? (
                          item.stock > 10 ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/60 px-2 py-0.5 rounded-full font-mono">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                              Stok:{" "}
                              {item.stock >= 9999
                                ? "Melimpah"
                                : `${item.stock} unit`}
                            </span>
                          ) : item.stock > 0 ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800/60 px-2 py-0.5 rounded-full font-mono">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                              Sisa {item.stock} unit
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/60 px-2 py-0.5 rounded-full font-mono">
                              Stok Habis
                            </span>
                          )
                        ) : null}
                      </div>
                    </div>

                    {/* Title */}
                    <h3 className="font-bold text-base text-zinc-900 dark:text-zinc-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                      {cleanTitle}
                    </h3>

                    {/* Specifications highlight bullets */}
                    <div className="space-y-1.5 my-3 py-2 border-y border-zinc-100 dark:border-zinc-800/60">
                      {features.slice(0, 2).map((feat, fIdx) => (
                        <div
                          key={fIdx}
                          className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400"
                        >
                          <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          <span className="truncate">{feat}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Pricing & CTA */}
                  <div className="pt-3.5 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between gap-2">
                    <div>
                      <div className="text-base font-extrabold text-zinc-900 dark:text-white leading-tight font-mono">
                        Rp {item.retailPriceIdr.toLocaleString("id-ID")}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setDetailProduct(item)}
                        className="py-2 px-2.5 border border-zinc-200 dark:border-zinc-700/80 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl text-xs font-semibold transition flex items-center gap-1 shadow-2xs cursor-pointer"
                        title="Lihat Detail & Spesifikasi Katalog"
                      >
                        <Info className="w-3.5 h-3.5 text-zinc-400" />
                        <span>Detail</span>
                      </button>

                      {item.stock === 0 ? (
                        <button
                          type="button"
                          disabled
                          className="py-2 px-3.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600 rounded-xl text-xs font-semibold cursor-not-allowed"
                        >
                          <span>Habis</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleInitiatePurchase(item, 1)}
                          className="py-2 px-3.5 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 rounded-xl text-xs font-semibold transition flex items-center gap-1 shadow-xs group-hover:translate-x-0.5 cursor-pointer"
                        >
                          <span>Beli</span>
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Clean Footer */}
      <StoreFooter />

      {/* Customer Modals */}
      {selectedProduct && (
        <CheckoutModal
          product={selectedProduct}
          initialQuantity={selectedQuantity}
          initialPendingOrder={restoredPendingOrder}
          currentUser={currentUser}
          onRequireLogin={() => {
            if (selectedProduct) {
              setPendingCheckout({ product: selectedProduct, quantity: selectedQuantity });
              setSelectedProduct(null);
              setIsUserModalOpen(true);
            }
          }}
          onClose={() => {
            setSelectedProduct(null);
            setRestoredPendingOrder(null);
          }}
          isPaymentEnabled={isPaymentEnabled}
          paymentDisabledReason={paymentDisabledReason}
        />
      )}

      <ProductDetailModal
        product={detailProduct}
        isOpen={Boolean(detailProduct)}
        onClose={() => setDetailProduct(null)}
        onBuy={(prod, qty) => {
          setDetailProduct(null);
          handleInitiatePurchase(prod, qty || 1);
        }}
      />

      <OrderLookupModal
        isOpen={isLookupOpen}
        onClose={() => setIsLookupOpen(false)}
      />

      <UserAccountModal
        isOpen={isUserModalOpen}
        customNotice={
          pendingCheckout
            ? 'Masuk ke akun Anda untuk melanjutkan pembelian. Lisensi akan otomatis dikirimkan ke email Anda dan tersimpan aman di akun Anda jika popup pembayaran tertutup.'
            : undefined
        }
        onClose={() => {
          setIsUserModalOpen(false);
          setPendingCheckout(null);
        }}
        onUserChanged={(user) => {
          setCurrentUser(user);
          if (user && pendingCheckout) {
            setSelectedProduct(pendingCheckout.product);
            setSelectedQuantity(pendingCheckout.quantity);
            setPendingCheckout(null);
            setIsUserModalOpen(false);
          }
        }}
      />

      {/* Floating Action Button: Reload Price (Pojok Kanan Bawah) */}
      <div className="fixed bottom-6 right-6 z-30 animate-in fade-in slide-in-from-bottom-2 duration-200">
        <button
          type="button"
          onClick={handleReloadPrices}
          disabled={isReloadingPrice}
          className="group px-3.5 py-2 rounded-full border border-zinc-200/90 dark:border-zinc-800/90 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md hover:bg-white dark:hover:bg-zinc-850 text-zinc-800 dark:text-zinc-200 text-xs font-semibold flex items-center gap-2 shadow-lg shadow-zinc-950/5 dark:shadow-black/40 transition-all hover:scale-105 active:scale-95 cursor-pointer disabled:opacity-60"
          title="Klik untuk memuat ulang harga dan ketersediaan terbaru"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${
              isReloadingPrice
                ? "animate-spin text-emerald-500"
                : "text-zinc-500 group-hover:rotate-180 transition-transform duration-500"
            }`}
          />
          <span className="hidden sm:inline">
            {isReloadingPrice ? "Memperbarui Harga..." : "Reload Harga"}
          </span>
          <span className="sm:hidden">
            {isReloadingPrice ? "Update..." : "Reload"}
          </span>
          {lastPriceReload && (
            <span className="text-[10px] text-zinc-400 font-mono hidden lg:inline">
              ({lastPriceReload})
            </span>
          )}
        </button>
      </div>

      {/* Floating Toast Notification */}
      {reloadToast && (
        <div className="fixed top-20 right-6 z-50 animate-in fade-in slide-in-from-top-3 duration-200 pointer-events-none">
          <div className="px-4 py-2.5 rounded-full bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 text-xs font-semibold shadow-xl flex items-center gap-2 border border-zinc-700/50 dark:border-zinc-200/50">
            <Check className="w-3.5 h-3.5 text-emerald-400 dark:text-emerald-600" />
            <span>{reloadToast}</span>
          </div>
        </div>
      )}
    </div>
  );
};
