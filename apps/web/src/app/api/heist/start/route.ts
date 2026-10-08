import { GANG_IDS, displayName, getChog } from '@chog-city/data';
import { HeistRefused, startRun } from '@chog-city/server';
import { z } from 'zod';
import { db } from '@/server/db';
import { error, json } from '@/server/http';
import { allow } from '@/server/rate';
import { currentAddress } from '@/server/session';

export const dynamic = 'force-dynamic';

const Body = z.object({ chogId: z.number().int().min(1).max(1969), target: z.enum(GANG_IDS) });

export async function POST(req: Request) {
  const address = await currentAddress();
  if (!address) return error('login', 401);
  if (!allow(`start:${address}`, 10, 0.2)) return error('slow-down', 429);
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return error('bad-request');
  try {
    const run = await startRun(await db(), { address, ...body.data, now: Date.now() });
    return json({
      ok: true,
      run: { ...run, guards: run.guards.map((id) => ({ id, name: displayName(getChog(id)!) })) },
    });
  } catch (e) {
    if (e instanceof HeistRefused) return error(e.code, 409);
    throw e;
  }
}
