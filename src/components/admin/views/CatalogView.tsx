import React, { useState } from 'react';
import {
  Search,
  RefreshCw,
  Layers,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Package,
  Star,
  Edit3,
  Tag,
  X,
} from 'lucide-react';
import { ServiceLogo } from '../../ServiceLogo';
import { actions } from 'astro:actions';

interface CatalogViewProps {
  products: any[];
  onProductsUpdated: () => void;
  showToast: (type: 'success' | 'error', text: string) => void;
}

export const CatalogView: React.FC<CatalogViewProps> = ({
  products,
  onProductsUpdated,
  showToast,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Semua');
  const [isSyncing, setIsSyncing] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [togglingTopId, setTogglingTopId] = useState<number | null>(null);

  // Price Editing State
  const [editingPriceProduct, setEditingPriceProduct] = useState<any | null>(null);
  const [newPriceValue, setNewPriceValue] = useState<string>('');
  const [isUpdatingPrice, setIsUpdatingPrice] = useState<boolean>(false);

  const topCount = products.filter((p) => Boolean(p.isTopProduct)).length;
  const rawCategories = Array.from(new Set(products.map((p) => p.category || 'General')));
  const categories = ['Semua', `⭐ Top Produk (${topCount})`, ...rawCategories];

  const filtered = products.filter((p) => {
    const isTopCategory = selectedCategory.startsWith('⭐ Top Produk');
    const matchesCat =
      selectedCategory === 'Semua'
        ? true
        : isTopCategory
        ? Boolean(p.isTopProduct)
        : p.category === selectedCategory;

    const q = searchQuery.toLowerCase().trim();
    const matchesQuery = !q || p.name.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q);
    return matchesCat && matchesQuery;
  });

  const handleToggleTopProduct = async (productId: number, currentTop: boolean) => {
    setTogglingTopId(productId);
    try {
      const nextTop = !currentTop;
      const { data, error } = await actions.adminToggleTopProduct({
        productId,
        isTopProduct: nextTop,
      });

      if (error || !data) {
        showToast('error', error?.message || 'Gagal mengubah status Top Product.');
        return;
      }

      showToast(
        'success',
        `Produk ${nextTop ? 'berhasil ditandai sebagai Top Product ⭐' : 'dihapus dari Top Product'}.`
      );
      onProductsUpdated();
    } catch (err) {
      showToast('error', (err as Error).message);
    } finally {
      setTogglingTopId(null);
    }
  };

  const handleToggleStatus = async (productId: number, currentActive: boolean) => {
    setTogglingId(productId);
    try {
      const nextActive = !currentActive;
      const { data, error } = await actions.adminToggleProductStatus({
        productId,
        isActive: nextActive,
      });

      if (error || !data) {
        showToast('error', error?.message || 'Gagal mengubah status produk.');
        return;
      }

      showToast('success', `Status produk berhasil diubah menjadi ${nextActive ? 'Aktif' : 'Nonaktif'}.`);
      onProductsUpdated();
    } catch (err) {
      showToast('error', (err as Error).message);
    } finally {
      setTogglingId(null);
    }
  };

  const handleSyncCatalog = async () => {
    setIsSyncing(true);
    try {
      const { data, error } = await actions.syncCatalogNow();
      if (error || !data) {
        showToast('error', error?.message || 'Gagal sinkronisasi katalog.');
        return;
      }
      showToast('success', `Berhasil menyinkronkan data ${data.count} produk dari supplier InsightXPro!`);
      onProductsUpdated();
    } catch (err) {
      showToast('error', (err as Error).message);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleOpenEditPrice = (p: any) => {
    setEditingPriceProduct(p);
    setNewPriceValue(String(p.retailPriceIdr || ''));
  };

  const handleSavePrice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPriceProduct) return;
    const priceNum = parseInt(newPriceValue.replace(/[^0-9]/g, ''), 10);
    if (isNaN(priceNum) || priceNum <= 0) {
      showToast('error', 'Masukkan nominal harga yang valid (lebih dari 0).');
      return;
    }

    setIsUpdatingPrice(true);
    try {
      const { data, error } = await actions.adminUpdateProductPrice({
        productId: editingPriceProduct.id,
        customPriceIdr: priceNum,
      });

      if (error || !data) {
        showToast('error', error?.message || 'Gagal memperbarui harga produk.');
        return;
      }

      showToast(
        'success',
        `Harga produk berhasil diubah menjadi Rp ${priceNum.toLocaleString('id-ID')}! Perubahan langsung aktif di etalase dan alur pembelian.`
      );
      setEditingPriceProduct(null);
      onProductsUpdated();
    } catch (err) {
      showToast('error', (err as Error).message);
    } finally {
      setIsUpdatingPrice(false);
    }
  };

  const handleResetPriceToAuto = async () => {
    if (!editingPriceProduct) return;
    setIsUpdatingPrice(true);
    try {
      const { data, error } = await actions.adminUpdateProductPrice({
        productId: editingPriceProduct.id,
        customPriceIdr: null,
      });

      if (error || !data) {
        showToast('error', error?.message || 'Gagal mereset harga.');
        return;
      }

      showToast(
        'success',
        `Harga produk dikembalikan ke perhitungan otomatis formula (Rp ${data.retailPriceIdr?.toLocaleString('id-ID')}).`
      );
      setEditingPriceProduct(null);
      onProductsUpdated();
    } catch (err) {
      showToast('error', (err as Error).message);
    } finally {
      setIsUpdatingPrice(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Filter & Sync Button Strip */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Category Filter */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-xs'
                  : 'bg-white dark:bg-[#141416] text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Search & Sync Actions */}
        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-64">
            <input
              type="text"
              placeholder="Cari produk katalog..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 rounded-xl text-xs bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition"
            />
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-2.5" />
          </div>

          <button
            onClick={handleSyncCatalog}
            disabled={isSyncing}
            className="px-3.5 py-2 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 hover:opacity-90 text-xs font-semibold transition flex items-center gap-1.5 shrink-0 cursor-pointer shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{isSyncing ? 'Sinkronisasi...' : 'Sinkron Supplier'}</span>
          </button>
        </div>
      </div>

      {/* Catalog Table */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141416] overflow-hidden shadow-xs">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-xs text-zinc-400 space-y-2">
            <Layers className="w-8 h-8 text-zinc-300 dark:text-zinc-700 mx-auto" />
            <p>Tidak ada produk yang cocok.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50/70 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 font-semibold">
                <tr>
                  <th className="py-3 px-4">Layanan</th>
                  <th className="py-3 px-4">Kategori</th>
                  <th className="py-3 px-4">Modal Supplier</th>
                  <th className="py-3 px-4">Harga Jual (IDR)</th>
                  <th className="py-3 px-4">Stok Realtime</th>
                  <th className="py-3 px-4 text-center">Top Produk</th>
                  <th className="py-3 px-4">Visibilitas</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                {filtered.map((p) => {
                  const stock = p.stock ?? 0;
                  const isActive = p.isActive !== false;
                  const isTop = Boolean(p.isTopProduct);
                  return (
                    <tr
                      key={p.id}
                      className={`hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30 transition ${
                        !isActive ? 'opacity-50' : ''
                      } ${isTop ? 'bg-amber-50/20 dark:bg-amber-950/10' : ''}`}
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0 overflow-hidden">
                            <ServiceLogo name={p.name} imageUrl={p.imageUrl} size="sm" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-zinc-900 dark:text-white truncate max-w-[180px]">
                                {p.name}
                              </span>
                              {isTop && (
                                <span className="px-1.5 py-0.2 rounded-md text-[9px] font-extrabold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-800 shrink-0">
                                  TOP ⭐
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-zinc-400">ID: {p.supplierProductId}</div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                          {p.category || 'General'}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 font-mono font-medium text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                        ${p.basePriceUsdt?.toFixed(2)} USDT
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-zinc-900 dark:text-white">
                            Rp {p.retailPriceIdr?.toLocaleString('id-ID')}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleOpenEditPrice(p)}
                            title="Ubah Harga Jual"
                            className="p-1 rounded-md text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {p.customRetailPriceIdr && p.customRetailPriceIdr > 0 ? (
                          <span className="inline-block text-[9px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 px-1.5 py-0.2 rounded mt-0.5">
                            Custom
                          </span>
                        ) : (
                          <span className="inline-block text-[9px] text-zinc-400">
                            Auto Formula
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            stock > 0
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                          }`}
                        >
                          {stock > 0 ? `${stock} unit siap` : 'Stok Kosong'}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleToggleTopProduct(p.id, isTop)}
                          disabled={togglingTopId === p.id}
                          title={isTop ? 'Hapus dari Top Produk' : 'Tandai sebagai Top Produk'}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-semibold transition cursor-pointer shadow-2xs border ${
                            isTop
                              ? 'bg-amber-100/80 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700 hover:bg-amber-200 dark:hover:bg-amber-900/60'
                              : 'bg-zinc-50 dark:bg-zinc-800/60 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:text-amber-600 hover:border-amber-300'
                          }`}
                        >
                          <Star
                            className={`w-3.5 h-3.5 ${
                              isTop
                                ? 'fill-amber-400 text-amber-500'
                                : 'text-zinc-400'
                            } ${togglingTopId === p.id ? 'animate-spin' : ''}`}
                          />
                          <span>{togglingTopId === p.id ? '...' : isTop ? 'Top' : 'Biasa'}</span>
                        </button>
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            isActive
                              ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40'
                              : 'text-zinc-500 bg-zinc-100 dark:bg-zinc-800'
                          }`}
                        >
                          {isActive ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                          <span>{isActive ? 'Tampil di Toko' : 'Disembunyikan'}</span>
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => handleToggleStatus(p.id, isActive)}
                          disabled={togglingId === p.id}
                          className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-semibold transition cursor-pointer shadow-2xs ${
                            isActive
                              ? 'border-zinc-200 dark:border-zinc-800 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 text-zinc-600 dark:text-zinc-400'
                              : 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100'
                          }`}
                        >
                          {togglingId === p.id
                            ? '...'
                            : isActive
                            ? 'Sembunyikan'
                            : 'Aktifkan'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Edit Harga Jual Produk */}
      {editingPriceProduct && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                  <Tag className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-sm text-zinc-900 dark:text-white truncate">
                    Ubah Harga Jual Produk
                  </h3>
                  <p className="text-[11px] text-zinc-500 truncate max-w-[240px]">
                    {editingPriceProduct.name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingPriceProduct(null)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-zinc-50 dark:bg-zinc-900/60 rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 space-y-1.5 text-xs">
              <div className="flex justify-between text-zinc-500">
                <span>Modal Supplier:</span>
                <span className="font-mono font-medium text-zinc-700 dark:text-zinc-300">
                  ${editingPriceProduct.basePriceUsdt?.toFixed(2)} USDT
                </span>
              </div>
              <div className="flex justify-between text-zinc-500">
                <span>Harga Saat Ini:</span>
                <span className="font-mono font-bold text-zinc-900 dark:text-white">
                  Rp {editingPriceProduct.retailPriceIdr?.toLocaleString('id-ID')}
                </span>
              </div>
              {editingPriceProduct.customRetailPriceIdr && (
                <div className="flex justify-between text-blue-600 dark:text-blue-400 font-semibold text-[10px]">
                  <span>Status:</span>
                  <span>Manual Custom Override</span>
                </div>
              )}
            </div>

            <form onSubmit={handleSavePrice} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Harga Jual Baru (IDR):
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-xs font-bold text-zinc-400">Rp</span>
                  <input
                    type="number"
                    min="1000"
                    step="500"
                    required
                    value={newPriceValue}
                    onChange={(e) => setNewPriceValue(e.target.value)}
                    placeholder="Contoh: 150000"
                    className="w-full pl-10 pr-4 py-2 text-xs font-mono font-bold rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181b] focus:outline-none focus:ring-2 focus:ring-blue-600 transition"
                  />
                </div>
                <p className="text-[10px] text-zinc-400 mt-1">
                  Harga yang Anda simpan di dashboard ini akan langsung aktif di etalase dan di alur pembayaran QRIS pembeli secara realtime.
                </p>
              </div>

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                {editingPriceProduct.customRetailPriceIdr ? (
                  <button
                    type="button"
                    onClick={handleResetPriceToAuto}
                    disabled={isUpdatingPrice}
                    className="px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 transition cursor-pointer"
                  >
                    Reset ke Auto Formula
                  </button>
                ) : <div />}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingPriceProduct(null)}
                    className="px-3.5 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={isUpdatingPrice}
                    className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                  >
                    {isUpdatingPrice ? 'Menyimpan...' : 'Simpan Harga'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
