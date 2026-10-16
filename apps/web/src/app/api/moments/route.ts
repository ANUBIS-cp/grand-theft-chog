import { GANGS, displayName, getChog } from '@chog-city/data';
import { heistRuns } from '@chog-city/server/db';
import { and, desc, eq, gt, isNotNull, isNull, ne, or } from 'drizzle-orm';
import { db } from '@/server/db';
import { json } from '@/server/http';

export const dynamic = 'force-dynamic';

/** A haul this big or more is worth telling the group about. */
const BIG = 1000;

const money = (n: number) => `$${n.toLocaleString('en-US')}`;
const name = (id: number) => (getChog(id) ? displayName(getChog(id)!) : `Chog ${id}`);

/**
 * The last day's big moments, finished only (a bag still on its way home isn't one yet), with a ready line
 * each: big hauls carried home, and jail break-outs that freed someone. For the Telegram bot's posts.
 */
export async function GET() {
  const since = new Date(Date.now() - 24 * 3_600_000);
  const rows = await (
    await db()
  )
    .select()
    .from(heistRuns)
    .where(
      and(
        isNotNull(heistRuns.finishedAt),
        gt(heistRuns.finishedAt, since),
        eq(heistRuns.result, 'escaped'),
        or(isNull(heistRuns.getaway), ne(heistRuns.getaway, 'running')),
        or(isNotNull(heistRuns.prisoner), gt(heistRuns.moved, BIG - 1)),
      ),
    )
    .orderBy(desc(heistRuns.finishedAt))
    .limit(20);
  // The site's real address (the first name in PUBLIC_HOST).
  const base = `https://${(process.env.PUBLIC_HOST ?? 'chogworld.duckdns.org').split(',')[0]!.trim()}`;
  return json({
    ok: true,
    moments: rows.map((r) => ({
      id: r.id,
      at: r.finishedAt!.getTime(),
      kind: r.prisoner ? 'breakout' : 'haul',
      cash: r.moved ?? 0,
      text: r.prisoner
        ? `${name(r.chogId)} of ${GANGS[r.gang].name} broke ${name(r.prisoner)} out of jail.`
        : `${name(r.chogId)} of ${GANGS[r.gang].name} robbed ${GANGS[r.target].name} and carried ${money(r.moved ?? 0)} home.`,
      url: `${base}/replay/${r.id}`,
      image: `${base}/replay/${r.id}/opengraph-image`,
    })),
  });
}
