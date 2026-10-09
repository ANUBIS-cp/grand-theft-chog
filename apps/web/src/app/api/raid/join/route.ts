import { displayName, getChog } from '@chog-city/data';
import { HeistRefused, joinRaid } from '@chog-city/server';
import { makeRaidPass } from '@chog-city/server/ticket';
import { z } from 'zod';
import { db } from '@/server/db';
import { error, json } from '@/server/http';
import { allow } from '@/server/rate';
import { currentAddress } from '@/server/session';

export const dynamic = 'force-dynamic';

const Body = z.object({ runId: z.string().min(8).max(40), chogId: z.number().int().min(1).max(1969) });

/** Jump into a raid on your gang's vault as a guard: a pass for the live server's raid room. */
export async function POST(req: Request) {
  const address = await currentAddress();
  if (!address) return error('login', 401);
  if (!allow(`join:${address}`, 10, 0.5)) return error('slow-down', 429);
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return error('bad-request');
  try {
    const { run } = await joinRaid(await db(), { address, ...body.data, now: Date.now() });
    const chog = getChog(body.data.chogId)!;
    return json({ ok: true, pass: makeRaidPass({ role: 'defend', run, chog: chog.id, name: displayName(chog) }) });
  } catch (e) {
    if (e instanceof HeistRefused) return error(e.code, 409);
    throw e;
  }
}
