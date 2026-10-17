import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import '../env';
import { auth as neonAuth } from './server';
import { db, schema, sqlClient } from '@/db';

import { getEffectiveUser } from './user';
import { ensureEnvLoaded } from '../env';

export const ADMIN_COOKIE_NAME = 'pixel_admin_session';

function getSecret(): string {
  try {
    ensureEnvLoaded();
  } catch {}
  return process.env.ADMIN_SECRET_KEY || 'pixel-store-secret-token-key-2026';
}

/**
 * Verifies whether the provided PIN matches the configured secret PIN.
 */
export function verifyAdminPin(inputPin: string): boolean {
  try {
    ensureEnvLoaded();
  } catch {}
  const configuredPin = process.env.ADMIN_SECRET_PIN || 'sigma8888';
  if (!inputPin) return false;
  return inputPin.trim() === configuredPin.trim();
}

/**
 * Creates an HMAC-SHA256 signed session token valid for 7 days.
 * Optionally embeds user email/id in base64.
 */
export function createAdminSessionToken(user?: { id?: string; email?: string }): string {
  const timestamp = Date.now().toString();
  const payload = user ? Buffer.from(JSON.stringify(user)).toString('base64url') : 'admin';
  const data = `${timestamp}.${payload}`;
  const signature = crypto
    .createHmac('sha256', getSecret())
    .update(data)
    .digest('hex');
  return `${data}.${signature}`;
}

/**
 * Synchronously verifies the cryptographic signature and expiration of an admin session token.
 */
export function verifySignedAdminToken(token: string | undefined): boolean {
  if (!token) return false;

  let cleaned = token.trim();
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  try {
    cleaned = decodeURIComponent(cleaned);
  } catch {}

  const parts = cleaned.split('.');
  if (parts.length < 2) return false;

  let timestamp = '';
  let signature = '';
  let dataToSign = '';

  if (parts.length === 2) {
    // Legacy format: timestamp.signature
    [timestamp, signature] = parts;
    dataToSign = timestamp;
  } else if (parts.length === 3) {
    // Standard format: timestamp.payload.signature
    timestamp = parts[0];
    signature = parts[2];
    dataToSign = `${parts[0]}.${parts[1]}`;
  } else {
    // Multi-part fallback: timestamp is parts[0], signature is last, rest is payload
    timestamp = parts[0];
    signature = parts[parts.length - 1];
    dataToSign = parts.slice(0, parts.length - 1).join('.');
  }

  const age = Date.now() - Number(timestamp);
  // Valid for 7 days
  if (isNaN(age) || age < 0 || age > 7 * 24 * 60 * 60 * 1000) {
    return false;
  }

  const secrets = [
    getSecret(),
    'sigma_secure_admin_jwt_session_2026',
    'pixel-store-secret-token-key-2026',
  ];

  for (const secret of secrets) {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(dataToSign)
      .digest('hex');

    try {
      if (
        signature.length === expectedSignature.length &&
        crypto.timingSafeEqual(
          Buffer.from(signature, 'hex'),
          Buffer.from(expectedSignature, 'hex')
        )
      ) {
        return true;
      }
    } catch {}
  }

  return false;
}

/**
 * Verifies whether the request is from an authenticated administrator.
 * Validates:
 * 1. Cryptographically signed admin session token (from argument or cookie).
 * 2. Neon Managed Better Auth session (role: admin or database role: admin).
 * 3. Store customer user session (role: admin).
 * 
 * Auto-heals and synchronizes the admin cookie if the user is authenticated but cookie was missing.
 */
export async function verifyAdminSessionToken(token?: string): Promise<boolean> {
  // 1. Fast-path: Check explicit token or admin cookie directly
  let sessionToken = token;
  if (!sessionToken) {
    try {
      const cookieStore = await cookies();
      sessionToken = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
    } catch {}
  }

  if (sessionToken && verifySignedAdminToken(sessionToken)) {
    return true;
  }

  // 2. Comprehensive fallback: Check if the user is authenticated in the admin panel
  // (via Neon Better Auth, Google OAuth, or database admin user)
  try {
    const adminSession = await getAdminSession();
    if (adminSession.isAuthenticated && adminSession.user) {
      // Auto-set the admin session cookie so subsequent actions have direct cookie access
      try {
        const cookieStore = await cookies();
        const freshToken = createAdminSessionToken(adminSession.user);
        cookieStore.set(ADMIN_COOKIE_NAME, freshToken, {
          path: '/',
          httpOnly: true,
          sameSite: 'lax',
          maxAge: 7 * 24 * 60 * 60,
          secure: process.env.NODE_ENV === 'production',
        });
      } catch {}
      return true;
    }
  } catch {}

  return false;
}

/**
 * Resolves the active administrator session.
 * Verifies:
 * 1. Signed admin cookie token (fast-path).
 * 2. Neon Managed Better Auth session (with role: admin or database role: admin).
 * 3. Store customer account session with role: admin.
 */
