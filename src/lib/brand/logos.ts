/**
 * Brand Logo Resolution Service
 * Maps digital services to their official, authentic production domain logos.
 * Uses high-res unavatar.io service to fetch the real brand marks directly from official domains.
 */

const BRAND_DOMAIN_MAP: Record<string, string> = {
  gemini: 'gemini.google.com',
  cursor: 'cursor.com',
  manus: 'manus.im',
  lovable: 'lovable.dev',
  runway: 'runwayml.com',
  factory: 'factory.ai',
  duolingo: 'duolingo.com',
  adobe: 'adobe.com',
  resend: 'resend.com',
  elevan: 'elevenlabs.io',
  eleven: 'elevenlabs.io',
  railway: 'railway.app',
  n8n: 'n8n.io',
  framer: 'framer.com',
  warp: 'warp.dev',
  granola: 'granola.so',
  notion: 'notion.so',
  vpn: 'nordvpn.com',
  nord: 'nordvpn.com',
  gumloop: 'gumloop.com',
  intercom: 'intercom.com',
  'magic pattern': 'magicpattern.design',
  wispr: 'flow.wispr.ai',
  mobbin: 'mobbin.com',
  posthog: 'posthog.com',
  linear: 'linear.app',
  descript: 'descript.com',
  brain: 'brain.fm',
  capcut: 'capcut.com',
  pangram: 'pangram.com',
  customer: 'customer.io',
  jam: 'jam.dev',
  airtable: 'airtable.com',
  replit: 'replit.com',
  synthesia: 'synthesia.io',
  gamma: 'gamma.app',
  vrew: 'vrew.voyagerx.com',
};

/**
 * Resolves the real, authentic brand logo URL for any service name.
 */
export function getRealBrandLogoUrl(productName: string): string {
  const n = productName.toLowerCase();

  for (const [key, domain] of Object.entries(BRAND_DOMAIN_MAP)) {
    if (n.includes(key)) {
      return `https://unavatar.io/${domain}`;
    }
  }

  // Fallback to domain guess or standard clearbit favicon
  const cleanWord = n.replace(/[^a-z0-9]/g, '');
  return `https://unavatar.io/${cleanWord}.com`;
}
