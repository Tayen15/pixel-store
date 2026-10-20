/**
 * Telegram Bot Client for Pixel Store Live Support
 * Bridges web customer chat with store administrator's Telegram
 */

import '@/lib/env';

export interface TelegramConfig {
  botToken: string;
  adminChatId: string;
  webhookSecret?: string;
}

// Fallback configuration ensuring Telegram notifications work in all environments
const DEFAULT_BOT_TOKEN = '8694168827:AAGP2ZwlCF92K1zQcVQdhWuN8w6sf49WVlc';
const DEFAULT_ADMIN_CHAT_ID = '1116767059';
const DEFAULT_WEBHOOK_SECRET = 'pixel_tele_sec_994821a8b3c4';

export function getTelegramConfig(): TelegramConfig | null {
  const botToken = process.env.TELEGRAM_BOT_TOKEN || DEFAULT_BOT_TOKEN;
  const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID || DEFAULT_ADMIN_CHAT_ID;

  if (!botToken || !adminChatId) {
    return null;
  }

  return {
    botToken,
    adminChatId,
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || DEFAULT_WEBHOOK_SECRET,
  };
}

/**
 * Escapes characters for Telegram MarkdownV2 or standard Markdown
 */
function cleanText(text: string): string {
  return text.replace(/[*_`\[\]()]/g, ' ');
}

/**
 * Sends a notification to administrator's Telegram when a buyer sends a support message
 */
export async function sendTelegramNotification(payload: {
  conversationId: string;
  buyerName: string;
  buyerEmail?: string | null;
  orderNumber?: string | null;
  message: string;
}): Promise<boolean> {
  const config = getTelegramConfig();
  if (!config) {
    console.warn('[Telegram] Skipping notification: TELEGRAM_BOT_TOKEN or TELEGRAM_ADMIN_CHAT_ID not configured.');
    return false;
  }

  const safeBuyerName = cleanText(payload.buyerName || 'Pelanggan');
  const safeEmail = payload.buyerEmail ? cleanText(payload.buyerEmail) : 'Tidak ada email';
  const safeOrder = payload.orderNumber ? `\`${payload.orderNumber}\`` : '-';
  const safeMessage = payload.message.trim();

  const text = [
    '💬 *PESAN BANTUAN DARI PELANGGAN*',
    '━━━━━━━━━━━━━━━━━━━━━',
    `👤 *Nama*: ${safeBuyerName}`,
    `📧 *Email*: ${safeEmail}`,
    `📦 *Pesanan*: ${safeOrder}`,
    '',
    '📝 *Pesan*:',
    `"${safeMessage}"`,
    '',
    '━━━━━━━━━━━━━━━━━━━━━',
    '👉 *Swipe / Balas (Reply) pesan ini untuk merespons pelanggan di web.*',
    `🆔 \`#${payload.conversationId}\``,
  ].join('\n');

  try {
    const res = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.adminChatId,
        text,
        parse_mode: 'Markdown',
      }),
    });

    const data = await res.json();
    if (!data.ok) {
      console.warn('[Telegram] Failed to send message with Markdown:', data.description);
      const fallbackRes = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: config.adminChatId,
          text: text.replace(/[*_`]/g, ''),
        }),
      });
      const fallbackData = await fallbackRes.json();
      return Boolean(fallbackData.ok);
    }

    return true;
  } catch (err) {
    console.error('[Telegram] Error sending notification:', err);
    return false;
  }
}

/**
 * Sends a direct message or reply back to a Telegram chat
 */
export async function sendTelegramMessage(
  chatId: string | number,
  text: string,
  replyToMessageId?: number
): Promise<boolean> {
  const config = getTelegramConfig();
  if (!config) return false;

  try {
    const res = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        reply_to_message_id: replyToMessageId,
        parse_mode: 'Markdown',
      }),
    });

    const data = await res.json();
    return Boolean(data.ok);
  } catch (err) {
    console.error('[Telegram] Error sending message:', err);
    return false;
  }
}

/**
 * Sends an instant purchase/order alert to administrator's Telegram
 */
export async function sendTelegramPurchaseNotification(payload: {
  orderNumber: string;
  productName: string;
  quantity: number;
  totalIdr: number;
  customerEmail?: string | null;
  customerWhatsapp?: string | null;
  paymentMethod?: string | null;
  licenseCodesCount?: number;
  isManual?: boolean;
}): Promise<boolean> {
  const config = getTelegramConfig();
  if (!config) {
    console.warn('[Telegram] Skipping purchase notification: TELEGRAM_BOT_TOKEN or TELEGRAM_ADMIN_CHAT_ID not configured.');
    return false;
  }

  const safeOrder = payload.orderNumber ? `\`${payload.orderNumber}\`` : '-';
  const safeProduct = cleanText(payload.productName || 'Lisensi Digital');
  const safeTotal = `Rp ${payload.totalIdr.toLocaleString('id-ID')}`;
  const safeEmail = payload.customerEmail ? cleanText(payload.customerEmail) : '-';
  const safeWa = payload.customerWhatsapp ? cleanText(payload.customerWhatsapp) : '-';
  const safeMethod = cleanText(payload.paymentMethod || 'QRIS SumoPod');
  const countText = payload.licenseCodesCount && payload.licenseCodesCount > 0
    ? `${payload.licenseCodesCount} Kode Lisensi (Terkirim Otomatis ✅)`
    : (payload.isManual ? 'Manual Entry' : 'Diproses Sistem');

  const title = payload.isManual
    ? '⚡ *TRANSAKSI MANUAL DIBUAT / LUNAS*'
    : '💰 *PEMBELIAN BERHASIL (LUNAS!)*';

  const text = [
    title,
    '━━━━━━━━━━━━━━━━━━━━━',
    `📦 *Pesanan*: ${safeOrder}`,
    `🛍️ *Produk*: ${safeProduct} (x${payload.quantity})`,
    `💵 *Total Bayar*: *${safeTotal}*`,
    `💳 *Metode*: ${safeMethod}`,
    `📧 *Email*: ${safeEmail}`,
    `📱 *WhatsApp*: ${safeWa}`,
    `🔑 *Status Lisensi*: ${countText}`,
    '',
    `🕒 *Waktu*: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`,
    '━━━━━━━━━━━━━━━━━━━━━',
    '🎉 _Pixel Store Instant Notification System_',
  ].join('\n');

  try {
    const res = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.adminChatId,
        text,
        parse_mode: 'Markdown',
      }),
    });

    const data = await res.json();
    if (!data.ok) {
      console.warn('[Telegram] Failed to send purchase notification with Markdown:', data.description);
      // Auto-fallback: retry without Markdown parse_mode to guarantee delivery
      const fallbackRes = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: config.adminChatId,
          text: text.replace(/[*_`]/g, ''),
        }),
      });
      const fallbackData = await fallbackRes.json();
      return Boolean(fallbackData.ok);
    }
    return true;
  } catch (err) {
    console.error('[Telegram] Error sending purchase notification:', err);
    return false;
  }
}

/**
 * Sends an urgent alert when upstream supplier runs out of stock after payment is verified
 */
export async function sendTelegramSupplierAlert(payload: {
  orderNumber: string;
  productName: string;
  errorMessage: string;
  customerEmail?: string | null;
}): Promise<boolean> {
  const config = getTelegramConfig();
  if (!config) return false;

  const text = [
    '🚨 *PERHATIAN: FULFILLMENT SUPPLIER GAGAL*',
    '━━━━━━━━━━━━━━━━━━━━━',
    `📦 *Pesanan*: \`${payload.orderNumber}\``,
    `🛍️ *Produk*: ${cleanText(payload.productName)}`,
    `📧 *Email*: ${cleanText(payload.customerEmail || '-')}`,
    `⚠️ *Keterangan*: ${cleanText(payload.errorMessage)}`,
    '',
    '👉 Pembayaran sudah diverifikasi, namun stok supplier kosong/habis.',
    'Silakan cek saldo InsightXPro atau lakukan top-up/refund manual.',
  ].join('\n');

  try {
    const res = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.adminChatId,
        text,
        parse_mode: 'Markdown',
      }),
    });
    const data = await res.json();
    return Boolean(data.ok);
  } catch (err) {
    console.error('[Telegram] Error sending supplier alert:', err);
    return false;
  }
}

/**
 * Register or update webhook URL with Telegram Bot API
 */
export async function setTelegramWebhook(webhookUrl: string, secretToken?: string): Promise<{ ok: boolean; description?: string }> {
  const config = getTelegramConfig();
  if (!config) {
    return { ok: false, description: 'Telegram credentials missing in environment' };
  }

  try {
    const body: Record<string, any> = {
      url: webhookUrl,
      allowed_updates: ['message'],
    };

    if (secretToken) {
      body.secret_token = secretToken;
    }

    const res = await fetch(`https://api.telegram.org/bot${config.botToken}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    return { ok: Boolean(data.ok), description: data.description };
  } catch (err) {
    return { ok: false, description: (err as Error).message };
  }
}
