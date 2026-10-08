import { authNonces } from '@chog-city/server/db';
import { lt } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { db } from '@/server/db';
import { error, json } from '@/server/http';
import { allow, clientIp } from '@/server/rate';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!allow(`nonce:${clientIp(req)}`, 10, 0.5)) return error('SLOW_DOWN', 429);
  // Fresh random bytes each time: viem's generateSiweNonce slides along one random string, so each nonce
  // shares all but one character with the one before it.
  const nonce = randomBytes(24).toString('hex');
  await (await db()).delete(authNonces).where(lt(authNonces.createdAt, new Date(Date.now() - 15 * 60_000)));
  await (await db()).insert(authNonces).values({ nonce });
  return json({ nonce });
}
