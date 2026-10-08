import { recentHits, robbing, warBoard } from '@chog-city/server';
import { nextReset } from '@chog-city/game';
import { db } from '@/server/db';
import { json } from '@/server/http';

export const dynamic = 'force-dynamic';

/** Every gang vault with its cash, the latest hits, and the vaults being robbed right now. */
export async function GET() {
  const d = await db();
  const now = Date.now();
  const [board, hits, live] = await Promise.all([warBoard(d), recentHits(d, 30), robbing(d, now)]);
  return json({ board, hits, robbing: live, resetAt: nextReset(now) });
}
