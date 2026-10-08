import { recentHits, warBoard } from '@chog-city/server';
import { nextReset } from '@chog-city/game';
import { db } from '@/server/db';
import { json } from '@/server/http';

export const dynamic = 'force-dynamic';

/** Every gang vault with its cash, and the latest hits. */
export async function GET() {
  const d = await db();
  const [board, hits] = await Promise.all([warBoard(d), recentHits(d, 30)]);
  return json({ board, hits, resetAt: nextReset(Date.now()) });
}
