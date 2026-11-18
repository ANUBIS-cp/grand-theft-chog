import { dropPushSub, pushPublicKey, savePushSub } from '@chog-city/server';
import { z } from 'zod';
import { db } from '@/server/db';
import { error, json } from '@/server/http';
import { allow } from '@/server/rate';
import { currentAddress } from '@/server/session';

export const dynamic = 'force-dynamic';

// Raid alerts: the key a phone needs to subscribe, and turning alerts on and off for the signed-in wallet.

export async function GET() {
  return json({ ok: true, key: pushPublicKey() });
}

const Sub = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
});

export async function POST(req: Request) {
  const address = await currentAddress();
  if (!address) return error('login', 401);
  if (!allow(`push:${address}`, 10, 0.2)) return error('slow-down', 429);
  const body = Sub.safeParse(await req.json().catch(() => null));
  if (!body.success) return error('bad-request');
  await savePushSub(await db(), address, body.data);
  return json({ ok: true });
}

export async function DELETE(req: Request) {
  const address = await currentAddress();
  if (!address) return error('login', 401);
  const body = z.object({ endpoint: z.string().max(1000) }).safeParse(await req.json().catch(() => null));
  if (!body.success) return error('bad-request');
  await dropPushSub(await db(), address, body.data.endpoint);
  return json({ ok: true });
}
