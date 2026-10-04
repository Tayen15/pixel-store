import fs from 'node:fs';
import path from 'node:path';

let envLoaded = false;

/**
 * Ensures environment variables from .env are populated into process.env.
 * This is crucial in Astro / Vite SSR dev mode where process.env is not automatically
 * populated with non-prefixed variables from the .env file.
 */
export function ensureEnvLoaded(): void {
  if (envLoaded) return;
  envLoaded = true;

  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if (
            (val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))
          ) {
            val = val.slice(1, -1);
          }
          if (process.env[key] === undefined || process.env[key] === '') {
            process.env[key] = val;
          }
        }
      }
    }
  } catch (err) {
    console.warn('[Env] Failed to read .env file:', err);
  }
}

// Auto-run immediately upon module evaluation
ensureEnvLoaded();
