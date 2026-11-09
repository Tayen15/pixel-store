/**
 * Smart Brand Logo Resolution Service
 * Intelligently extracts the true brand and official domain from wholesale product titles
 * (stripping plans, durations, token counts, and wholesale annotations)
 * and generates high-resolution logo URLs via unavatar.io.
 */

export const BRAND_DOMAIN_MAP: Record<string, string> = {
  // Google / AI / LLM
  gemini: 'gemini.google.com',
  google: 'google.com',
  chatgpt: 'chatgpt.com',
  openai: 'openai.com',
  claude: 'anthropic.com',
  anthropic: 'anthropic.com',
  perplexity: 'perplexity.ai',
  perpexity: 'perplexity.ai',
  midjourney: 'midjourney.com',
  cursor: 'cursor.com',
  manus: 'manus.im',
  lovable: 'lovable.dev',
  runway: 'runwayml.com',
  factory: 'factory.ai',
  higgsfield: 'higgsfield.ai',
  higgsflied: 'higgsfield.ai',
  muse: 'muse.ai',
  bolt: 'bolt.new',
  v0: 'v0.dev',
  replit: 'replit.com',
  gumloop: 'gumloop.com',
  gamma: 'gamma.app',
  synthesia: 'synthesia.io',
  descript: 'descript.com',
  vrew: 'vrew.voyagerx.com',
  wispr: 'flow.wispr.ai',
  brain: 'brain.fm',
  kling: 'klingai.com',
  pika: 'pika.art',
  suno: 'suno.com',
  elevenlabs: 'elevenlabs.io',
  elevanlabs: 'elevenlabs.io',
  eleven: 'elevenlabs.io',
  elevan: 'elevenlabs.io',
  deepseek: 'deepseek.com',
  groq: 'groq.com',
  krea: 'krea.ai',
  luma: 'luma.com',
  udio: 'udio.com',

  // Dev & Cloud Infrastructure
  railway: 'railway.app',
  n8n: 'n8n.io',
  framer: 'framer.com',
  warp: 'warp.dev',
  granola: 'granola.so',
  notion: 'notion.so',
  linear: 'linear.app',
  posthog: 'posthog.com',
  jam: 'jam.dev',
  resend: 'resend.com',
  airtable: 'airtable.com',
  github: 'github.com',
  gitlab: 'gitlab.com',
  supabase: 'supabase.com',
  docker: 'docker.com',

  // Creative, Media & Audio
  adobe: 'adobe.com',
  capcut: 'capcut.com',
  canva: 'canva.com',
  figma: 'figma.com',
  mobbin: 'mobbin.com',
  magicpattern: 'magicpattern.design',
  'magic pattern': 'magicpattern.design',
  pangram: 'pangram.com',
  apple: 'apple.com',
  spotify: 'spotify.com',
  netflix: 'netflix.com',

  // Business & Productivity
  linkedin: 'linkedin.com',
  linkdin: 'linkedin.com',
  intercom: 'intercom.com',
  customer: 'customer.io',
  duolingo: 'duolingo.com',
  superduolingo: 'duolingo.com',
  nordvpn: 'nordvpn.com',
  nord: 'nordvpn.com',
  vpn: 'nordvpn.com',
  grammarly: 'grammarly.com',
};

const COMMON_TLDS = new Set([
  'ai', 'io', 'dev', 'app', 'so', 'fm', 'im', 'sh', 'co', 'org', 'net', 'com', 'me', 'new', 'design', 'art'
]);

const NOISE_WORDS = new Set([
  'pro', 'plus', 'ultra', 'max', 'enterprise', 'business', 'buisness', 'team', 'teams',
  'starter', 'creator', 'standard', 'premium', 'basic', 'hobby', 'scale', 'advance',
  'advanced', 'lite', 'core', 'plan', 'account', 'seats', 'seat', 'token', 'tokens',
  'coupon', 'license', 'key', 'build', 'navigator', 'sales', 'sale', 'sales',
  'year', 'years', 'yr', 'yrs', 'month', 'months', 'mo', 'mos', 'm', 'day', 'days',
  'd', 'week', 'weeks', 'w', 'user', 'users', 'new', 'fw', 'nw', 'essential', 'order',
  'super', 'unlimited', 'card', 'needed', 'private', 'shared', 'bot'
]);

/**
 * Intelligently resolves the target domain name for any raw wholesale product title.
 */
export function resolveSmartBrandDomain(rawName: string): string {
  if (!rawName) return 'unavatar.io';
  const lower = rawName.toLowerCase();

  // 1. Direct check against known brand map keywords (word boundary safe)
  for (const [key, domain] of Object.entries(BRAND_DOMAIN_MAP)) {
    const regex = new RegExp(`\\b${key.replace(/\s+/g, '\\s+')}\\b`, 'i');
    if (regex.test(lower)) {
      return domain;
    }
  }

  // 2. Check if product name already contains an explicit domain (e.g. "synthesia.io", "brain.fm")
  const explicitDomainMatch = lower.match(
    /\b([a-z0-9-]+)\.(com|io|ai|dev|app|so|fm|im|sh|net|org|co|me|new|design|art)\b/i
  );
  if (explicitDomainMatch) {
    return explicitDomainMatch[0];
  }

  // 3. Clean string by stripping parenthetical notes (e.g. "(FW)", "(New User)", "(No Card Needed)")
  let cleaned = lower.replace(/\([^)]*\)|\[[^\]]*\]|\{[^}]*\}/g, ' ');

  // Strip additions after '+' or '&' or '/'
  cleaned = cleaned.split(/\+|\/|\|/)[0];

  // Strip durations and quantities like "1 Year", "3 Months", "6M", "18 Months", "1B", "31B", "100k"
  cleaned = cleaned.replace(/\b\d+\s*(year|years|yr|yrs|month|months|mo|mos|m|day|days|d|week|weeks|w|h|b|k)\b/gi, ' ');
  cleaned = cleaned.replace(/\b\d+[a-z]?\b/gi, ' ');

  // Tokenize words
  const words = cleaned
    .replace(/[^a-z0-9.\s]/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);

  // Filter out noise / tier words
  const meaningfulWords = words.filter((w) => !NOISE_WORDS.has(w));

  if (meaningfulWords.length === 0) {
    const firstWord = words[0] || 'service';
    return `${firstWord}.com`;
  }

  // Check again if any meaningful word matches BRAND_DOMAIN_MAP
  for (const w of meaningfulWords) {
    if (BRAND_DOMAIN_MAP[w]) {
      return BRAND_DOMAIN_MAP[w];
    }
  }

  // Check if meaningful words look like [name, tld] (e.g. ["muse", "ai"] -> "muse.ai")
  if (meaningfulWords.length >= 2) {
    const lastWord = meaningfulWords[meaningfulWords.length - 1];
    if (COMMON_TLDS.has(lastWord)) {
      const baseName = meaningfulWords.slice(0, -1).join('');
      return `${baseName}.${lastWord}`;
    }
  }

  // Fallback to primary brand word + .com
  const primaryBrand = meaningfulWords[0];
  return `${primaryBrand}.com`;
}

/**
 * Resolves the real, authentic brand logo URL for any service name.
 */
export function getRealBrandLogoUrl(productName: string): string {
  const domain = resolveSmartBrandDomain(productName);
  return `https://unavatar.io/${domain}`;
}

