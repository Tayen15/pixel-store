import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import '../env';
import { auth as neonAuth } from './server';
import { db, schema, sqlClient } from '@/db';

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
 * Verifies the integrity and expiration of an admin session token.
 */
export function verifyAdminSessionToken(token: string | undefined): boolean {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length < 2) return false;

  let timestamp = '';
  let signature = '';
  let dataToSign = '';

  if (parts.length === 2) {
    // Legacy format: timestamp.signature
    [timestamp, signature] = parts;
    dataToSign = timestamp;
  } else if (parts.length === 3) {
    // New format: timestamp.payload.signature
    timestamp = parts[0];
    signature = parts[2];
    dataToSign = `${parts[0]}.${parts[1]}`;
  } else {
    return false;
  }

  const age = Date.now() - Number(timestamp);
  // Valid for 7 days
  if (isNaN(age) || age < 0 || age > 7 * 24 * 60 * 60 * 1000) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', getSecret())
    .update(dataToSign)
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

/**
 * Resolves the active administrator session.
 * Verifies Neon Managed Better Auth session first (with role: admin),
 * and falls back to signed admin cookie token with local database role validation.
 */
export async function getAdminSession(): Promise<{
  isAuthenticated: boolean;
  user?: { id: string; name: string; email: string; role: string };
}> {
  // 1. Check Neon Better Auth session
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
    }
  } catch (err) {
    // Neon Auth unreachable or not authenticated, fallback to admin cookie
  }

  // 2. Check signed admin session cookie
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
    if (token && verifyAdminSessionToken(token)) {
      // Extract payload if present
      const parts = token.split('.');
      if (parts.length === 3 && parts[1] !== 'admin') {
        try {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
          if (payload?.email) {
            const [localUser] = await db
              .select()
              .from(schema.users)
              .where(eq(schema.users.email, payload.email))
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
