import postgres from 'postgres';
import '../src/lib/env';

/**
 * Script migrasi cerdas dan non-destruktif dari Neon PostgreSQL ke Heroku PostgreSQL.
 *
 * Menjamin:
 * 1. Data yang ada di Heroku TIDAK hilang (users baru, orders baru, chats baru tetap utuh).
 * 2. User conflict handled: jika email sudah terdaftar di Heroku (misal akun Google),
 *    ID-nya dipetakan ke ID Heroku sehingga order lama terhubung ke akun yang benar.
 * 3. Products cache mapped: produk yang hanya ada di Neon otomatis disalin ke Heroku
 *    agar foreign key orders.product_id tidak pernah error.
 * 4. Nama kolom disesuaikan 100% dengan skema aktual PostgreSQL (payments, store_expenses, support).
 * 5. Aman dijalankan berulang kali (Idempotent - ON CONFLICT DO NOTHING).
 */

const NEON_URL = process.env.OLD_NEON_DATABASE_URL;
const HEROKU_URL = process.env.DATABASE_URL!;

async function runMigration() {
  console.log('=== MEMULAI SINKRONISASI DATA NEON -> HEROKU (NON-DESTRUCTIVE) ===\n');

  if (!HEROKU_URL) {
    console.error('Error: DATABASE_URL (Heroku) tidak ditemukan di .env.');
    process.exit(1);
  }

  if (!NEON_URL) {
    console.error('Error: OLD_NEON_DATABASE_URL tidak ditemukan di .env.');
    console.log('Tambahkan OLD_NEON_DATABASE_URL ke file .env sebelum menjalankan migrasi.');
    process.exit(1);
  }

  const neon = postgres(NEON_URL, { ssl: 'require', connect_timeout: 15 });
  const heroku = postgres(HEROKU_URL, { ssl: { rejectUnauthorized: false }, connect_timeout: 15 });

  try {
    // 1. Tes koneksi Neon
    console.log('[1/7] Memeriksa status database Neon...');
    try {
      await neon`SELECT 1`;
      console.log('✓ Database Neon aktif dan dapat diakses.');
    } catch (err: any) {
      console.error('✗ Database Neon tidak dapat diakses:', err.message);
      return;
    }

    // 2. Sinkronisasi Users (Pelanggan & Admin)
    console.log('\n[2/7] Memproses tabel `users`...');
    const neonUsers = await neon`SELECT * FROM users`;
    const herokuUsers = await heroku`SELECT * FROM users`;
    const userMap = new Map<string, string>(); // neonUserId -> herokuUserId

    let usersAdded = 0;
    let usersUpdated = 0;

    for (const nu of neonUsers) {
      const existingInHeroku = herokuUsers.find(
        (hu) => hu.email.toLowerCase() === nu.email.toLowerCase()
      );

      if (existingInHeroku) {
        userMap.set(nu.id, existingInHeroku.id);
        // Jika akun Neon adalah admin dan Heroku belum, sinkronkan role admin
        if (nu.role === 'admin' && existingInHeroku.role !== 'admin') {
          await heroku`UPDATE users SET role = 'admin' WHERE id = ${existingInHeroku.id}`;
          usersUpdated++;
        }
        console.log(`  -> User '${nu.email}' sudah ada di Heroku (ID dipetakan ke ${existingInHeroku.id}).`);
      } else {
        await heroku`
          INSERT INTO users (id, email, password_hash, name, phone, role, created_at, updated_at)
          VALUES (
            ${nu.id},
            ${nu.email},
            ${nu.password_hash},
            ${nu.name},
            ${nu.phone ?? null},
            ${nu.role ?? 'customer'},
            ${nu.created_at ?? new Date().toISOString()},
            ${nu.updated_at ?? new Date().toISOString()}
          )
          ON CONFLICT (email) DO NOTHING
        `;
        userMap.set(nu.id, nu.id);
        usersAdded++;
        console.log(`  -> User '${nu.email}' berhasil ditambahkan ke Heroku.`);
      }
    }
    console.log(`✓ Selesai memproses users (+${usersAdded} user baru, ${usersUpdated} role disesuaikan).`);

    // 3. Sinkronisasi Products Cache (untuk menjaga integritas Foreign Key orders)
    console.log('\n[3/7] Memproses katalog produk `products_cache`...');
    const neonProducts = await neon`SELECT * FROM products_cache`;
    let herokuProducts = await heroku`SELECT * FROM products_cache`;
    let productsCopied = 0;

    for (const np of neonProducts) {
      const exists = herokuProducts.find((hp) => hp.supplier_product_id === np.supplier_product_id);
      if (!exists) {
        await heroku`
          INSERT INTO products_cache (
            supplier_product_id, name, category, description, base_price_usdt,
            retail_price_idr, custom_retail_price_idr, stock, in_stock, min_quantity,
            max_quantity, image_url, is_active, is_top_product, last_synced_at
          ) VALUES (
            ${np.supplier_product_id},
            ${np.name},
            ${np.category ?? 'Digital'},
            ${np.description ?? ''},
            ${np.base_price_usdt},
            ${np.retail_price_idr},
            ${np.custom_retail_price_idr ?? null},
            ${np.stock ?? 0},
            ${np.in_stock ?? false},
            ${np.min_quantity ?? 1},
            ${np.max_quantity ?? 5},
            ${np.image_url ?? null},
            ${np.is_active ?? false},
            ${np.is_top_product ?? false},
            ${np.last_synced_at ?? new Date().toISOString()}
          )
          ON CONFLICT (supplier_product_id) DO NOTHING
        `;
        productsCopied++;
      }
    }

    // Refresh daftar produk Heroku setelah penambahan
    herokuProducts = await heroku`SELECT * FROM products_cache`;
    const productMap = new Map<number, number>(); // neonProductId -> herokuProductId

    for (const np of neonProducts) {
      const match = herokuProducts.find((hp) => hp.supplier_product_id === np.supplier_product_id);
      if (match) {
        productMap.set(np.id, match.id);
      } else {
        // Fallback pencocokan nama jika supplier_product_id berbeda
        const nameMatch = herokuProducts.find(
          (hp) => hp.name.trim().toLowerCase() === np.name.trim().toLowerCase()
        );
        if (nameMatch) {
          productMap.set(np.id, nameMatch.id);
        }
      }
    }
    console.log(`✓ Selesai sinkronisasi produk (+${productsCopied} produk lama disalin, ${productMap.size} produk dipetakan).`);

    // 4. Sinkronisasi Orders & Payments
    console.log('\n[4/7] Memproses tabel `orders` & `payments`...');
    const oldOrders = await neon`SELECT * FROM orders`;
    let ordersAdded = 0;

    for (const o of oldOrders) {
      // Petakan product_id ke ID produk yang ada di Heroku
      const mappedProductId = productMap.get(o.product_id) || herokuProducts[0]?.id;
      // Petakan user_id jika ada
      const mappedUserId = o.user_id ? (userMap.get(o.user_id) ?? null) : null;

      await heroku`
        INSERT INTO orders (
          id, order_number, user_id, customer_email, customer_whatsapp,
          product_id, product_name, quantity, base_price_usdt, exchange_rate_idr,
          margin_percent, total_amount_idr, status, idempotency_key, supplier_order_id,
          license_codes, failure_reason, created_at, updated_at
        ) VALUES (
          ${o.id},
          ${o.order_number},
          ${mappedUserId},
          ${o.customer_email},
          ${o.customer_whatsapp},
          ${mappedProductId},
          ${o.product_name},
          ${o.quantity ?? 1},
          ${o.base_price_usdt},
          ${o.exchange_rate_idr},
          ${o.margin_percent},
          ${o.total_amount_idr},
          ${o.status ?? 'PENDING_PAYMENT'},
          ${o.idempotency_key},
          ${o.supplier_order_id ?? null},
          ${o.license_codes ?? null},
          ${o.failure_reason ?? null},
          ${o.created_at ?? new Date().toISOString()},
          ${o.updated_at ?? new Date().toISOString()}
        )
        ON CONFLICT (id) DO NOTHING
      `;
      ordersAdded++;
    }
    console.log(`✓ Selesai memproses pesanan (${ordersAdded} pesanan diproses).`);

    const oldPayments = await neon`SELECT * FROM payments`;
    let paymentsAdded = 0;

    for (const p of oldPayments) {
      await heroku`
        INSERT INTO payments (
          id, order_id, gateway_provider, gateway_reference, payment_method,
          qr_code_string, payment_url, amount_idr, status, expires_at,
          paid_at, raw_webhook_payload, created_at
        ) VALUES (
          ${p.id},
          ${p.order_id},
          ${p.gateway_provider ?? 'sumopod'},
          ${p.gateway_reference ?? p.id},
          ${p.payment_method ?? 'QRIS'},
          ${p.qr_code_string ?? null},
          ${p.payment_url ?? null},
          ${p.amount_idr},
          ${p.status ?? 'UNPAID'},
          ${p.expires_at ?? new Date().toISOString()},
          ${p.paid_at ?? null},
          ${p.raw_webhook_payload ?? null},
          ${p.created_at ?? new Date().toISOString()}
        )
        ON CONFLICT (id) DO NOTHING
      `;
      paymentsAdded++;
    }
    console.log(`✓ Selesai memproses pembayaran (${paymentsAdded} pembayaran diproses).`);

    // 5. Sinkronisasi Store Expenses (Buku Kas & Pengeluaran)
    console.log('\n[5/7] Memproses tabel `store_expenses`...');
    const oldExpenses = await neon`SELECT * FROM store_expenses`;
    let expensesAdded = 0;

    for (const ex of oldExpenses) {
      await heroku`
        INSERT INTO store_expenses (
          id, expense_date, category, title, amount_idr, amount_usdt, notes, created_at, updated_at
        ) VALUES (
          ${ex.id},
          ${ex.expense_date},
          ${ex.category},
          ${ex.title ?? ex.description ?? 'Pengeluaran Toko'},
          ${ex.amount_idr},
          ${ex.amount_usdt ?? null},
          ${ex.notes ?? null},
          ${ex.created_at ?? new Date().toISOString()},
          ${ex.updated_at ?? new Date().toISOString()}
        )
        ON CONFLICT (id) DO NOTHING
      `;
      expensesAdded++;
    }
    console.log(`✓ Selesai memproses buku kas pengeluaran (${expensesAdded} catatan diproses).`);

    // 6. Sinkronisasi Support Conversations & Messages
    console.log('\n[6/7] Memproses obrolan bantuan `support_conversations` & `support_messages`...');
    const oldConvs = await neon`SELECT * FROM support_conversations`;
    let convsAdded = 0;

    for (const c of oldConvs) {
      const mappedUserId = c.user_id ? (userMap.get(c.user_id) ?? null) : null;

      await heroku`
        INSERT INTO support_conversations (
          id, user_id, buyer_session_id, buyer_name, buyer_email,
          order_number, status, last_message_text, last_message_sender,
          unread_by_admin, unread_by_buyer, last_message_at, created_at, updated_at
        ) VALUES (
          ${c.id},
          ${mappedUserId},
          ${c.buyer_session_id},
          ${c.buyer_name ?? 'Pelanggan'},
          ${c.buyer_email ?? null},
          ${c.order_number ?? null},
          ${c.status ?? 'OPEN'},
          ${c.last_message_text ?? null},
          ${c.last_message_sender ?? null},
          ${c.unread_by_admin ?? 0},
          ${c.unread_by_buyer ?? 0},
          ${c.last_message_at ?? new Date().toISOString()},
          ${c.created_at ?? new Date().toISOString()},
          ${c.updated_at ?? new Date().toISOString()}
        )
        ON CONFLICT (id) DO NOTHING
      `;
      convsAdded++;
    }

    const oldMsgs = await neon`SELECT * FROM support_messages`;
    let msgsAdded = 0;

    for (const m of oldMsgs) {
      await heroku`
        INSERT INTO support_messages (
          id, conversation_id, sender_type, sender_name, message, is_read, created_at
        ) VALUES (
          ${m.id},
          ${m.conversation_id},
          ${m.sender_type ?? 'BUYER'},
          ${m.sender_name ?? 'Pelanggan'},
          ${m.message},
          ${m.is_read ?? false},
          ${m.created_at ?? new Date().toISOString()}
        )
        ON CONFLICT (id) DO NOTHING
      `;
      msgsAdded++;
    }
    console.log(`✓ Selesai memproses obrolan (+${convsAdded} percakapan, +${msgsAdded} pesan).`);

    // 7. Sinkronisasi App Settings (tanpa menimpa setting aktif Heroku)
    console.log('\n[7/7] Memeriksa `app_settings`...');
    const oldSettings = await neon`SELECT * FROM app_settings`;
    for (const s of oldSettings) {
      await heroku`
        INSERT INTO app_settings (key, value, description, updated_at)
        VALUES (${s.key}, ${s.value}, ${s.description ?? null}, ${s.updated_at ?? new Date().toISOString()})
        ON CONFLICT (key) DO NOTHING
      `;
    }
    console.log('✓ Selesai memeriksa app settings.');

    console.log('\n======================================================');
    console.log('🎉 SINKRONISASI DATA LENGKAP SELESAI DENGAN SUKSES! 🎉');
    console.log('======================================================');

  } catch (err: any) {
    console.error('Error saat proses migrasi:', err);
  } finally {
    await neon.end();
    await heroku.end();
  }
}

runMigration().catch((err) => {
  console.error('Fatal error saat migrasi:', err);
  process.exit(1);
});
