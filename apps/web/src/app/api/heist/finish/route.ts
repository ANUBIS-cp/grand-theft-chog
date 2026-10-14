import { HeistRefused, finishRun } from '@chog-city/server';
import { z } from 'zod';
import { db } from '@/server/db';
import { error, json } from '@/server/http';
import { withGetaway } from '@/server/raid';
import { allow } from '@/server/rate';
import { currentAddress } from '@/server/session';

export const dynamic = 'force-dynamic';

const Body = z.object({ runId: z.string().min(8).max(40), inputs: z.string().max(5000) });

/** The browser sends what was pressed each tick; the server replays the run and settles it. */
export async function POST(req: Request) {
  const address = await currentAddress();
  if (!address) return error('login', 401);
  if (!allow(`finish:${address}`, 10, 0.5)) return error('slow-down', 429);
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return error('bad-request');
  try {
    return json({
      ok: true,
      result: withGetaway(
        body.data.runId,
        await finishRun(await db(), { address, ...body.data, now: Date.now() }),
      ),
    });
  } catch (e) {
    if (e instanceof HeistRefused) return error(e.code, 409);
    throw e;
  }
}
