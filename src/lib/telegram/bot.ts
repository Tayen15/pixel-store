/**
 * Telegram Bot Client for Pixel Store Live Support
 * Bridges web customer chat with store administrator's Telegram
 */

export interface TelegramConfig {
  botToken: string;
  adminChatId: string;
  webhookSecret?: string;
}

export function getTelegramConfig(): TelegramConfig | null {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;

  if (!botToken || !adminChatId) {
    return null;
  }

  return {
    botToken,
    adminChatId,
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET,
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
      console.warn('[Telegram] Failed to send message:', data.description);
      return false;
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
