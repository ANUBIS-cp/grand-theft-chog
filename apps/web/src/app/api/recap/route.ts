import { dayOf } from '@chog-city/game';
import { recap } from '@chog-city/server';
import { db } from '@/server/db';
import { error, json } from '@/server/http';

export const dynamic = 'force-dynamic';

/** A day's recap. Defaults to yesterday (the last finished day). */
export async function GET(req: Request) {
  const today = dayOf(Date.now());
  const day = Number(new URL(req.url).searchParams.get('day') ?? today - 1);
  if (!Number.isInteger(day) || day > today || day < today - 60) return error('BAD_REQUEST');
  return json(await recap(await db(), day));
}
