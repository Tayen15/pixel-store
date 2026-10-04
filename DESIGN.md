# DESIGN.md - Pixel Store UI/UX Specification

## 1. Project Overview
**Pixel Store** adalah platform *Digital Store* berbasis sistem *reseller* (API Fetching) yang berfokus pada penjualan akun langganan premium (Premium Accounts). Desain antarmuka difokuskan pada kecepatan, transparansi harga, dan pembentukan rasa percaya (*trust*) yang tinggi.

## 2. Typography
*   **Primary Font:** `Plus Jakarta Sans`
*   **Usage:** Seluruh elemen teks (Heading, Body, Button, Label).
*   **Weights:** 
    *   Regular (400) untuk teks paragraf/deskripsi.
    *   Medium (500) untuk label UI dan durasi paket.
    *   Bold (700) untuk *Heading*, Nama Platform, dan Harga.

## 3. Color System (Dual Theme)
Sistem warna menggunakan pendekatan variabel (CSS Variables) untuk mendukung *toggling* antara Light dan Dark mode.

### Light Mode (Clean & Trustworthy)
*   **Background (Main):** `#F8F9FA` (Abu-abu sangat terang)
*   **Background (Card/Container):** `#FFFFFF` (Putih bersih)
*   **Text (Primary):** `#1A1D20` (Hitam solid)
*   **Text (Secondary):** `#6C757D` (Abu-abu netral untuk deskripsi)
*   **Accent/CTA:** `#2563EB` (Biru elektrik - profesional dan aman)
*   **Border/Divider:** `#E5E7EB` 

### Dark Mode (Sleek & Tech-Savvy)
*   **Background (Main):** `#121212` (Onyx/Arang gelap)
*   **Background (Card/Container):** `#1E1E1E` (Abu-abu gelap untuk elevasi)
*   **Text (Primary):** `#F9FAFB` (Putih terang)
*   **Text (Secondary):** `#9CA3AF` (Abu-abu terang)
*   **Accent/CTA:** `#3B82F6` (Biru elektrik yang sedikit lebih terang agar kontras)
*   **Border/Divider:** `#374151` 

## 4. Core UI Components

### A. Product Card (Katalog)
*   **Visual:** Menampilkan logo platform secara sentral (tanpa *background* yang ramai).
*   **Style:** Sudut membulat (*border-radius: 12px*). Pada Light mode, gunakan *drop-shadow* yang sangat halus. Pada Dark mode, gunakan *border* tipis berwarna `#374151`.
*   **Info:** Nama layanan (misal: Netflix), label harga "Mulai dari", dan *Trust Badge* kecil (contoh: "Instan ⚡").
*   *Catatan Operasional:* Sesuai instruksi, tata letak dan komponen grid katalog produk (list page) saat ini dipertahankan tanpa perubahan.

### B. Variant Selectors (Halaman Detail)
*   *Tidak menggunakan Dropdown.*
*   Menggunakan sistem **Pills/Chips Toggle** yang bisa diklik.
*   **Tipe Akun:** `[ Sharing ]` | `[ Private ]`
*   **Durasi:** `[ 1 Bulan ]` | `[ 3 Bulan ]` | `[ 1 Tahun ]`
*   *State:* *Active pill* menggunakan warna *background* aksen (Biru `#2563EB` / `#3B82F6`) dengan teks putih. *Inactive pill* menggunakan *outline* biasa.

### C. Checkout & Payment UI
*   Form input hanya meminta data yang esensial (seperti Email pengiriman/Nomor WhatsApp).
*   **Payment Methods:** Menampilkan logo metode pembayaran yang familier dengan rapi (seperti GoPay, QRIS, Doku, Jago, SeaBank).
*   **Layout:** *Sticky summary* di bagian bawah (layar mobile) atau di sebelah kanan (layar desktop) dengan CTA "Bayar Sekarang" menggunakan aksen warna biru elektrik.

### D. Invoice & Credential Reveal
*   Setelah status pembayaran dari API merespons `SUCCESS`, halaman memunculkan kotak *Credentials* (Email & Password akun / Kode Lisensi / Tautan Aktivasi).
*   **Fitur Ekstra:** Tombol "Copy to Clipboard" di sebelah setiap kredensial dengan umpan balik visual instan.
*   Jika API *supplier* merespons lambat/gangguan, tampilkan *banner* status agar pembeli mengetahui bahwa transaksi sedang diverifikasi dan diproses secara aman.
