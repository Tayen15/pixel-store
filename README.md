# Pixel Store

**Pixel Store** adalah platform e-commerce reseller akun langganan premium dan lisensi digital dengan pengiriman otomatis instan berbasis **Astro (SSR)**, **Neon PostgreSQL**, dan pembayaran terintegrasi **QRIS**.

---

## ⚡ Tech Stack

* **Framework**: Astro 5 (SSR / Node Adapter)
* **Interactive Islands**: React 19 (Tailwind CSS v4)
* **Database & ORM**: Neon PostgreSQL (AWS Singapore `ap-southeast-1`) + Drizzle ORM (`postgres.js`)
* **Wholesale Supplier**: InsightXPro Wholesale API Client
* **Payment Gateway**: Tako.id QRIS Gateway
* **Realtime FX Engine**: Indodax Market Ticker with CoinGecko fallback
* **Customer Authentication**: Scrypt salt-hashed credentials & 30-day session cookies

---

## 🚀 Menjalankan Project Secara Lokal

```bash
# 1. Install dependensi
bun install

# 2. Sinkronisasi katalog awal ke PostgreSQL
bun run scripts/sync-catalog.ts

# 3. Jalankan server pengembangan
bun run dev
```

Kunjungi `http://localhost:4321` pada browser.
