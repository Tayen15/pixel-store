import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Manual runtime .env loader
const envPath = resolve(process.cwd(), '.env');
if (existsSync(envPath)) {
  const content = readFileSync(envPath, 'utf8');
  content.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const [key, ...rest] = trimmed.split('=');
    if (key && rest.length > 0) {
      const val = rest.join('=').replace(/^["']|["']$/g, '');
      if (!process.env[key.trim()]) {
        process.env[key.trim()] = val.trim();
      }
    }
  });
}

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
const domain = process.env.APP_URL || 'https://pixelstore.oktaa.my.id';
const webhookUrl = `${domain.replace(/\/$/, '')}/api/webhooks/telegram`;

if (!botToken) {
  console.error('❌ Error: TELEGRAM_BOT_TOKEN not found in .env');
  process.exit(1);
}

async function setupWebhook() {
  console.log(`Setting up Telegram Webhook for Pixel Store...`);
  console.log(`Target URL: ${webhookUrl}`);

  const body: Record<string, any> = {
    url: webhookUrl,
    allowed_updates: ['message'],
  };

  if (webhookSecret) {
    body.secret_token = webhookSecret;
    console.log(`Secured with X-Telegram-Bot-Api-Secret-Token`);
  }

  const setRes = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const setData = await setRes.json();
  console.log('setWebhook response:', setData);

  const infoRes = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
  const infoData = await infoRes.json();
  console.log('getWebhookInfo:', infoData);

  if (setData.ok) {
    console.log('✅ Webhook successfully configured!');
  } else {
    console.error('❌ Failed to configure webhook:', setData.description);
  }
}

setupWebhook().catch(console.error);
