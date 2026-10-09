import { displayName, getChog } from '@chog-city/data';
import { HeistRefused, startBreakout } from '@chog-city/server';
import { z } from 'zod';
import { db } from '@/server/db';
import { error, json } from '@/server/http';
import { allow } from '@/server/rate';
import { robberPass } from '@/server/raid';
import { currentAddress } from '@/server/session';

export const dynamic = 'force-dynamic';

const Body = z.object({
  chogId: z.number().int().min(1).max(1969),
  prisoner: z.number().int().min(1).max(1969),
});

/** Starts a break-out: your Chog sneaks into the jail to free a gang-mate. Finish it like any run. */
export async function POST(req: Request) {
  const address = await currentAddress();
  if (!address) return error('login', 401);
  if (!allow(`start:${address}`, 10, 0.2)) return error('slow-down', 429);
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return error('bad-request');
  try {
    const run = await startBreakout(await db(), { address, ...body.data, now: Date.now() });
    return json({
      ok: true,
      run: { ...run, guards: run.guards.map((id) => ({ id, name: displayName(getChog(id)!) })) },
      // The live server runs the raid, so the robbed gang can jump in and defend.
      pass: robberPass(run, body.data.chogId),
    });
  } catch (e) {
    if (e instanceof HeistRefused) return error(e.code, 409);
    throw e;
  }
}
