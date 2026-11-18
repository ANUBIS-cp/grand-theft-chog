import { FightRefused, finishFightRun } from '@chog-city/server';
import { z } from 'zod';
import { db } from '@/server/db';
import { error, json } from '@/server/http';
import { allow } from '@/server/rate';
import { currentAddress } from '@/server/session';

export const dynamic = 'force-dynamic';

const Body = z.object({ id: z.string().min(8).max(40), inputs: z.string().max(40_000) });

/** The browser sends what was pressed each step; the server replays the fight and settles it. */
export async function POST(req: Request) {
  const address = await currentAddress();
  if (!address) return error('login', 401);
  if (!allow(`fight-finish:${address}`, 20, 0.3)) return error('slow-down', 429);
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return error('bad-request');
  try {
    return json({ ok: true, result: await finishFightRun(await db(), { address, ...body.data, now: Date.now() }) });
  } catch (e) {
    if (e instanceof FightRefused) return error(e.code, 409);
    throw e;
  }
}
