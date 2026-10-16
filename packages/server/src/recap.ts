import { GANG_IDS, type GangId } from '@chog-city/data';
import { DAY, dayStart } from '@chog-city/game';
import { sql } from 'drizzle-orm';
import type { Db } from './db/index.ts';
import { vaults } from './heists.ts';

// "Yesterday in Chog World": a game day in a few numbers, for the recap page, its share picture and the
// Telegram post. Only facts from the day's runs; the words around them are written in the page.

export interface DayRecap {
  day: number;
  start: number;
  robberies: number;
  /** Got the bag all the way home. */
  home: number;
  /** Caught in the vault or on the way home. */
  caught: number;
  /** Cash carried home. */
  stolen: number;
  biggest: { run: string; chog: number; gang: GangId; target: GangId; cash: number } | null;
  /** The gang that lost the most. */
  hardestHit: { gang: GangId; lost: number; times: number } | null;
  /** The Chog that caught the most robbers. */
  catcher: { chog: number; catches: number } | null;
  breakouts: { tried: number; freed: number };
  burned: number;
  /** Richest gangs now. */
  top: { gang: GangId; cash: number }[];
}

const rows = <T>(r: unknown) => ((r as { rows?: T[] }).rows ?? (r as T[])) as T[];
const n = (v: unknown) => Number(v ?? 0);

export async function dayRecap(db: Db, day: number): Promise<DayRecap> {
  const totals = rows<Record<string, number>>(
    await db.execute(sql`
      select count(*) filter (where prisoner is null) as robberies,
             count(*) filter (where prisoner is null and result = 'escaped') as home,
             count(*) filter (where prisoner is null and result = 'busted') as caught,
             coalesce(sum(moved) filter (where prisoner is null and result = 'escaped'), 0) as stolen,
             count(*) filter (where prisoner is not null) as tried,
             count(*) filter (where prisoner is not null and result = 'escaped') as freed
      from heist_runs where day = ${day} and finished_at is not null and getaway is distinct from 'running'`),
  )[0];
  const [big] = rows<{ id: string; chog_id: number; gang: GangId; target: GangId; moved: number }>(
    await db.execute(sql`
      select id, chog_id, gang, target, moved from heist_runs
      where day = ${day} and prisoner is null and result = 'escaped' and getaway is distinct from 'running' and moved > 0
      order by moved desc, finished_at limit 1`),
  );
  const [hit] = rows<{ target: GangId; lost: number; times: number }>(
    await db.execute(sql`
      select target, sum(moved)::int as lost, count(*)::int as times from heist_runs
      where day = ${day} and prisoner is null and result = 'escaped' and getaway is distinct from 'running'
      group by target order by lost desc limit 1`),
  );
  const [catcher] = rows<{ caught_by: number; catches: number }>(
    await db.execute(sql`
      select caught_by, count(*)::int as catches from heist_runs
      where day = ${day} and caught_by is not null group by caught_by order by catches desc, caught_by limit 1`),
  );
  const start = dayStart(day);
  const [burn] = rows<{ chog: number }>(
    await db.execute(sql`
      select coalesce(sum(amount), 0)::int as chog from chog_burns
      where at >= ${new Date(start)} and at < ${new Date(start + DAY)}`),
  );
  const v = await vaults(db);
  const top = [...GANG_IDS]
    .map((gang) => ({ gang, cash: v[gang].cash }))
    .sort((a, b) => b.cash - a.cash)
    .slice(0, 3);
  return {
    day,
    start,
    robberies: n(totals?.robberies),
    home: n(totals?.home),
    caught: n(totals?.caught),
    stolen: n(totals?.stolen),
    biggest: big
      ? { run: big.id, chog: big.chog_id, gang: big.gang, target: big.target, cash: n(big.moved) }
      : null,
    hardestHit: hit ? { gang: hit.target, lost: n(hit.lost), times: n(hit.times) } : null,
    catcher: catcher ? { chog: catcher.caught_by, catches: n(catcher.catches) } : null,
    breakouts: { tried: n(totals?.tried), freed: n(totals?.freed) },
    burned: n(burn?.chog),
    top,
  };
}
