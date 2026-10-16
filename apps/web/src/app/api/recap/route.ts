import { dayOf } from '@chog-city/game';
import { json } from '@/server/http';
import { recapFor, recapLines } from '../../recap/[day]/data';

export const dynamic = 'force-dynamic';

/** A finished day's recap as data (?day=, default yesterday), for the Telegram post. */
export async function GET(req: Request) {
  const day = new URL(req.url).searchParams.get('day') ?? String(dayOf(Date.now()) - 1);
  const r = await recapFor(day);
  if (!r) return json({ ok: false, error: 'not-found' }, { status: 404 });
  return json({ ok: true, recap: r, lines: recapLines(r), url: `/recap/${r.day}` });
}
