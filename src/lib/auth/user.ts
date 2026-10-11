import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { eq, and, gt } from 'drizzle-orm';
import { db, schema, sqlClient, type User } from '@/db';
import { auth as neonAuth } from '@/lib/auth/server';

export const USER_COOKIE_NAME = 'pixel_user_session';

/**
 * Hashes a plaintext password using crypto.scrypt with a unique random salt.
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Validates a plaintext password against a stored salt:hash string using timing-safe comparison.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const parts = storedHash.split(':');
    if (parts.length !== 2) return false;
    const [salt, key] = parts;
    const keyBuffer = Buffer.from(key, 'hex');
    const derivedKey = crypto.scryptSync(password, salt, 64);
    return crypto.timingSafeEqual(keyBuffer, derivedKey);
  } catch {
    return false;
  }
}

/**
 * Creates a new user account in PostgreSQL.
 */
export async function createUserAccount(data: {
  id?: string;
  email: string;
  password: string;
  name: string;
  phone?: string;
  role?: 'customer' | 'admin';
}): Promise<User> {
  const normalizedEmail = data.email.trim().toLowerCase();

  // Check if user already exists
  const existing = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, normalizedEmail));

  if (existing.length > 0) {
    throw new Error('Alamat email sudah terdaftar. Silakan masuk menggunakan akun Anda.');
  }

  const id = data.id || crypto.randomUUID();
  const passwordHash = hashPassword(data.password);
  const now = new Date().toISOString();

  const inserted = await db
    .insert(schema.users)
    .values({
      id,
      email: normalizedEmail,
      passwordHash,
      name: data.name.trim(),
      phone: data.phone?.trim() || null,
      role: data.role || 'customer',
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return inserted[0];
}

/**
 * Authenticates user credentials and returns the User record.
 */
export async function authenticateUser(email: string, password: string): Promise<User> {
  const normalizedEmail = email.trim().toLowerCase();

  const users = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, normalizedEmail));

  if (users.length === 0) {
    throw new Error('Email atau kata sandi tidak sesuai.');
  }

  const user = users[0];
  const isValid = verifyPassword(password, user.passwordHash);

  if (!isValid) {
    throw new Error('Email atau kata sandi tidak sesuai.');
  }

  return user;
}

/**
 * Creates an active session for the user valid for 30 days.
 */
export async function createUserSession(userId: string): Promise<{ token: string; expiresAt: string }> {
  const sessionId = crypto.randomUUID();
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  await db.insert(schema.userSessions).values({
    id: sessionId,
    userId,
    token,
    expiresAt,
    createdAt: new Date().toISOString(),
  });

  return { token, expiresAt };
}

/**
 * Retrieves the authenticated user from a session token.
 */
export async function getUserFromSession(token: string | undefined): Promise<User | null> {
  if (!token) return null;

  try {
    const sessions = await db
      .select()
      .from(schema.userSessions)
      .where(
        and(
          eq(schema.userSessions.token, token),
          gt(schema.userSessions.expiresAt, new Date().toISOString())
        )
      );

    if (sessions.length === 0) return null;

    const session = sessions[0];
    const users = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, session.userId));

    return users[0] || null;
  } catch (err) {
    console.warn('Session verification error:', (err as Error).message);
    return null;
  }
}

/**
 * Removes a session token upon logout.
 */
export async function deleteUserSession(token: string): Promise<void> {
  try {
    await db.delete(schema.userSessions).where(eq(schema.userSessions.token, token));
  } catch (err) {
    console.warn('Session deletion error:', (err as Error).message);
  }
}

/**
 * Synchronizes or creates a local PostgreSQL user record for a Better Auth / OAuth user.
 * Ensures referential integrity with foreign key relations on orders and chats.
 */
