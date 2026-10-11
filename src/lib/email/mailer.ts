import nodemailer from 'nodemailer';
import { ensureEnvLoaded } from '@/lib/env';

// Ensure process.env is populated in Astro/Node SSR
ensureEnvLoaded();

/**
 * Returns a configured Nodemailer Transporter instance.
 */
export function getMailTransporter() {
  const host = process.env.SMTP_HOST || 'smtp.sumopod.com';
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  const user = process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASS || '';

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
  });
}

/**
 * Verifies current SMTP connection and authentication credentials.
 */
export async function verifySmtpConnection(): Promise<{ success: boolean; message: string }> {
  try {
    const transporter = getMailTransporter();
    await transporter.verify();
    return {
      success: true,
      message: 'Koneksi ke server SMTP berhasil diverifikasi.',
    };
  } catch (err) {
    const msg = (err as Error).message || 'Gagal terhubung ke SMTP server';
    console.error('[SMTP] Verification error:', msg);
    return {
      success: false,
      message: `Gagal verifikasi SMTP: ${msg}`,
    };
  }
}

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Sends a generic email message.
 */
export async function sendEmail(options: SendMailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const from = process.env.SMTP_FROM || 'Pixel Store <no-reply@pixelstore.oktaa.my.id>';
    const transporter = getMailTransporter();

    const info = await transporter.sendMail({
      from,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (err) {
    const errMsg = (err as Error).message || 'Gagal mengirim email';
    console.error('[SMTP] Send error:', errMsg);
    return {
      success: false,
      error: errMsg,
    };
  }
}

export interface OrderFulfillmentEmailParams {
  orderNumber: string;
  customerEmail: string;
  productName: string;
  quantity: number;
  totalIdr: number;
  licenseCodes: string[];
}

/**
 * Sends an official order fulfillment email with customer's digital license codes.
 */
export async function sendOrderFulfillmentEmail(params: OrderFulfillmentEmailParams): Promise<{ success: boolean; error?: string }> {
  const { orderNumber, customerEmail, productName, quantity, totalIdr, licenseCodes } = params;

  // Format currency
  const formattedTotal = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(totalIdr);

  const formattedDate = new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(new Date());

  const codesHtml = licenseCodes
    .map(
      (code, idx) => `
      <div style="background-color: #0f172a; border: 1px solid #1e293b; border-radius: 8px; padding: 14px 18px; margin-bottom: 10px; font-family: monospace; font-size: 15px; color: #38bdf8; word-break: break-all; letter-spacing: 0.5px;">
        <span style="color: #64748b; font-size: 12px; display: block; margin-bottom: 4px; font-family: sans-serif;">Lisensi #${idx + 1}</span>
        <strong>${code}</strong>
      </div>
    `
    )
    .join('');

  const html = `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Lisensi Pesanan #${orderNumber}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0b0f17; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f1f5f9; line-height: 1.6;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0b0f17; padding: 30px 15px;">
    <tr>
      <td align="center">
        <!-- Main Container -->
        <table role="presentation" width="100%" style="max-width: 580px; background-color: #111827; border: 1px solid #1f2937; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);">
          
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%); padding: 32px 30px; text-align: center; border-bottom: 1px solid #1f2937;">
              <div style="display: inline-block; background-color: #2563eb; color: #ffffff; font-weight: 800; font-size: 18px; width: 40px; height: 40px; line-height: 40px; border-radius: 10px; text-align: center; margin-bottom: 12px;">P</div>
              <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px;">PIXEL STORE</h1>
              <p style="margin: 6px 0 0 0; font-size: 13px; color: #94a3b8;">Pembelian Lisensi Digital Berhasil</p>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0 0 16px 0; font-size: 15px; color: #e2e8f0;">Halo Kak,</p>
              <p style="margin: 0 0 24px 0; font-size: 14px; color: #94a3b8;">
                Terima kasih telah berbelanja di <strong>Pixel Store</strong>. Pembayaran QRIS Anda telah terverifikasi secara instan dan lisensi digital Anda telah siap digunakan di bawah ini:
              </p>

              <!-- Order Summary Card -->
              <table role="presentation" width="100%" style="background-color: #1a2234; border: 1px solid #2d3748; border-radius: 12px; margin-bottom: 24px; padding: 16px; font-size: 13px;">
                <tr>
                  <td style="color: #94a3b8; padding: 6px 0;">No. Pesanan:</td>
                  <td align="right" style="color: #f8fafc; font-weight: 600; padding: 6px 0; font-family: monospace;">${orderNumber}</td>
                </tr>
                <tr>
                  <td style="color: #94a3b8; padding: 6px 0;">Produk:</td>
                  <td align="right" style="color: #f8fafc; font-weight: 600; padding: 6px 0;">${productName} (${quantity}x)</td>
                </tr>
                <tr>
                  <td style="color: #94a3b8; padding: 6px 0;">Total Bayar:</td>
                  <td align="right" style="color: #38bdf8; font-weight: 700; padding: 6px 0;">${formattedTotal}</td>
                </tr>
                <tr>
                  <td style="color: #94a3b8; padding: 6px 0;">Waktu Selesai:</td>
                  <td align="right" style="color: #94a3b8; padding: 6px 0;">${formattedDate} WIB</td>
                </tr>
              </table>

              <!-- Codes Container -->
              <div style="margin-bottom: 24px;">
                <h3 style="margin: 0 0 12px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; color: #cbd5e1; font-weight: 600;">
                  🔑 Kode Lisensi / Tautan Akun
                </h3>
                ${codesHtml}
              </div>

              <!-- Button CTA -->
              <div style="text-align: center; margin: 28px 0 16px 0;">
                <a href="https://pixelstore.oktaa.my.id/user" target="_blank" style="background-color: #2563eb; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 14px; padding: 12px 28px; border-radius: 10px; display: inline-block; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);">
                  Buka Dasbor Akun Anda
                </a>
              </div>

              <p style="margin: 20px 0 0 0; font-size: 12px; color: #64748b; text-align: center;">
                Simpan email ini sebagai bukti transaksi resmi. Jika ada kendala dengan aktivasi lisensi, hubungi Live Chat di website kami.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #0b0f17; padding: 20px 30px; text-align: center; border-top: 1px solid #1f2937; font-size: 12px; color: #64748b;">
              &copy; ${new Date().getFullYear()} Pixel Store &bull; <a href="https://pixelstore.oktaa.my.id" style="color: #38bdf8; text-decoration: none;">pixelstore.oktaa.my.id</a>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  return sendEmail({
    to: customerEmail,
    subject: `[Pixel Store] Lisensi Pesanan #${orderNumber} Berhasil Diterbitkan`,
    html,
    text: `Pesanan #${orderNumber} Selesai!\n\nProduk: ${productName} (${quantity}x)\nTotal: ${formattedTotal}\n\nKode Lisensi:\n${licenseCodes.join('\n')}\n\nKunjungi https://pixelstore.oktaa.my.id untuk melihat riwayat pesanan Anda.`,
  });
}

