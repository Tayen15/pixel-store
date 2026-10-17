import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db, schema } from '@/db';
import { eq } from 'drizzle-orm';
import { getTelegramConfig, sendTelegramMessage } from '@/lib/telegram/bot';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const config = getTelegramConfig();
    if (!config) {
      return NextResponse.json({ error: 'Telegram not configured' }, { status: 500 });
    }

    // 1. Verify Secret Token (if configured)
    if (config.webhookSecret) {
      const incomingSecret = req.headers.get('x-telegram-bot-api-secret-token');
      if (incomingSecret !== config.webhookSecret) {
        return NextResponse.json({ error: 'Unauthorized secret token' }, { status: 401 });
      }
    }

    const update = await req.json();
    const message = update?.message;

    if (!message || !message.text) {
      return NextResponse.json({ ok: true });
    }

    const chatId = message.chat.id.toString();
    const fromId = message.from?.id?.toString();
    const text = message.text.trim();

    // 2. Only allow authorized admin to interact
    if (chatId !== config.adminChatId && fromId !== config.adminChatId) {
      await sendTelegramMessage(chatId, '⛔ *Akses Ditolak*\nHanya akun admin terdaftar yang dapat membalas pesan dukungan Pixel Store.');
      return NextResponse.json({ ok: true });
    }

    // 3. Command: /start
    if (text.startsWith('/start')) {
      const welcome = [
        '👋 *Halo Admin Pixel Store!*',
        '',
        'Bot Customer Service Telegram telah berhasil terhubung ke sistem Pixel Store.',
        '',
        '✅ *Notifikasi Masuk*: Setiap kali pelanggan mengirim pesan di web `/support`, notifikasi akan otomatis muncul di sini.',
        '✅ *Membalas Langsung*: Cukup *Swipe / Balas (Reply)* pesan pelanggan untuk mengirim jawaban langsung ke layar web pembeli.',
        '',
        'Ketik /help untuk melihat opsi lainnya.',
      ].join('\n');

      await sendTelegramMessage(chatId, welcome);
      return NextResponse.json({ ok: true });
    }

    // 4. Command: /help
    if (text.startsWith('/help')) {
      const help = [
        '📌 *Panduan Penggunaan Bot CS Telegram:*',
        '',
        '1️⃣ *Cara Termudah (Reply)*:',
        'Geser (Swipe) atau klik *Balas (Reply)* pada pesan notifikasi pelanggan yang masuk, lalu ketik jawaban Anda.',
        '',
        '2️⃣ *Balas Manual*:',
        '`/reply <ID_Percakapan> <Pesan>`',
        'Contoh: `/reply conv_17291700_abc Halo kak, sudah kami proses ya`',
        '',
        '3️⃣ *Tutup Percakapan*:',
        '`/close <ID_Percakapan>`',
        'Contoh: `/close conv_17291700_abc`',
      ].join('\n');

      await sendTelegramMessage(chatId, help);
      return NextResponse.json({ ok: true });
    }

    let targetConvId: string | null = null;
    let replyContent: string | null = null;

    // 5. Handle: Reply to an existing bot message
    if (message.reply_to_message?.text) {
      const replyToText = message.reply_to_message.text;
      const match = replyToText.match(/(?:#)?(conv_[a-zA-Z0-9_-]+)/i);
      if (match) {
        targetConvId = match[1];
        replyContent = text;
      }
    }

    // 6. Handle: Manual /reply command
    if (!targetConvId && text.startsWith('/reply')) {
      const parts = text.split(/\s+/);
      if (parts.length >= 3) {
        targetConvId = parts[1].replace(/^#/, '');
        replyContent = parts.slice(2).join(' ');
      }
    }

    // 7. Handle: /close command
    if (text.startsWith('/close')) {
      const parts = text.split(/\s+/);
      if (parts.length >= 2) {
        const closeConvId = parts[1].replace(/^#/, '');
        const conv = await db
          .select()
          .from(schema.supportConversations)
          .where(eq(schema.supportConversations.id, closeConvId))
          .limit(1)
          .then((rows) => rows[0]);

        if (!conv) {
          await sendTelegramMessage(chatId, `⚠️ Percakapan \`#${closeConvId}\` tidak ditemukan.`);
          return NextResponse.json({ ok: true });
        }

        await db
          .update(schema.supportConversations)
          .set({ status: 'RESOLVED' })
          .where(eq(schema.supportConversations.id, conv.id));

        await sendTelegramMessage(chatId, `✅ Percakapan \`#${closeConvId}\` (${conv.buyerName}) telah ditandai selesai (*RESOLVED*).`);
        return NextResponse.json({ ok: true });
      }
    }

    // 8. If a target conversation was identified, save to DB
    if (targetConvId && replyContent) {
      const conv = await db
        .select()
        .from(schema.supportConversations)
        .where(eq(schema.supportConversations.id, targetConvId))
        .limit(1)
        .then((rows) => rows[0]);

      if (!conv) {
        await sendTelegramMessage(chatId, `⚠️ Percakapan \`#${targetConvId}\` tidak ditemukan di database.`);
        return NextResponse.json({ ok: true });
      }

      const msgId = `msg_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      const nowIso = new Date().toISOString();

      await db.insert(schema.supportMessages).values({
        id: msgId,
        conversationId: conv.id,
        senderType: 'ADMIN',
        senderName: 'Admin CS Pixel Store',
        message: replyContent,
        isRead: false,
        createdAt: nowIso,
      });

      await db
        .update(schema.supportConversations)
        .set({
          lastMessageText: replyContent,
          lastMessageSender: 'ADMIN',
          unreadByBuyer: (conv.unreadByBuyer || 0) + 1,
          lastMessageAt: nowIso,
          status: 'OPEN',
        })
        .where(eq(schema.supportConversations.id, conv.id));

      await sendTelegramMessage(
        chatId,
        `✅ *Pesan berhasil terkirim ke web pembeli!* (${conv.buyerName})`,
        message.message_id
      );

      return NextResponse.json({ ok: true });
    }

    // 9. If message is not a reply and no command matched, send gentle hint
    await sendTelegramMessage(
      chatId,
      'ℹ️ *Petunjuk:*\nUntuk membalas pesan pelanggan di web, silakan *Swipe / Balas (Reply)* pada notifikasi pesan pelanggan, atau gunakan format:\n`/reply <ID_Percakapan> <Pesan>`'
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[Telegram Webhook] Error:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
