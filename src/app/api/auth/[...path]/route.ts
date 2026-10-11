import { auth } from '@/lib/auth/server';

/**
 * Neon Managed Better Auth API Route Handler.
 * Proxies all authentication requests (sign-up, sign-in, session, OAuth callbacks)
 * through to the managed REST service.
 */
export const { GET, POST } = auth.handler();