/**
 * Sends a test email to verify SMTP configuration from Admin Dashboard.
 */
export async function sendTestEmail(targetEmail: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: sans-serif; background-color: #0b0f17; color: #f8fafc; padding: 30px;">
  <div style="max-width: 500px; margin: 0 auto; background-color: #111827; border: 1px solid #1e293b; border-radius: 12px; padding: 24px;">
    <h2 style="color: #38bdf8; margin-top: 0;">✅ Uji Coba SMTP Pixel Store Berhasil!</h2>
    <p style="color: #94a3b8; font-size: 14px;">Email ini dikirim dari server SMTP <strong>smtp.sumopod.com</strong> (Port 465 SSL) untuk memverifikasi fungsionalitas pengiriman email Pixel Store.</p>
    <div style="background-color: #0f172a; border-radius: 8px; padding: 12px; font-family: monospace; font-size: 13px; color: #cbd5e1; margin: 16px 0;">
      Waktu Kirim: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB
    </div>
    <p style="color: #64748b; font-size: 12px; margin-bottom: 0;">Sistem email notifikasi siap digunakan untuk pengiriman kode lisensi otomatis.</p>
  </div>
</body>
</html>
  `;

  return sendEmail({
    to: targetEmail,
    subject: '[Pixel Store] Tes Koneksi SMTP Berhasil ✅',
    html,
    text: `Uji coba SMTP Pixel Store berhasil dikirim pada ${new Date().toLocaleString('id-ID')}.`,
  });
}
