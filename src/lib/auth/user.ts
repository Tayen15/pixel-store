import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { eq, and, gt } from 'drizzle-orm';
import { db, schema, sqlClient, type User } from '@/db';

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
 * Finds an existing user by email or creates a new one via OAuth provider.
 */
export async function findOrCreateOAuthUser(data: {
  email: string;
  name: string;
  provider: 'google';
}): Promise<User> {
  const normalizedEmail = data.email.trim().toLowerCase();

  const existing = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, normalizedEmail));

  if (existing.length > 0) {
    return existing[0];
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const passwordHash = `oauth:${data.provider}:${crypto.randomBytes(16).toString('hex')}`;

  const inserted = await db
    .insert(schema.users)
    .values({
      id,
      email: normalizedEmail,
      passwordHash,
      name: data.name.trim() || normalizedEmail.split('@')[0],
      role: 'customer',
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
 * Resolves the currently authenticated user from active session token.
 */
export async function getEffectiveUser(): Promise<EffectiveUser | null> {
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

  const [localUser] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, normalizedEmail))
    .limit(1);

  if (!localUser) {
    throw new Error('Alamat email belum terdaftar dalam sistem.');
  }

  // Generate 6-digit numeric OTP
  const code = crypto.randomInt(100000, 999999).toString();
  const identifier = `reset:${normalizedEmail}`;
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 minutes

  try {
    // Delete any existing reset codes for this email
    await db.delete(schema.verificationCodes).where(eq(schema.verificationCodes.identifier, identifier));

    // Insert new verification entry
    await db.insert(schema.verificationCodes).values({
      id: crypto.randomUUID(),
      identifier,
      value: code,
      expiresAt,
    });
  } catch (dbErr) {
    console.error('[PasswordReset] Failed to store verification code:', dbErr);
    throw new Error('Gagal memproses kode reset. Silakan coba lagi.');
  }

  return {
    code,
    name: localUser.name,
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

  // 1. Check verification code in verification_codes table
  try {
    const [record] = await db
      .select()
      .from(schema.verificationCodes)
      .where(eq(schema.verificationCodes.identifier, identifier))
      .limit(1);

    if (!record || new Date(record.expiresAt).getTime() < Date.now()) {
      throw new Error('Kode verifikasi telah kadaluarsa atau tidak valid. Silakan minta kode baru.');
    }

    if (record.value.trim() !== trimmedCode) {
      throw new Error('Kode verifikasi yang Anda masukkan tidak sesuai.');
    }

    // Delete verified entry immediately to prevent replay
    await db.delete(schema.verificationCodes).where(eq(schema.verificationCodes.identifier, identifier));
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

  // 3. Update password in users table
  const [targetUser] = await db
    .update(schema.users)
    .set({
      passwordHash: newPasswordHash,
      updatedAt: now,
    })
    .where(eq(schema.users.email, normalizedEmail))
    .returning();

  if (!targetUser) {
    throw new Error('Pengguna tidak ditemukan untuk memperbarui kata sandi.');
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

  const [targetUser] = await db
    .update(schema.users)
    .set({
      passwordHash: newPasswordHash,
      updatedAt: now,
    })
    .where(eq(schema.users.id, userId))
    .returning();

  if (!targetUser) {
    throw new Error(`Pengguna dengan ID '${userId}' tidak ditemukan di database.`);
  }

  // Clear old sessions
  try {
    await db
      .delete(schema.userSessions)
      .where(eq(schema.userSessions.userId, targetUser.id));
  } catch {}

  return targetUser;
}


