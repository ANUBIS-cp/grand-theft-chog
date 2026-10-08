import { activeEvents, ensureDay } from '@chog-city/server';
import { dayOf, fullBoard, nextReset } from '@chog-city/game';
import { db } from '@/server/db';
import { json } from '@/server/http';

export const dynamic = 'force-dynamic';

export async function GET() {
  const now = Date.now();
  const day = dayOf(now);
  const row = await ensureDay(db(), day);
  const offers = fullBoard(day, activeEvents(now)).map((o) => ({
    key: o.key,
    district: o.district,
    pay: o.pay,
    hot: o.hot,
    job: o.job,
  }));
  return json({
    day,
    now,
    nextReset: nextReset(now),
    holders: row.holders,
    changes: row.changes,
    commitment: row.commitment,
    offers,
  });
}
