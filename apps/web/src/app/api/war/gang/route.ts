import { GANG_IDS } from '@chog-city/data';
import { HeistRefused, setGang } from '@chog-city/server';
import { z } from 'zod';
import { db } from '@/server/db';
import { error, json } from '@/server/http';
import { currentAddress } from '@/server/session';

export const dynamic = 'force-dynamic';

const Body = z.object({ chogId: z.number().int().min(1).max(1969), gang: z.enum(GANG_IDS) });

/** Picks a Chog's gang. It's for good: a Chog reps one gang. */
export async function POST(req: Request) {
  const address = await currentAddress();
  if (!address) return error('login', 401);
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return error('bad-request');
  try {
    await setGang(await db(), address, body.data.chogId, body.data.gang);
    return json({ ok: true });
  } catch (e) {
    if (e instanceof HeistRefused) return error(e.code, 409);
    throw e;
  }
}
