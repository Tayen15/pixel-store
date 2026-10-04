import crypto from 'node:crypto';
import '../env';

export const ADMIN_COOKIE_NAME = 'pixel_admin_session';
function getSecret(): string {
  return process.env.ADMIN_SECRET_KEY || 'pixel-store-secret-token-key-2026';
}

/**
 * Verifies whether the provided PIN matches the configured secret PIN.
 */
export function verifyAdminPin(inputPin: string): boolean {
  const configuredPin = process.env.ADMIN_SECRET_PIN || 'sigma8888';
  if (!inputPin) return false;
  return inputPin.trim() === configuredPin.trim();
}

/**
 * Creates an HMAC-SHA256 signed session token valid for 7 days.
 */
export function createAdminSessionToken(): string {
  const timestamp = Date.now().toString();
  const signature = crypto
    .createHmac('sha256', getSecret())
    .update(timestamp)
    .digest('hex');
  return `${timestamp}.${signature}`;
}

/**
 * Verifies the integrity and expiration of an admin session token.
 */
export function verifyAdminSessionToken(token: string | undefined): boolean {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [timestamp, signature] = parts;
  if (!timestamp || !signature) return false;

  const age = Date.now() - Number(timestamp);
  // Valid for 7 days
  if (isNaN(age) || age < 0 || age > 7 * 24 * 60 * 60 * 1000) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', getSecret())
    .update(timestamp)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch {
    return false;
  }
}
