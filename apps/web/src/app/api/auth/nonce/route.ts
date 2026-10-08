import { authNonces } from '@chog-city/server/db';
import { lt } from 'drizzle-orm';
import { generateSiweNonce } from 'viem/siwe';
import { db } from '@/server/db';
import { error, json } from '@/server/http';
import { allow, clientIp } from '@/server/rate';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!allow(`nonce:${clientIp(req)}`, 10, 0.5)) return error('SLOW_DOWN', 429);
  const nonce = generateSiweNonce();
  await (await db()).delete(authNonces).where(lt(authNonces.createdAt, new Date(Date.now() - 15 * 60_000)));
  await (await db()).insert(authNonces).values({ nonce });
  return json({ nonce });
}
