import { HeistRefused, lockRun } from '@chog-city/server';
import { z } from 'zod';
import { db } from '@/server/db';
import { error, json } from '@/server/http';
import { allow } from '@/server/rate';
import { robberPass } from '@/server/raid';
import { currentAddress } from '@/server/session';

export const dynamic = 'force-dynamic';

const Body = z.object({ runId: z.string().min(8).max(40), inputs: z.string().max(1000) });

/** Stage 1 done: the server replays the break-in (quiet or loud) and hands out the pass into the vault. */
export async function POST(req: Request) {
  const address = await currentAddress();
  if (!address) return error('login', 401);
  if (!allow(`lock:${address}`, 10, 0.2)) return error('slow-down', 429);
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return error('bad-request');
  try {
    const { loud, chog, run } = await lockRun(await db(), { address, ...body.data, now: Date.now() });
    return json({
      ok: true,
      loud,
      // The live server runs the raid, so the robbed gang can jump in and defend.
      pass: robberPass(run, chog, loud),
    });
  } catch (e) {
    if (e instanceof HeistRefused) return error(e.code, 409);
    throw e;
  }
}
