import { GANG_IDS, type GangId } from '@chog-city/data';
import { SEASON_1_START, seasonOf, type Season } from '@chog-city/game';
import { START_CASH } from '@chog-city/game/heist';
import { and, asc, desc, eq, gte, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { gangVaults, heistRuns, seasonTitles, seasonsClosed, type Db } from './db/index.ts';

// Monthly seasons (the owner's roadmap): when a season ends, the richest gang, the top robber and the best guard
// get a title written onto their Chogs for good (it belongs to the token, so it stays when the Chog is sold),
// and every gang vault starts the next season with the same cash.
//
// - Richest gang: the biggest vault when the season ends (a tie goes to the gang that stole more that season).
//   The title goes on every Chog of that gang that robbed a vault or caught a robber that season.
// - Top robber: the Chog that stole the most cash that season (escapes only, bags that got home).
// - Best guard: the Chog that caught the most robbers that season (a tie goes to the one that stopped more cash).
// A title needs something real behind it: a season where nobody robbed anyone hands out none.

export type TitleKind = 'gang' | 'robber' | 'guard';
export const TITLE_NAME: Record<TitleKind, string> = {
  gang: 'Richest Gang',
  robber: 'Top Robber',
  guard: 'Best Guard',
};

export interface GangStanding {
  gang: GangId;
  cash: number;
  stolen: number;
}
export interface ChogStanding {
  chogId: number;
  gang: GangId;
  amount: number;
  /** Tie-break: escapes for a robber, cash stopped for a guard. */
  second: number;
}
export interface Standings {
  season: Season;
  gangs: GangStanding[];
  robbers: ChogStanding[];
  guards: ChogStanding[];
}

const inSeason = (s: Season) =>
  and(gte(heistRuns.finishedAt, new Date(s.from)), lt(heistRuns.finishedAt, new Date(s.to)));
/** A real robbery, not a jail break-out; for escapes, only a bag that made it home (or had no run home). */
const robbery = isNull(heistRuns.prisoner);
const banked = or(isNull(heistRuns.getaway), eq(heistRuns.getaway, 'home'));

/** Who leads a season right now (or led it, for one that's over), best first. */
export async function standings(db: Db, season: Season, limit = 5): Promise<Standings> {
  const [vaultRows, stolenRows, robbers, guards] = await Promise.all([
    db.select({ gang: gangVaults.gang, cash: gangVaults.cash }).from(gangVaults),
    db
      .select({ gang: heistRuns.gang, n: sql<number>`coalesce(sum(${heistRuns.moved}), 0)::int` })
      .from(heistRuns)
      .where(and(inSeason(season), robbery, eq(heistRuns.result, 'escaped'), banked))
      .groupBy(heistRuns.gang),
    db
      .select({
        chogId: heistRuns.chogId,
        gang: sql<GangId>`min(${heistRuns.gang})`,
        amount: sql<number>`sum(${heistRuns.moved})::int`,
        second: sql<number>`count(*)::int`,
      })
      .from(heistRuns)
      .where(and(inSeason(season), robbery, eq(heistRuns.result, 'escaped'), banked))
      .groupBy(heistRuns.chogId)
      .orderBy(desc(sql`sum(${heistRuns.moved})`), desc(sql`count(*)`), asc(heistRuns.chogId))
      .limit(limit),
    db
      .select({
        chogId: sql<number>`${heistRuns.caughtBy}`,
        gang: sql<GangId>`min(${heistRuns.target})`,
        amount: sql<number>`count(*)::int`,
        second: sql<number>`coalesce(sum(${heistRuns.moved}), 0)::int`,
      })
      .from(heistRuns)
      .where(
        and(
          inSeason(season),
          robbery,
          eq(heistRuns.result, 'busted'),
          sql`${heistRuns.caughtBy} is not null`,
        ),
      )
      .groupBy(heistRuns.caughtBy)
      .orderBy(desc(sql`count(*)`), desc(sql`sum(${heistRuns.moved})`), asc(heistRuns.caughtBy))
      .limit(limit),
  ]);
  const stolen = new Map(stolenRows.map((r) => [r.gang, r.n]));
  const cash = new Map(vaultRows.map((r) => [r.gang, r.cash]));
  const gangs = GANG_IDS.map((gang) => ({
    gang,
    cash: cash.get(gang) ?? START_CASH,
    stolen: stolen.get(gang) ?? 0,
  })).sort((a, b) => b.cash - a.cash || b.stolen - a.stolen || a.gang.localeCompare(b.gang));
  return {
    season,
    gangs,
    robbers: robbers.filter((r) => r.amount > 0),
    guards: guards.filter((r) => r.amount > 0),
  };
}

/** The Chogs of `gang` that took part in a season: robbed a vault or caught a robber for it. */
async function playedFor(db: Db, gang: GangId, season: Season): Promise<number[]> {
  const rows = await db.execute<{ id: number }>(sql`
    select distinct ${heistRuns.chogId} as id from ${heistRuns}
      where ${heistRuns.gang} = ${gang} and ${inSeason(season)} and ${robbery}
    union
    select distinct ${heistRuns.caughtBy} as id from ${heistRuns}
      where ${heistRuns.target} = ${gang} and ${heistRuns.caughtBy} is not null and ${inSeason(season)}
  `);
  const list = (Array.isArray(rows) ? rows : (rows as { rows: { id: number }[] }).rows) as { id: number }[];
  return list.map((r) => Number(r.id)).sort((a, b) => a - b);
}

/**
 * Ends every season that is over and not closed yet (the worker calls this every minute): writes the titles,
 * then starts the vaults fresh. Safe to call again; a season is only ever closed once. Returns the seasons closed.
 */
export async function closeSeasons(db: Db, now: number): Promise<number[]> {
  const current = seasonOf(now);
  if (!current || current.n < 2) return [];
  const done = new Set((await db.select({ n: seasonsClosed.season }).from(seasonsClosed)).map((r) => r.n));
  const closed: number[] = [];
  for (let n = 1; n < current.n; n++) {
    if (done.has(n)) continue;
    const season = seasonOfNumber(n);
    const ok = await db.transaction(async (tx) => {
      const t = tx as unknown as Db;
      // Lock the vaults (and the season row) so a robbery finishing now can't land between the result and the reset.
      await tx.select().from(gangVaults).for('update');
      const [already] = await tx
        .select()
        .from(seasonsClosed)
        .where(eq(seasonsClosed.season, n))
        .for('update');
      if (already) return false;
      const s = await standings(t, season, 1);
      const titles: (typeof seasonTitles.$inferInsert)[] = [];
      const anyRobbery = s.gangs.some((g) => g.stolen > 0) || s.guards.length > 0;
      const top = s.gangs[0];
      // The vault only counts at the last season's close: an older season closed late has no vault to judge.
      if (anyRobbery && top && n === current.n - 1)
        for (const chogId of await playedFor(t, top.gang, season))
          titles.push({ season: n, kind: 'gang', chogId, gang: top.gang, amount: top.cash });
      const robber = s.robbers[0];
      if (robber)
        titles.push({
          season: n,
          kind: 'robber',
          chogId: robber.chogId,
          gang: robber.gang,
          amount: robber.amount,
        });
      const guard = s.guards[0];
      if (guard)
        titles.push({
          season: n,
          kind: 'guard',
          chogId: guard.chogId,
          gang: guard.gang,
          amount: guard.amount,
        });
      if (titles.length) await tx.insert(seasonTitles).values(titles).onConflictDoNothing();
      await tx.insert(seasonsClosed).values({ season: n, closedAt: new Date(now), standings: s });
      if (n === current.n - 1)
        await tx
          .update(gangVaults)
          .set({ cash: START_CASH, guardLevel: 0, guardUntil: null, guardBy: null, updatedAt: new Date(now) })
          .where(inArray(gangVaults.gang, [...GANG_IDS]));
      await tx
        .execute(sql`select pg_notify('city', ${JSON.stringify({ season: n })})`)
        .catch(() => undefined);
      return true;
    });
    if (ok) closed.push(n);
  }
  return closed;
}

/** Season number `n`'s dates. */
export function seasonOfNumber(n: number): Season {
  // Season 1 is November 2026; season n starts on the first of the (n-1)th month after it.
  const start = n === 1 ? SEASON_1_START : Date.UTC(2026, 10 + n - 1, 1);
  return seasonOf(start)!;
}

export interface ChogTitle {
  season: number;
  kind: TitleKind;
  name: string;
  gang: GangId;
  amount: number;
}

/** Every season title these Chogs carry, newest season first. */
export async function titlesFor(db: Db, chogIds: number[]): Promise<Map<number, ChogTitle[]>> {
  const out = new Map<number, ChogTitle[]>();
  if (!chogIds.length) return out;
  const rows = await db
    .select()
    .from(seasonTitles)
    .where(inArray(seasonTitles.chogId, chogIds))
    .orderBy(desc(seasonTitles.season), asc(seasonTitles.kind));
  for (const r of rows) {
    const list = out.get(r.chogId) ?? [];
    list.push({ season: r.season, kind: r.kind, name: TITLE_NAME[r.kind], gang: r.gang, amount: r.amount });
    out.set(r.chogId, list);
  }
  return out;
}

export interface PastSeason {
  season: number;
  gang: GangId | null;
  robber: number | null;
  guard: number | null;
}

/** For the season board: who's leading now, when it ends, and the winners of seasons gone by. */
export async function seasonBoard(db: Db, now: number) {
  const season = seasonOf(now);
  if (!season) return null;
  const [live, rows] = await Promise.all([
    standings(db, season, 5),
    db.select().from(seasonTitles).orderBy(desc(seasonTitles.season)),
  ]);
  const past = new Map<number, PastSeason>();
  for (const r of rows) {
    const p = past.get(r.season) ?? { season: r.season, gang: null, robber: null, guard: null };
    if (r.kind === 'gang') p.gang = r.gang;
    else p[r.kind] = r.chogId;
    past.set(r.season, p);
  }
  return {
    season: season.n,
    endsAt: season.to,
    startCash: START_CASH,
    gangs: live.gangs.slice(0, 3),
    robbers: live.robbers,
    guards: live.guards,
    past: [...past.values()],
  };
}
