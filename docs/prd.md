# Product Requirements Document (PRD) - Pixel Store

## 1. Executive Summary
**Pixel Store** is a specialized digital voucher, premium account, and license reseller web application. It acts as an automated, localized bridge between an upstream digital wholesale provider (**InsightXPro**) and local retail customers (primarily Indonesian market).

While the wholesale supplier operates strictly in **USDT** via a REST API, Pixel Store provides a seamless, friction-free local purchasing experience with **Indonesian Rupiah (IDR)** through local payment rails (such as **QRIS**, Virtual Accounts, and E-Wallets). The platform features an automated dynamic margin pricing engine, guest checkout, and instant product code/license delivery upon payment confirmation.

---

## 2. Problem Statement & Strategic Solution

### Problem
1. **Currency & Rail Friction**: The upstream provider only accepts cryptocurrency (USDT) via API wallet balance, which is inaccessible or inconvenient for standard retail customers in Indonesia.
2. **Manual Reselling Overhead**: Resellers manually take orders, check bank transfers, convert currencies, and call upstream APIs, leading to slow fulfillment and human error.
3. **Price Volatility & Margin Risk**: Fluctuations in USDT/IDR rates can erode profit margins if retail prices are static.

### Solution
1. **Automated Currency & Margin Engine**: Automatically calculates real-time IDR retail prices:
   $$\text{Final Price (IDR)} = (\text{Base Price (USDT)} \times \text{Exchange Rate}) \times (1 + \text{Margin \%}) + \text{Payment Fee Buffer}$$
2. **Instant QRIS & Local Payment Rails**: Customers can scan and pay within seconds using GoPay, OVO, Dana, BCA, Mandiri, or any Indonesian banking app.
3. **Automated Upstream Fulfillment**: As soon as payment gateway sends a verified webhook, the backend uses an **Idempotency Key** to call InsightXPro API `POST /api/v1/orders`, captures the license keys/vouchers, and instantly presents them on screen and sends via Email/WhatsApp.
4. **Pre-funded Pool Management**: Store Admin pre-funds the InsightXPro USDT wallet while collecting IDR revenue locally into bank/payment gateway accounts.

---

## 3. User Personas

### Persona A: Retail Buyer ("Rian")
- **Behavior**: Wants to buy a software license or game voucher quickly without registering an account.
- **Pain Points**: Doesn't hold crypto; hates multi-step signups and waiting hours for admin confirmation.
- **Needs**: Instant catalog browsing, clear IDR price, scan QRIS, receive working key on screen within 10 seconds.

### Persona B: Store Administrator ("Owner")
- **Behavior**: Manages the business, monitors exchange rates, keeps tabs on upstream USDT balance.
- **Pain Points**: Running out of USDT balance upstream without knowing; order double-billing bugs; manual price recalculations.
- **Needs**: Real-time supplier balance monitor, margin percentage controls, transaction audit log, and error alerts.

---

## 4. Key Features & Functional Requirements

### 4.1 Product Catalog & Synchronization
- **FR-1.1**: Fetch and synchronize active products from InsightXPro (`GET /api/v1/products`).
- **FR-1.2**: Cache catalog with TTL (Time-To-Live, e.g., 5–15 minutes) with on-demand manual refresh capability to respect the 60 req/min rate limit.
- **FR-1.3**: Filter and categorize products (e.g. Operating Systems, VPNs, Subscriptions, Antivirus).
- **FR-1.4**: Ability to augment upstream product items with custom rich banners, descriptions, and taglines.

### 4.2 Dynamic Pricing & Exchange Rate Engine
- **FR-2.1**: Automated retrieval of real-time USDT/IDR exchange rate (via reliable FX feed or configurable manual override).
- **FR-2.2**: Configurable global profit margin percentage (default e.g. 15%) and optional per-category or per-product margin override.
- **FR-2.3**: Rounding rules (e.g. round up to the nearest thousand IDR, such as Rp 149.000).

### 4.3 Seamless Checkout & Payment Rail
- **FR-3.1 Guest Checkout**: Only requires essential delivery data: Email address and WhatsApp number.
- **FR-3.2 Order Expiration**: QRIS invoices expire after a configured window (e.g., 15 minutes) with real-time countdown.
- **FR-3.3 Payment Gateway Integration**: Webhook receiver for payment updates (e.g., Midtrans / Xendit / Tripay / Pakasir) with cryptographic signature validation.

### 4.4 Automated Upstream Fulfillment
- **FR-4.1 Upstream Balance Check**: Pre-flight verification (`GET /api/v1/balance`) to ensure sufficient USDT before processing orders.
- **FR-4.2 Idempotent Order Dispatch**: Execute `POST /api/v1/orders` passing `Idempotency-Key` (UUIDv4 tied to store order ID) to prevent double charges.
- **FR-4.3 Instant Code Reveal**: Return retrieved product codes/keys on the thank-you screen with single-click copy and PDF/receipt download.
- **FR-4.4 Delivery Notification**: Dispatch code delivery via Email (Resend) and WhatsApp API.

### 4.5 Order Tracking & Support
- **FR-5.1 Order Lookup**: Customers can query previous orders via `Order Number + Email` without needing an account.
- **FR-5.2 Ledger & Dispute Log**: Complete status history of each order: `PENDING_PAYMENT` $\rightarrow$ `PAID` $\rightarrow$ `SUPPLIER_DISPATCHED` $\rightarrow$ `DELIVERED` or `FAILED_NEEDS_REFUND`.

### 4.6 Admin Operations & Safeguards
- **FR-6.1 Supplier Health & Balance Widget**: Live display of InsightXPro USDT wallet and recent ledger entries (`GET /api/v1/balance`).
- **FR-6.2 Low Balance Alert**: Warning notifications when USDT balance drops below a critical threshold (e.g. < $50 USDT).
- **FR-6.3 Failsafe Mechanisms**: If upstream order fails due to out-of-stock or rate limits, auto-flag order for manual operator review or automated customer refund.

---

## 5. Non-Functional Requirements (NFR)

| Metric | Target |
| :--- | :--- |
| **Performance (LCP)** | < 1.0 second on 4G mobile networks (Zero-JS HTML by default via Astro) |
| **Availability & Resources** | Ultra-lightweight memory footprint (~50-80 MB RAM), zero external DB dependencies |
| **API Throttling Safety** | Strictly stay under InsightXPro rate limits (60 req/min, 10 orders/min) via in-memory token bucket |
| **Idempotency** | 100% duplicate-proof webhook and order execution guarantee |
| **Security** | API keys and Webhook secrets never exposed to client; Strict Zod validation on all Astro Actions & Endpoints |
| **Theme / Design** | Clean Minimalist Luxury Light/Dark Mode (Modern Typography, Slate/Zinc neutral palette, micro-interactions) |
