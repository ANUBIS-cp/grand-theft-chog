import { GANG_IDS } from '@chog-city/data';
import { HeistRefused, claimPumpkin } from '@chog-city/server';
import { checkInternal } from '@chog-city/server/ticket';
import { z } from 'zod';
import { db } from '@/server/db';
import { error, json } from '@/server/http';

export const dynamic = 'force-dynamic';

const Body = z.object({
  id: z.string().min(6).max(24),
  chog: z.number().int().min(1).max(1969),
  gang: z.enum(GANG_IDS as unknown as [string, ...string[]]),
  cash: z.number().int().min(0),
  gold: z.boolean(),
  at: z.number(),
});

/** The live server reports a pumpkin a Chog reached first (signed): its cash goes to the Chog's gang. */
export async function POST(req: Request) {
  const text = await req.text();
  if (!checkInternal(text, req.headers.get('x-city-mac'))) return error('forbidden', 403);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return error('bad-request');
  }
  const body = Body.safeParse(raw);
  if (!body.success) return error('bad-request');
  try {
    const r = await claimPumpkin(await db(), {
      ...body.data,
      gang: body.data.gang as (typeof GANG_IDS)[number],
      now: Date.now(),
    });
    return json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof HeistRefused) return error(e.code, 409);
    throw e;
  }
}