export async function syncNeonOAuthUser(neonUser: {
  id: string;
  email: string;
  name?: string | null;
  role?: string | null;
}): Promise<User> {
  const normalizedEmail = neonUser.email.trim().toLowerCase();

  // 1. Try finding by email
  const existingByEmail = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, normalizedEmail))
    .limit(1);

  if (existingByEmail.length > 0) {
    if (neonUser.role === 'admin' && existingByEmail[0].role !== 'admin') {
      const [updated] = await db
        .update(schema.users)
        .set({ role: 'admin', updatedAt: new Date().toISOString() })
        .where(eq(schema.users.id, existingByEmail[0].id))
        .returning();
      return updated;
    }
    return existingByEmail[0];
  }

  // 2. Try finding by ID
  const existingById = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, neonUser.id))
    .limit(1);

  if (existingById.length > 0) {
    return existingById[0];
  }

  // 3. Insert new user record
  const now = new Date().toISOString();
  const userName = (neonUser.name || normalizedEmail.split('@')[0]).trim();
  const role = (neonUser.role === 'admin' ? 'admin' : 'customer') as 'customer' | 'admin';

  const [inserted] = await db
    .insert(schema.users)
    .values({
      id: neonUser.id,
      email: normalizedEmail,
      name: userName,
      passwordHash: 'oauth:neon',
      phone: null,
      role,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return inserted;
}

export type EffectiveUser = User & {
  image?: string | null;
};

/**
 * Resolves the currently authenticated user across both Neon Managed Better Auth
 * (including Google OAuth sessions) and legacy encrypted session tokens.
 */
export async function getEffectiveUser(): Promise<EffectiveUser | null> {
  // 1. Check Neon Managed Better Auth session first
  try {
    const neonSession = await neonAuth.getSession();
    if (neonSession?.data?.user) {
      const nu = neonSession.data.user as any;
      const syncedUser = await syncNeonOAuthUser({
        id: nu.id,
        email: nu.email,
        name: nu.name || nu.email,
        role: nu.role,
      });
      return {
        ...syncedUser,
        image: (nu.image as string) || null,
      };
    }
  } catch (err) {
    // Continue to cookie session check if Neon Auth is not initialized or throws
  }

  // 2. Fall back to local cookie session
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(USER_COOKIE_NAME)?.value;
    if (token) {
      const user = await getUserFromSession(token);
      if (user) {
        return {
          ...user,
          image: null,
        };
      }
    }
  } catch (err) {
    // Cookie store may fail outside request context
  }

  return null;
}

/**
 * Creates and stores a 6-digit password reset OTP verification code.
 */
export async function createPasswordResetCode(email: string): Promise<{
  code: string;
  name: string;
  email: string;
}> {
  const normalizedEmail = email.trim().toLowerCase();

  // Find user in public.users or neon_auth.user
  let userName = 'Pelanggan';
  let userExists = false;

  const localUser = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, normalizedEmail))
    .limit(1);

  if (localUser.length > 0) {
    userExists = true;
    userName = localUser[0].name;
  } else {
    try {
      const neonRows = await (sqlClient as any)`
        SELECT name, email FROM neon_auth.user WHERE email = ${normalizedEmail} LIMIT 1
      `;
      if (neonRows.length > 0) {
        userExists = true;
        userName = neonRows[0].name || userName;
      }
    } catch (neonErr) {
      console.warn('[PasswordReset] Failed to check neon_auth:', (neonErr as Error).message);
    }
  }

  if (!userExists) {
    throw new Error('Alamat email belum terdaftar dalam sistem.');
  }

  // Generate 6-digit numeric OTP
  const code = crypto.randomInt(100000, 999999).toString();
  const identifier = `reset:${normalizedEmail}`;
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 minutes

  try {
    // Delete any existing reset codes for this email
    await (sqlClient as any)`
      DELETE FROM neon_auth.verification WHERE identifier = ${identifier}
    `;

    // Insert new verification entry
    await (sqlClient as any)`
      INSERT INTO neon_auth.verification (id, identifier, value, "expiresAt", "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), ${identifier}, ${code}, ${expiresAt}, NOW(), NOW())
    `;
  } catch (dbErr) {
    console.error('[PasswordReset] Failed to store verification code:', dbErr);
    throw new Error('Gagal memproses kode reset. Silakan coba lagi.');
  }

  return {
    code,
    name: userName,
    email: normalizedEmail,
  };
}

/**
 * Verifies the 6-digit OTP code and updates the password for the user.
 */
