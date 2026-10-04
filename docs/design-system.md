# Design System & UI/UX Specification - Sigma Store

## 1. Design Direction: Clean Minimalist Luxury Commerce

Sigma Store follows a **Clean Minimalist Luxury Commerce** aesthetic (inspired by the refined craftsmanship of Apple, Linear, and Stripe). The design emphasizes clarity, ultra-legible typography, balanced whitespace, and purposeful micro-interactions that elevate trust for high-value digital transactions.

### Core Principles
1. **Precision & Trust**: Zero clutter. Every element, label, and price tag communicates authenticity and reliability.
2. **Frictionless Experience**: From catalog browsing to QRIS payment to license reveal in under 3 clicks without mandatory account sign-up.
3. **Adaptive Dual-Theme**: Flawless visual hierarchy across both **Light Mode** (airy, crisp, editorial paper vibe) and **Dark Mode** (deep obsidian, high-contrast, premium tech vibe).
4. **Instant Gratification**: Visual celebration upon payment confirmation with smooth code-reveal animations.

---

## 2. Color Palette & Design Tokens

### 2.1 Neutral Foundation (Tailwind Zinc Palette)
- **Light Mode Canvas**: `#FAFAFA` (Zinc-50) with pure white `#FFFFFF` cards.
- **Dark Mode Canvas**: `#09090B` (Zinc-950) with `#121215` (Zinc-900) elevated cards.
- **Borders**: 
  - Light: `rgba(0, 0, 0, 0.08)` / `zinc-200`
  - Dark: `rgba(255, 255, 255, 0.08)` / `zinc-800`

### 2.2 Semantic & Brand Accents
- **Primary Action (Button/Brand)**:
  - Light Mode: `#09090B` (Deep Zinc-950) with White text.
  - Dark Mode: `#FFFFFF` (Pure White) with Zinc-950 text.
- **Success / Instant Delivery**:
  - `#10B981` (Emerald-500) & `#059669` (Emerald-600) — Indicates stock availability, paid status, and verified supplier health.
- **Attention / Expiry Countdown**:
  - `#F59E0B` (Amber-500) — QRIS payment countdown timer and expiring warnings.
- **Destructive / Error**:
  - `#EF4444` (Rose-500) — Payment timeout, out-of-stock warning.

---

## 3. Typography Hierarchy

Primary Font: **Plus Jakarta Sans** or **Inter** (via `next/font/google`).

| Element | Size & Weight | Line Height | Tracking | Usage |
| :--- | :--- | :--- | :--- | :--- |
| **Display 1** | `text-4xl sm:text-5xl font-extrabold` | `leading-[1.1]` | `-0.03em` | Hero Tagline & Main Value Proposition |
| **Heading 2** | `text-2xl sm:text-3xl font-bold` | `leading-snug` | `-0.02em` | Section Titles (Catalog, Order Status) |
| **Heading 3** | `text-lg sm:text-xl font-semibold` | `leading-normal` | `-0.01em` | Product Card Titles, Modal Headers |
| **Body Large** | `text-base font-normal` | `leading-relaxed` | `normal` | Hero Descriptions, Key Explanations |
| **Body Small** | `text-sm font-normal text-muted-foreground` | `leading-normal` | `normal` | Form helper text, product badges |
| **Monospace**| `font-mono text-sm tracking-wider font-semibold` | `leading-none` | `+0.05em` | License keys, Order IDs, QRIS codes |

---

## 4. Key Screen Layouts & User Flows

### 4.1 Header & Status Navigation
- **Left**: Minimalist Logo: **`SIGMA`** with small sub-badge **`STORE`**.
- **Center**: Quick Category Filter pills (All, Operating System, VPN, Productivity, Gaming).
- **Right**:
  - Live System Status Pill (`🟢 Automated Delivery Active`).
  - "Lacak Pesanan" (Order Tracking trigger).
  - Light/Dark theme toggle.

### 4.2 Product Card (Minimalist Luxury)
- **Top Badge**: Clean category tag + Instant Stock indicator (`Tersedia`).
- **Product Image / Icon**: Elegant minimalist icon or cover visual with subtle hover scale (`scale-[1.02]`).
- **Title & Description**: 2-line max with ellipsis.
- **Pricing Box**:
  - Prominent IDR price: `Rp 149.000`.
  - Subtle secondary indicator: `~ 8.90 USDT`.
- **Action**: "Beli Sekarang" button with smooth slide-in arrow icon on hover.

### 4.3 Checkout Drawer / Modal (Frictionless Guest Form)
- Summary of selected product, unit price, quantity multiplier, and total IDR.
- Form Fields:
  - **Email** (required, for invoice & digital license backup).
  - **Nomor WhatsApp** (required, with `+62` auto-formatter).
- **Transparency Breakdown**:
  - Harga Produk
  - Biaya Layanan QRIS: `Rp 0 (Gratis)`
  - Total Pembayaran: `Rp XXX.XXX`
- **Primary CTA**: "Lanjut ke Pembayaran QRIS" (initiates Server Action).

### 4.4 Dynamic QRIS Payment Modal
- **Dynamic QR Code**: High-contrast, sharp QRIS code centered with download QR button.
- **Countdown Timer**: 15:00 minutes countdown badge with ticking amber indicator.
- **Amount Confirmation**: Explicit numeric amount with single-click "Salin Nominal" button.
- **Status Polling Indicator**: Subtle pulse animation with text "Menunggu pembayaran via GoPay, BCA, OVO, Dana..."
- **Simulate / Sandbox Trigger**: (In development mode) allows 1-click test confirmation.

### 4.5 License Reveal & Order Completion Page
- **Celebration Header**: Confetti / micro-sparkle animation with green checkmark: "Pembayaran Dikonfirmasi!"
- **Order Metadata**: Order Number (e.g. `SIGMA-20261002-8821`), Timestamp, Customer Email.
- **License Box**:
  - Sleek dark border with glass effect.
  - License keys formatted in bold monospace with a large **"Salin Kode" (Copy Code)** button with feedback tooltip.
- **Redemption Guide**: Accordion with 3-step redemption instructions for the specific product.
- **Receipt & PDF Action**: "Unduh Bukti Transaksi" and "Kirim Ulang ke Email".

---

## 5. Micro-Interactions & Transitions

1. **Card Hover**: 1px subtle border glow and 2px lift (`transform transition duration-200 hover:-translate-y-0.5`).
2. **Copy Feedback**: Single-tap copy replaces icon with checkmark and displays a toast notification: *"Kode lisensi berhasil disalin!"*.
3. **Payment State Transition**: Seamless transition from QRIS code to License Key view using Framer Motion / CSS opacity & slide transitions without full page reload.
4. **Form Validation Feedback**: Real-time feedback with subtle red/green ring highlights on blur.
