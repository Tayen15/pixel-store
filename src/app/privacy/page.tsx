import React from 'react';
import { StoreNavbar } from '@/components/layout/StoreNavbar';
import { StoreFooter } from '@/components/layout/StoreFooter';
import { ShieldCheck, ArrowLeft } from 'lucide-react';

export const metadata = {
  title: 'Kebijakan Privasi - Pixel Store',
  description: 'Kebijakan privasi dan perlindungan data pengguna Pixel Store.',
};

export default function PrivacyPage() {
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
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 mb-3">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Perlindungan Data</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
              Kebijakan Privasi (Privacy Policy)
            </h1>
            <p className="text-xs text-zinc-500 mt-1">
              Terakhir diperbarui: 12 Oktober 2026
            </p>
          </div>

          <div className="prose dark:prose-invert text-xs leading-relaxed space-y-5 text-zinc-600 dark:text-zinc-300">
            <section className="space-y-2">
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white">1. Informasi yang Kami Kumpulkan</h2>
              <p>
                Pixel Store hanya mengumpulkan informasi yang diperlukan untuk memproses pesanan dan autentikasi akun Anda:
              </p>
              <ul className="list-disc list-inside space-y-1 pl-2">
                <li><strong>Informasi Akun:</strong> Nama lengkap dan alamat email yang Anda berikan melalui pendaftaran langsung atau login Google OAuth.</li>
                <li><strong>Informasi Transaksi:</strong> Riwayat pembelian produk digital, nomor WhatsApp (opsional untuk notifikasi transaksi), dan status pembayaran.</li>
                <li><strong>Data Autentikasi:</strong> Token sesi terenkripsi yang disimpan secara aman di browser untuk menjaga sesi login Anda.</li>
              </ul>
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white">2. Penggunaan Informasi</h2>
              <p>
                Informasi yang dikumpulkan digunakan semata-mata untuk:
              </p>
              <ul className="list-disc list-inside space-y-1 pl-2">
                <li>Mengirimkan kode lisensi, tautan aktivasi, dan struk pembayaran pesanan digital.</li>
                <li>Mengautentikasi akses Anda ke Dashboard Pelanggan dan riwayat lisensi.</li>
                <li>Menyediakan layanan bantuan pelanggan melalui live chat interaktif.</li>
              </ul>
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white">3. Layanan Pihak Ketiga & Google OAuth</h2>
              <p>
                Ketika Anda menggunakan opsi <em>Login dengan Google</em>, kami hanya meminta akses ke profil dasar (nama, email, dan foto profil publik) via protokol OAuth 2.0. Kami tidak pernah meminta kata sandi akun Google Anda dan tidak membagikan data pribadi Anda kepada pihak ketiga manapun untuk tujuan pemasaran.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white">4. Keamanan Data</h2>
              <p>
                Semua transmisi data di Pixel Store dienkripsi menggunakan standar industri Transport Layer Security (HTTPS/SSL). Sesi autentikasi diamankan menggunakan HTTP-Only cookies untuk mencegah akses skrip berbahaya (XSS).
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white">5. Kontak Kami</h2>
              <p>
                Jika Anda memiliki pertanyaan tentang kebijakan privasi ini atau ingin mengajukan penghapusan akun, silakan hubungi tim kami di <strong>hi@oktaa.my.id</strong> atau melalui Live Chat Bantuan di web kami.
              </p>
            </section>
          </div>
        </div>
      </main>

      <StoreFooter />
    </div>
  );
}
