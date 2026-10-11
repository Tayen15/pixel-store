import React from 'react';
import { StoreNavbar } from '@/components/layout/StoreNavbar';
import { StoreFooter } from '@/components/layout/StoreFooter';
import { FileText, ArrowLeft } from 'lucide-react';

export const metadata = {
  title: 'Syarat dan Ketentuan - Pixel Store',
  description: 'Syarat dan ketentuan layanan transaksi produk digital di Pixel Store.',
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100 flex flex-col font-sans transition-colors duration-200">
      <StoreNavbar />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-10 space-y-8">
        <a
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Kembali ke Beranda</span>
        </a>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 sm:p-10 shadow-xs space-y-6">
          <div className="border-b border-zinc-100 dark:border-zinc-800 pb-5">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 mb-3">
              <FileText className="w-3.5 h-3.5" />
              <span>Ketentuan Layanan</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
              Syarat dan Ketentuan (Terms of Service)
            </h1>
            <p className="text-xs text-zinc-500 mt-1">
              Terakhir diperbarui: 12 Oktober 2026
            </p>
          </div>

          <div className="prose dark:prose-invert text-xs leading-relaxed space-y-5 text-zinc-600 dark:text-zinc-300">
            <section className="space-y-2">
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white">1. Penerimaan Ketentuan</h2>
              <p>
                Dengan mengakses website Pixel Store dan melakukan pembelian produk digital melalui platform kami, Anda menyetujui untuk terikat oleh Syarat dan Ketentuan ini.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white">2. Produk Digital & Pengiriman Instan</h2>
              <p>
                Seluruh produk yang dijual di Pixel Store merupakan barang digital (lisensi software, akun langganan resmi, atau voucher aktivasi). Pengiriman lisensi dilakukan secara otomatis dan instan segera setelah pembayaran QRIS terkonfirmasi oleh sistem kami.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white">3. Pembayaran & Harga</h2>
              <p>
                Harga yang tercantum adalah harga final dalam mata uang Rupiah (IDR). Pembayaran diproses secara aman melalui payment gateway resmi menggunakan standar QRIS nasional. Tagihan pembayaran memiliki batas waktu kedaluwarsa 15 menit.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white">4. Kebijakan Garansi & Pengembalian Dana</h2>
              <p>
                Kami menyediakan garansi penggantian atau pengembalian dana 100% jika kode lisensi yang diterima tidak berfungsi dan terbukti bermasalah saat aktivasi pertama kali, dengan menghubungi tim bantuan kami dalam waktu 1x24 jam sejak pesanan selesai.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white">5. Layanan Bantuan</h2>
              <p>
                Untuk klaim garansi, pertanyaan pesanan, atau bantuan aktivasi, Anda dapat menghubungi tim kami langsung melalui fitur Live Chat Bantuan di website atau email <strong>hi@oktaa.my.id</strong>.
              </p>
            </section>
          </div>
        </div>
      </main>

      <StoreFooter />
    </div>
  );
}