export async function verifyAndApplyPasswordReset(
  email: string,
  code: string,
  newPassword: string
): Promise<User> {
  const normalizedEmail = email.trim().toLowerCase();
  const trimmedCode = code.trim();
  const identifier = `reset:${normalizedEmail}`;

  if (!trimmedCode || trimmedCode.length !== 6) {
    throw new Error('Kode verifikasi harus berupa 6 digit angka.');
  }

  if (!newPassword || newPassword.length < 6) {
    throw new Error('Kata sandi baru minimal harus terdiri dari 6 karakter.');
  }

  // 1. Check verification code in neon_auth.verification
  try {
    const rows = await (sqlClient as any)`
      SELECT id, value, "expiresAt"
      FROM neon_auth.verification
      WHERE identifier = ${identifier}
        AND "expiresAt" > NOW()
      ORDER BY "createdAt" DESC
      LIMIT 1
    `;

    if (!rows || rows.length === 0) {
      throw new Error('Kode verifikasi telah kadaluarsa atau tidak valid. Silakan minta kode baru.');
    }

    if (rows[0].value.trim() !== trimmedCode) {
      throw new Error('Kode verifikasi yang Anda masukkan tidak sesuai.');
    }

    // Delete verified entry immediately to prevent replay
    await (sqlClient as any)`
      DELETE FROM neon_auth.verification WHERE identifier = ${identifier}
    `;
  } catch (verifyErr) {
    if ((verifyErr as Error).message.includes('Kode verifikasi')) {
      throw verifyErr;
    }
    console.error('[PasswordReset] Verification query error:', verifyErr);
    throw new Error('Gagal memverifikasi kode reset kata sandi.');
  }

  // 2. Hash new password
  const newPasswordHash = hashPassword(newPassword);
  const now = new Date().toISOString();

  // 3. Update or create user in public.users
  let targetUser: User | null = null;
  const existingLocal = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, normalizedEmail))
    .limit(1);

  if (existingLocal.length > 0) {
    const [updated] = await db
      .update(schema.users)
      .set({
        passwordHash: newPasswordHash,
        updatedAt: now,
      })
      .where(eq(schema.users.email, normalizedEmail))
      .returning();
    targetUser = updated;
  } else {
    // If user registered via OAuth only, initialize their local record
    targetUser = await createUserAccount({
      email: normalizedEmail,
      password: newPassword,
      name: normalizedEmail.split('@')[0],
      role: 'customer',
    });
  }

  // 4. Invalidate all past sessions for this user for security
  try {
    await db
      .delete(schema.userSessions)
      .where(eq(schema.userSessions.userId, targetUser.id));
  } catch (sessionErr) {
    console.warn('[PasswordReset] Failed to clear sessions:', sessionErr);
  }

  return targetUser;
}

/**
 * Direct administrative password override by store administrator.
 */
export async function adminDirectResetUserPassword(
  userId: string,
  newPassword: string
): Promise<User> {
  if (!newPassword || newPassword.length < 6) {
    throw new Error('Kata sandi baru minimal harus terdiri dari 6 karakter.');
  }

  const newPasswordHash = hashPassword(newPassword);
  const now = new Date().toISOString();

  // 1. Update public.users
  let targetUser: User | null = null;
  const [updated] = await db
    .update(schema.users)
    .set({
      passwordHash: newPasswordHash,
      updatedAt: now,
    })
    .where(eq(schema.users.id, userId))
    .returning();

  if (updated) {
    targetUser = updated;
  } else {
    // Try by email matching neon_auth user
    try {
      const neonRows = await (sqlClient as any)`
        SELECT id, name, email FROM neon_auth.user WHERE id = ${userId}::uuid OR email = ${userId} LIMIT 1
      `;
      if (neonRows.length > 0) {
        const nr = neonRows[0];
        targetUser = await createUserAccount({
          id: nr.id,
          email: nr.email,
          name: nr.name || 'Pengguna',
          password: newPassword,
          role: 'customer',
        });
      }
    } catch {}
  }

  if (!targetUser) {
    throw new Error('Pengguna tidak ditemukan dalam database.');
  }

  // 2. Clear old sessions
  try {
    await db
      .delete(schema.userSessions)
      .where(eq(schema.userSessions.userId, targetUser.id));
  } catch {}

  return targetUser;
}


