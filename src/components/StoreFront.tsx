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
} from "lucide-react";
import { ServiceLogo } from "./ServiceLogo";
import { CheckoutModal } from "./CheckoutModal";
import { OrderLookupModal } from "./OrderLookupModal";
import {
  ProductDetailModal,
  parseCatalogDescription,
} from "./ProductDetailModal";
import { UserAccountModal, type AuthenticatedUser } from "./UserAccountModal";
import { ThemeToggle } from "./ThemeToggle";
import { StoreNavbar } from "./layout/StoreNavbar";
import { StoreFooter } from "./layout/StoreFooter";
import { actions } from "astro:actions";

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
}) => {
  const [products] = useState<ProductItem[]>(initialProducts);
  const [selectedCategory, setSelectedCategory] = useState<string>("Semua");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(
    null,
  );
  const [selectedQuantity, setSelectedQuantity] = useState<number>(1);
  const [detailProduct, setDetailProduct] = useState<ProductItem | null>(null);
  const [isLookupOpen, setIsLookupOpen] = useState<boolean>(false);
  const [isUserModalOpen, setIsUserModalOpen] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(
    null,
  );

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
        {/* Category Filter & Search */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3.5 mb-7">
          <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 scrollbar-none">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition shrink-0 ${
                  selectedCategory === cat
                    ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-xs"
                    : "bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <input
              type="text"
              placeholder="Cari layanan..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 rounded-xl text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition"
            />
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-2.5" />
          </div>
        </div>

        {/* Product Grid */}
        {filteredProducts.length === 0 ? (
          <div className="text-center py-20 bg-white dark:bg-zinc-900/40 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-8 space-y-2">
            <Layers className="w-8 h-8 text-zinc-400 mx-auto" />
            <h4 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              Tidak ada produk yang sesuai
            </h4>
            <p className="text-xs text-zinc-500">
              Coba ganti kata kunci pencarian atau pilih kategori lain.
            </p>
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
                      <span className="text-[10px] text-zinc-400 font-mono">
                        ≈ {item.basePriceUsdt.toFixed(2)} USDT
                      </span>
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
                          onClick={() => {
                            setSelectedQuantity(1);
                            setSelectedProduct(item);
                          }}
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
          onClose={() => setSelectedProduct(null)}
        />
      )}

      <ProductDetailModal
        product={detailProduct}
        isOpen={Boolean(detailProduct)}
        onClose={() => setDetailProduct(null)}
        onBuy={(prod, qty) => {
          setDetailProduct(null);
          setSelectedQuantity(qty || 1);
          setSelectedProduct(prod);
        }}
      />

      <OrderLookupModal
        isOpen={isLookupOpen}
        onClose={() => setIsLookupOpen(false)}
      />

      <UserAccountModal
        isOpen={isUserModalOpen}
        onClose={() => setIsUserModalOpen(false)}
        onUserChanged={setCurrentUser}
      />
    </div>
  );
};
