import crypto from 'node:crypto';
import { eq, and, gt } from 'drizzle-orm';
import { db, schema, type User } from '@/db';

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

  const id = crypto.randomUUID();
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
