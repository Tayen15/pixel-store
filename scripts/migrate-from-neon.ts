import postgres from 'postgres';
import '../src/lib/env';

/**
 * Script migrasi data historis dari Neon PostgreSQL ke Heroku PostgreSQL.
 * Dijalankan ketika kuota Neon sudah reset di awal bulan.
 * 
 * Sifat: Idempotent (ON CONFLICT DO NOTHING), aman dijalankan tanpa
 * menimpa atau merusak transaksi baru yang sudah ada di Heroku.
 */

const NEON_URL = process.env.OLD_NEON_DATABASE_URL;
const HEROKU_URL = process.env.DATABASE_URL!;

async function runMigration() {
  console.log('=== MEMULAI SINKRONISASI DATA NEON -> HEROKU ===\n');

  if (!HEROKU_URL) {
    console.error('Error: DATABASE_URL (Heroku) tidak ditemukan di .env.');
    process.exit(1);
  }

  if (!NEON_URL) {
    console.error('Error: OLD_NEON_DATABASE_URL tidak ditemukan di .env.');
    console.log('Tambahkan OLD_NEON_DATABASE_URL ke file .env sebelum menjalankan migrasi.');
    process.exit(1);
  }

  const neon = postgres(NEON_URL, { ssl: 'require', connect_timeout: 10 });
  const heroku = postgres(HEROKU_URL, { ssl: { rejectUnauthorized: false }, connect_timeout: 10 });

  try {
    // 1. Tes koneksi Neon
    console.log('[1/5] Memeriksa status database Neon...');
    try {
      await neon`SELECT 1`;
      console.log('✓ Database Neon aktif dan dapat diakses.');
    } catch (err: any) {
      console.error('✗ Database Neon masih terkunci:', err.message);
      console.log('\nTips: Jalankan kembali skrip ini setelah Neon mereset kuota di awal bulan.');
      return;
    }

    // 2. Migrasi Users (Pelanggan & Admin lama)
    console.log('\n[2/5] Memeriksa tabel `users`...');
    try {
      const oldUsers = await neon`SELECT * FROM users`;
      console.log(`Ditemukan ${oldUsers.length} pengguna di Neon.`);
      for (const u of oldUsers) {
        await heroku`
          INSERT INTO users (id, email, password_hash, name, phone, role, created_at, updated_at)
          VALUES (${u.id}, ${u.email}, ${u.password_hash}, ${u.name}, ${u.phone}, ${u.role}, ${u.created_at}, ${u.updated_at})
          ON CONFLICT (id) DO NOTHING
        `;
      }
      console.log('✓ Tabel `users` berhasil disinkronkan.');
    } catch (e: any) {
      console.warn('Lewati users:', e.message);
    }

    // 3. Migrasi Orders & Payments (Histori Transaksi)
    console.log('\n[3/5] Memeriksa tabel `orders` & `payments`...');
    try {
      const oldOrders = await neon`SELECT * FROM orders`;
      console.log(`Ditemukan ${oldOrders.length} pesanan di Neon.`);
      for (const o of oldOrders) {
        await heroku`
          INSERT INTO orders (
            id, order_number, user_id, customer_email, customer_whatsapp,
            product_id, product_name, quantity, base_price_usdt, exchange_rate_idr,
            margin_percent, total_amount_idr, status, idempotency_key, supplier_order_id,
            license_codes, failure_reason, created_at, updated_at
          ) VALUES (
            ${o.id}, ${o.order_number}, ${o.user_id}, ${o.customer_email}, ${o.customer_whatsapp},
            ${o.product_id}, ${o.product_name}, ${o.quantity}, ${o.base_price_usdt}, ${o.exchange_rate_idr},
            ${o.margin_percent}, ${o.total_amount_idr}, ${o.status}, ${o.idempotency_key}, ${o.supplier_order_id},
            ${o.license_codes}, ${o.failure_reason}, ${o.created_at}, ${o.updated_at}
          )
          ON CONFLICT (id) DO NOTHING
        `;
      }
      console.log('✓ Tabel `orders` berhasil disinkronkan.');
    } catch (e: any) {
      console.warn('Lewati orders:', e.message);
    }

    try {
      const oldPayments = await neon`SELECT * FROM payments`;
      console.log(`Ditemukan ${oldPayments.length} riwayat pembayaran di Neon.`);
      for (const p of oldPayments) {
        await heroku`
          INSERT INTO payments (
            id, order_id, gateway, invoice_id, qris_string, amount_idr,
            status, raw_response, expires_at, paid_at, created_at, updated_at
          ) VALUES (
            ${p.id}, ${p.order_id}, ${p.gateway}, ${p.invoice_id}, ${p.qris_string}, ${p.amount_idr},
            ${p.status}, ${p.raw_response}, ${p.expires_at}, ${p.paid_at}, ${p.created_at}, ${p.updated_at}
          )
          ON CONFLICT (id) DO NOTHING
        `;
      }
      console.log('✓ Tabel `payments` berhasil disinkronkan.');
    } catch (e: any) {
      console.warn('Lewati payments:', e.message);
    }

    // 4. Migrasi Store Expenses (Buku Kas & Biaya)
    console.log('\n[4/5] Memeriksa tabel `store_expenses`...');
    try {
      const oldExpenses = await neon`SELECT * FROM store_expenses`;
      console.log(`Ditemukan ${oldExpenses.length} catatan pengeluaran di Neon.`);
      for (const ex of oldExpenses) {
        await heroku`
          INSERT INTO store_expenses (
            id, expense_date, category, description, amount_usdt, amount_idr,
            exchange_rate, notes, created_by, created_at, updated_at
          ) VALUES (
            ${ex.id}, ${ex.expense_date}, ${ex.category}, ${ex.description}, ${ex.amount_usdt}, ${ex.amount_idr},
            ${ex.exchange_rate}, ${ex.notes}, ${ex.created_by}, ${ex.created_at}, ${ex.updated_at}
          )
          ON CONFLICT (id) DO NOTHING
        `;
      }
      console.log('✓ Tabel `store_expenses` berhasil disinkronkan.');
    } catch (e: any) {
      console.warn('Lewati store_expenses:', e.message);
    }

    // 5. Migrasi Support Conversations & Messages
    console.log('\n[5/5] Memeriksa tabel `support_conversations` & `support_messages`...');
    try {
      const oldConvs = await neon`SELECT * FROM support_conversations`;
      for (const c of oldConvs) {
        await heroku`
          INSERT INTO support_conversations (
            id, user_id, guest_identifier, customer_name, customer_email,
            status, last_message_at, created_at, updated_at
          ) VALUES (
            ${c.id}, ${c.user_id}, ${c.guest_identifier}, ${c.customer_name}, ${c.customer_email},
            ${c.status}, ${c.last_message_at}, ${c.created_at}, ${c.updated_at}
          )
          ON CONFLICT (id) DO NOTHING
        `;
      }

      const oldMsgs = await neon`SELECT * FROM support_messages`;
      for (const m of oldMsgs) {
        await heroku`
          INSERT INTO support_messages (
            id, conversation_id, sender_role, message, metadata, created_at
          ) VALUES (
            ${m.id}, ${m.conversation_id}, ${m.sender_role}, ${m.message}, ${m.metadata}, ${m.created_at}
          )
          ON CONFLICT (id) DO NOTHING
        `;
      }
      console.log('✓ Tabel chat bantuan berhasil disinkronkan.');
    } catch (e: any) {
      console.warn('Lewati support chat:', e.message);
    }

    console.log('\n=== MIGRASI SELESAI DENGAN SUKSES ===');
  } finally {
    await neon.end();
    await heroku.end();
    process.exit(0);
  }
}

runMigration().catch((err) => {
  console.error('Fatal error saat migrasi:', err);
  process.exit(1);
});

