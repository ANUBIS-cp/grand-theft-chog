import { FightRefused, startFightRun } from '@chog-city/server';
import { z } from 'zod';
import { db } from '@/server/db';
import { error, json } from '@/server/http';
import { allow } from '@/server/rate';
import { currentAddress } from '@/server/session';

export const dynamic = 'force-dynamic';

const Body = z.object({ chog: z.number().int().min(1).max(5000) });

/** Starts the next fight of tonight's card for one of your Chogs: the server picks the seed. */
export async function POST(req: Request) {
  // Fight Night is off the site (see app/fight/page.tsx).
  if (process.env.NODE_ENV === 'production') return error('closed', 410);
  const address = await currentAddress();
  if (!address) return error('login', 401);
  if (!allow(`fight-start:${address}`, 20, 0.3)) return error('slow-down', 429);
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return error('bad-request');
  try {
    return json({ ok: true, fight: await startFightRun(await db(), { address, chogId: body.data.chog, now: Date.now() }) });
  } catch (e) {
    if (e instanceof FightRefused) return error(e.code, 409);
    throw e;
  }
}
