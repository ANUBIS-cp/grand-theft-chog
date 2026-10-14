import { HeistRefused, finishGetaway } from '@chog-city/server';
import { checkInternal } from '@chog-city/server/ticket';
import { z } from 'zod';
import { db } from '@/server/db';
import { error, json } from '@/server/http';

export const dynamic = 'force-dynamic';

const Body = z.object({
  run: z.string().min(8).max(40),
  outcome: z.enum(['home', 'caught']),
  by: z.number().int().min(1).max(1969).nullable(),
});

/** The live server reports how a getaway ended (signed): bag home, or caught on the way. */
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
    const result = await finishGetaway(await db(), {
      runId: body.data.run,
      outcome: body.data.outcome,
      by: body.data.by,
      now: Date.now(),
    });
    return json({ ok: true, result });
  } catch (e) {
    if (e instanceof HeistRefused) return error(e.code, 409);
    throw e;
  }
}