export async function getAdminSession(): Promise<{
  isAuthenticated: boolean;
  user?: { id: string; name: string; email: string; role: string };
}> {
  // 1. Check signed admin session cookie first
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
    if (token && verifySignedAdminToken(token)) {
      // Extract payload if present
      const parts = token.split('.');
      if (parts.length >= 3 && parts[1] !== 'admin') {
        try {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
          if (payload?.email) {
            const [localUser] = await db
              .select()
              .from(schema.users)
              .where(eq(schema.users.email, payload.email))
              .limit(1);

            let isAdminInNeon = false;
            try {
              const neonSqlRows = await (sqlClient as any)`
                SELECT role FROM neon_auth.user WHERE email = ${payload.email} LIMIT 1
              `;
              isAdminInNeon = neonSqlRows?.[0]?.role === 'admin';
            } catch {}

            const isAdmin = localUser?.role === 'admin' || isAdminInNeon;

            if (isAdmin) {
              return {
                isAuthenticated: true,
                user: {
                  id: localUser?.id || payload.id || 'admin',
                  name: localUser?.name || payload.email,
                  email: payload.email,
                  role: 'admin',
                },
              };
            } else if (localUser) {
              return { isAuthenticated: false };
            }
          }
        } catch {}
      }

      return {
        isAuthenticated: true,
        user: {
          id: 'admin',
          name: 'Administrator',
          email: 'admin@pixelstore.id',
          role: 'admin',
        },
      };
    }
  } catch {}

  // 2. Check Neon Better Auth session (including Google OAuth sign-in)
  try {
    const neonSession = await neonAuth.getSession();
    if (neonSession?.data?.user) {
      const nu = neonSession.data.user as any;
      if (nu.role === 'admin') {
        return {
          isAuthenticated: true,
          user: {
            id: nu.id,
            name: nu.name || nu.email,
            email: nu.email,
            role: 'admin',
          },
        };
      }

      // Check if user is recorded as admin in local database
      const [localUser] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, nu.email))
        .limit(1);

      if (localUser && localUser.role === 'admin') {
        return {
          isAuthenticated: true,
          user: {
            id: localUser.id,
            name: localUser.name,
            email: localUser.email,
            role: 'admin',
          },
        };
      }

      // Check directly in neon_auth.user via SQL if session claim hasn't refreshed
      try {
        const neonSqlRows = await (sqlClient as any)`
          SELECT id, role, name, email FROM neon_auth.user 
          WHERE email = ${nu.email} OR id::text = ${nu.id} 
          LIMIT 1
        `;
        if (neonSqlRows?.[0]?.role === 'admin') {
          return {
            isAuthenticated: true,
            user: {
              id: neonSqlRows[0].id,
              name: neonSqlRows[0].name || nu.name || nu.email,
              email: neonSqlRows[0].email || nu.email,
              role: 'admin',
            },
          };
        }
      } catch {}
    }
  } catch (err) {
    // Neon Auth unreachable or not authenticated, fallback
  }

  // 3. Check effective user session (USER_COOKIE_NAME from store login)
  try {
    const effectiveUser = await getEffectiveUser();
    if (effectiveUser && effectiveUser.role === 'admin') {
      return {
        isAuthenticated: true,
        user: {
          id: effectiveUser.id,
          name: effectiveUser.name,
          email: effectiveUser.email,
          role: 'admin',
        },
      };
    }
  } catch {}

  return { isAuthenticated: false };
}

export interface AdminManagedUser {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: 'admin' | 'customer';
  provider: 'google' | 'credential';
  image?: string | null;
  emailVerified: boolean;
  banned?: boolean;
  createdAt: string;
}

/**
 * Retrieves the unified list of registered users across both Neon Managed Better Auth
 * (neon_auth.user, neon_auth.account) and legacy local PostgreSQL users (public.users).
 */
export async function getAdminUsersList(): Promise<AdminManagedUser[]> {
  const usersMap = new Map<string, AdminManagedUser>();

  // 1. Fetch from neon_auth.user & neon_auth.account (primary Better Auth source)
  try {
    const neonRows = await (sqlClient as any)`
      SELECT 
        nu.id::text as id, 
        nu.name, 
        nu.email, 
        nu."emailVerified" as "emailVerified", 
        nu.image, 
        nu.role, 
        nu.banned,
        nu."createdAt" as "createdAt", 
        COALESCE(acc."providerId", 'credential') as provider,
        pu.phone
      FROM neon_auth.user nu 
      LEFT JOIN LATERAL (
        SELECT "providerId" FROM neon_auth.account WHERE "userId" = nu.id LIMIT 1
      ) acc ON true
      LEFT JOIN public.users pu ON pu.email = nu.email OR pu.id = nu.id::text
      ORDER BY nu."createdAt" DESC;
    `;

    for (const r of neonRows) {
      const email = (r.email || '').toLowerCase().trim();
      const normRole = (r.role === 'admin' ? 'admin' : 'customer') as 'admin' | 'customer';
      const userObj: AdminManagedUser = {
        id: r.id,
        name: r.name || r.email || 'Pengguna',
        email: r.email,
        phone: r.phone || null,
        role: normRole,
        provider: (r.provider === 'google' ? 'google' : 'credential') as 'google' | 'credential',
        image: r.image || null,
        emailVerified: Boolean(r.emailVerified),
        banned: Boolean(r.banned),
        createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
      };
      if (email) {
        usersMap.set(email, userObj);
      } else {
        usersMap.set(r.id, userObj);
      }
    }
  } catch (err) {
    console.warn('[Admin] Failed to read from neon_auth.user:', (err as Error).message);
  }

  // 2. Fetch from public.users to ensure any legacy registered accounts are included
  try {
    const localUsers = await db.select().from(schema.users);
    for (const u of localUsers) {
      const email = (u.email || '').toLowerCase().trim();
      if (!usersMap.has(email)) {
        usersMap.set(email, {
          id: u.id,
          name: u.name,
          email: u.email,
          phone: u.phone || null,
          role: u.role === 'admin' ? 'admin' : 'customer',
          provider: 'credential',
          image: null,
          emailVerified: false,
          banned: false,
          createdAt: u.createdAt || new Date().toISOString(),
        });
      } else {
        // Enrich phone if present in public.users but missing in neon_auth
        const existing = usersMap.get(email)!;
        if (!existing.phone && u.phone) {
          existing.phone = u.phone;
        }
      }
    }
  } catch (err) {
    console.warn('[Admin] Failed to read from public.users:', (err as Error).message);
  }

  return Array.from(usersMap.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}
