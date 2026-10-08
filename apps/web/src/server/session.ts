import { sessions } from '@chog-city/server/db';
import { and, eq, gt } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { db } from './db';

const COOKIE = 'cc_session';
const DAYS = 7;
const hash = (v: string) => createHash('sha256').update(v).digest('hex');

export async function createSession(address: string): Promise<void> {
  const value = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + DAYS * 86_400_000);
  await db()
    .insert(sessions)
    .values({ idHash: hash(value), address: address.toLowerCase(), expiresAt });
  (await cookies()).set(COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

/** The logged-in wallet (lowercase), or null. */
export async function currentAddress(): Promise<string | null> {
  const value = (await cookies()).get(COOKIE)?.value;
  if (!value) return null;
  const [s] = await db()
    .select({ address: sessions.address })
    .from(sessions)
    .where(and(eq(sessions.idHash, hash(value)), gt(sessions.expiresAt, new Date())));
  return s?.address ?? null;
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const value = jar.get(COOKIE)?.value;
  if (value)
    await db()
      .delete(sessions)
      .where(eq(sessions.idHash, hash(value)));
  jar.delete(COOKIE);
}
