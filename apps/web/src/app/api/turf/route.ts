import { turfToday } from '@chog-city/server';
import { nextReset } from '@chog-city/game';
import { db } from '@/server/db';
import { json } from '@/server/http';

export const dynamic = 'force-dynamic';

export async function GET() {
  const now = Date.now();
  return json({ ...(await turfToday(await db(), now)), nextReset: nextReset(now) });
}
