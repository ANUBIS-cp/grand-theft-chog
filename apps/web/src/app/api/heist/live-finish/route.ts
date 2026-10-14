import { HeistRefused, finishLiveRun } from '@chog-city/server';
import { checkInternal } from '@chog-city/server/ticket';
import { z } from 'zod';
import { db } from '@/server/db';
import { error, json } from '@/server/http';
import { withGetaway } from '@/server/raid';

export const dynamic = 'force-dynamic';

const Body = z.object({
  run: z.string().min(8).max(40),
  inputs: z.string().max(5000),
  defenders: z
    .array(
      z.object({
        guard: z.number().int().min(0).max(5),
        name: z.string().max(20),
        chog: z.number().int().min(1).max(1969),
        at: z.number().int().min(0).max(5000),
        moves: z.string().max(5000),
      }),
    )
    .max(4),
});

/** The live server reports a finished raid (signed); the run is replayed with its defenders and settled. */
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
    const result = await finishLiveRun(await db(), {
      runId: body.data.run,
      inputs: body.data.inputs,
      defenders: body.data.defenders,
      now: Date.now(),
    });
    // The robber's screen gets this through the live server: the getaway pass rides along.
    return json({ ok: true, result: withGetaway(body.data.run, result) });
  } catch (e) {
    if (e instanceof HeistRefused) return error(e.code, 409);
    throw e;
  }
}
