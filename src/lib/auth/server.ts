import { createNeonAuth } from '@neondatabase/auth/next/server';

const baseUrl = process.env.NEON_AUTH_BASE_URL || 'https://ep-steep-mode-b38excf1.neonauth.c-4.ap-southeast-1.aws.neon.tech/neondb/auth';
const secret = process.env.NEON_AUTH_COOKIE_SECRET || 'QVuH5N4oxfaRA9ISBBQyZt0zesd7aAO7NPSFPMXL9UE=';

export const jwksUrl = process.env.NEON_AUTH_JWKS_URL || 'https://ep-steep-mode-b38excf1.neonauth.c-4.ap-southeast-1.aws.neon.tech/neondb/auth/.well-known/jwks.json';

/**
 * Neon Managed Better Auth server instance.
 * Provides .handler(), .middleware(), .getSession(), and raw Better Auth server APIs.
 */
export const auth = createNeonAuth({
  baseUrl,
  cookies: {
    secret,
  },
  // Set logLevel to warn by default for clean logs
  logLevel: 'warn',
});

