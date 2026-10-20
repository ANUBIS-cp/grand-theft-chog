import { dayOf } from '@chog-city/game';
import { json } from '@/server/http';
import { recapFor, recapLines } from '../../recap/[day]/data';

export const dynamic = 'force-dynamic';

/** A finished day's recap as data (?day=, default yesterday), for the Telegram post. */
export async function GET(req: Request) {
  const day = new URL(req.url).searchParams.get('day') ?? String(dayOf(Date.now()) - 1);
  const r = await recapFor(day);
  if (!r) return json({ ok: false, error: 'not-found' }, { status: 404 });
  const base = `https://${(process.env.PUBLIC_HOST ?? 'grandtheftchog.duckdns.org').split(',')[0]!.trim()}`;
  return json({
    ok: true,
    recap: r,
    lines: recapLines(r),
    quiet: !r.robberies && !r.breakouts.tried,
    url: `${base}/recap/${r.day}`,
    image: `${base}/recap/${r.day}/opengraph-image`,
  });
}
