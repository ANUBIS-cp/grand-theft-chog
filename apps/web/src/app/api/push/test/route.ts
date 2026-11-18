import { testPush } from '@chog-city/server';
import { db } from '@/server/db';
import { error, json } from '@/server/http';
import { allow } from '@/server/rate';
import { currentAddress } from '@/server/session';

export const dynamic = 'force-dynamic';

/** "Send me a test alert": to every phone of the signed-in wallet, right away. */
export async function POST() {
  const address = await currentAddress();
  if (!address) return error('login', 401);
  if (!allow(`push-test:${address}`, 3, 0.05)) return error('slow-down', 429);
  return json({ ok: true, sent: await testPush(await db(), address, Date.now()) });
}
