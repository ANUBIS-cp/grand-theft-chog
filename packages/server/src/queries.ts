import { CHOGS, GANG_IDS, type DistrictId, type GangId, type SkillId } from '@chog-city/data';
import {
  ROB,
  chogInfo,
  currentWanted,
  dayOf,
  inJail,
  turfScores,
  type ChogState,
  type GameEvent,
  type Scores,
} from '@chog-city/game';
import { and, desc, eq, gte, inArray, lt, or, sql } from 'drizzle-orm';
import { chogStates, crews, days, events, owners, type Db } from './db/index.ts';

export interface FeedRow {
  id: number;
  at: number;
  event: GameEvent;
}

const toFeed = (r: typeof events.$inferSelect): FeedRow => ({ id: r.id, at: r.at.getTime(), event: r.data });

async function dayEvents(db: Db, day: number, type?: string): Promise<GameEvent[]> {
  const rows = await db
    .select({ data: events.data })
    .from(events)
    .where(type ? and(eq(events.day, day), eq(events.type, type)) : eq(events.day, day));
  return rows.map((r) => r.data);
}

/** Today's turf points per district and gang (best 5 Chogs per gang counted), and who holds what. */
export async function turfToday(
  db: Db,
  now: number,
): Promise<{ day: number; scores: Scores; holders: Partial<Record<DistrictId, GangId>> }> {
  const day = dayOf(now);
  const [row] = await db.select({ holders: days.holders }).from(days).where(eq(days.day, day));
  return { day, scores: turfScores(await dayEvents(db, day, 'job')), holders: row?.holders ?? {} };
}

export interface TargetRow {
  id: number;
  cash: number;
  wanted: number;
  active: boolean;
  gang: GangId | null;
  jailUntil: number;
  robbedToday: number;
}

const targetRow = (s: ChogState, now: number): TargetRow => ({
  id: s.id,
  cash: s.cash,
  wanted: currentWanted(s, now),
  active: s.active,
  gang: s.gang,
  jailUntil: inJail(s, now) ? s.jailUntil : 0,
  robbedToday: s.day === dayOf(now) ? s.timesRobbedToday : 0,
});

/**
 * Chogs a player might act on: `rob` (richest first, not in jail, not robbed out today), `arrest` (3+ stars),
 * or `jailed` (to bail or break out). Excludes the given owners' own Chogs.
 */
export async function targets(
  db: Db,
  kind: 'rob' | 'arrest' | 'jailed',
  excludeOwners: string[],
  now: number,
  limit = 30,
): Promise<TargetRow[]> {
  const mine = excludeOwners.length
    ? (await db.select({ id: owners.tokenId }).from(owners).where(inArray(owners.owner, excludeOwners))).map(
        (r) => r.id,
      )
    : [];
  const skip = new Set(mine);
  let where;
  if (kind === 'arrest') where = sql`(${chogStates.state}->>'wanted')::int >= 3`;
  else if (kind === 'jailed') where = sql`(${chogStates.state}->>'jailUntil')::bigint > ${now}`;
  else where = sql`(${chogStates.state}->>'jailUntil')::bigint <= ${now}`;
  const rows = await db
    .select()
    .from(chogStates)
    .where(where)
    .orderBy(desc(chogStates.cash), desc(chogStates.active))
    .limit(limit * 4);
  const out: TargetRow[] = [];
  for (const r of rows) {
    if (skip.has(r.id)) continue;
    const t = targetRow(r.state, now);
    if (kind === 'arrest' && t.wanted < 3) continue;
    if (
      kind === 'rob' &&
      t.robbedToday >= (t.active ? ROB.maxTimesRobbedPerDay : ROB.maxTimesRobbedPerDayInactive)
    )
      continue;
    out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}

/** Players' Chogs that have a skill and are free to join a crew, most recently active first. */
export async function finder(
  db: Db,
  skill: SkillId,
  now: number,
  limit = 40,
): Promise<(TargetRow & { lastSeen: number })[]> {
  const ids = CHOGS.filter((c) => {
    const i = chogInfo(c.id);
    return i.wildcard || i.skills.includes(skill);
  }).map((c) => c.id);
  if (!ids.length) return [];
  const rows = await db
    .select()
    .from(chogStates)
    .where(and(inArray(chogStates.id, ids), eq(chogStates.active, true)))
    .orderBy(desc(chogStates.updatedAt))
    .limit(limit * 2);
  return rows
    .filter((r) => !r.state.crewId && !inJail(r.state, now))
    .slice(0, limit)
    .map((r) => ({ ...targetRow(r.state, now), lastSeen: r.updatedAt.getTime() }));
}

export interface GangRow {
  gang: GangId;
  members: number;
  holds: DistrictId[];
  pointsToday: number;
  districtDays: number;
}

/** Gang standings: active members, districts held now, points today, district-days held this season. */
export async function gangStandings(db: Db, now: number): Promise<GangRow[]> {
  const day = dayOf(now);
  const [memberRows, dayRows, scores] = await Promise.all([
    db
      .select({ gang: chogStates.gang, n: sql<number>`count(*)::int` })
      .from(chogStates)
      .where(eq(chogStates.active, true))
      .groupBy(chogStates.gang),
    db.select({ day: days.day, holders: days.holders }).from(days),
    dayEvents(db, day, 'job').then(turfScores),
  ]);
  const members = new Map(memberRows.map((r) => [r.gang, r.n]));
  const today = dayRows.find((r) => r.day === day)?.holders ?? {};
  const held = new Map<GangId, number>();
  for (const r of dayRows)
    for (const g of Object.values(r.holders)) if (g) held.set(g, (held.get(g) ?? 0) + 1);
  const points = new Map<GangId, number>();
  for (const d of Object.values(scores))
    for (const [g, p] of Object.entries(d ?? {}))
      points.set(g as GangId, (points.get(g as GangId) ?? 0) + (p ?? 0));
  return GANG_IDS.map((g) => ({
    gang: g,
    members: members.get(g) ?? 0,
    holds: (Object.entries(today) as [DistrictId, GangId][]).filter(([, h]) => h === g).map(([d]) => d),
    pointsToday: points.get(g) ?? 0,
    districtDays: held.get(g) ?? 0,
  })).sort(
    (a, b) =>
      b.holds.length - a.holds.length ||
      b.districtDays - a.districtDays ||
      b.pointsToday - a.pointsToday ||
      b.members - a.members,
  );
}

export interface Recap {
  day: number;
  jobs: number;
  jobsWon: number;
  robberies: number;
  arrests: number;
  jailed: number;
  biggestJob: FeedRow | null;
  mostRobbed: { id: number; times: number } | null;
  topEarner: { id: number; cash: number } | null;
  changes: { district: DistrictId; from: GangId | null; to: GangId | null }[];
}

/** What happened on one game day, for the daily recap. */
export async function recap(db: Db, day: number): Promise<Recap> {
  const rows = await db.select().from(events).where(eq(events.day, day));
  const [next] = await db
    .select({ changes: days.changes })
    .from(days)
    .where(eq(days.day, day + 1));
  let jobs = 0;
  let jobsWon = 0;
  let robberies = 0;
  let arrests = 0;
  let jailed = 0;
  let biggest: (typeof rows)[number] | null = null;
  const robbed = new Map<number, number>();
  const earned = new Map<number, number>();
  for (const r of rows) {
    const e = r.data;
    const add = (id: number, n: number) => earned.set(id, (earned.get(id) ?? 0) + n);
    if (e.type === 'job') {
      jobs++;
      if (e.success) jobsWon++;
      if (e.jailedUntil) jailed++;
      add(e.chogId, e.pay);
      if (e.success && (!biggest || (biggest.data.type === 'job' && e.pay > biggest.data.pay))) biggest = r;
    } else if (e.type === 'rob') {
      robberies++;
      if (e.jailedUntil) jailed++;
      if (e.success) {
        robbed.set(e.target, (robbed.get(e.target) ?? 0) + 1);
        add(e.chogId, e.loot);
      }
    } else if (e.type === 'arrest' && e.success) {
      arrests++;
      jailed++;
      add(e.chogId, e.bounty);
    }
  }
  const top = <T>(m: Map<number, T>) => [...m.entries()].sort((a, b) => Number(b[1]) - Number(a[1]))[0];
  const mr = top(robbed);
  const te = top(earned);
  return {
    day,
    jobs,
    jobsWon,
    robberies,
    arrests,
    jailed,
    biggestJob: biggest ? toFeed(biggest) : null,
    mostRobbed: mr ? { id: mr[0], times: mr[1] } : null,
    topEarner: te && te[1] > 0 ? { id: te[0], cash: te[1] } : null,
    changes: next?.changes ?? [],
  };
}

/** Things that happened to these Chogs: robbed, arrested, bailed, crew results, level-ups. Newest first. */
export async function inbox(db: Db, chogIds: number[], limit = 40): Promise<FeedRow[]> {
  if (!chogIds.length) return [];
  const rows = await db
    .select()
    .from(events)
    .where(
      or(
        inArray(events.target, chogIds),
        and(inArray(events.chogId, chogIds), eq(events.type, 'level')),
        and(inArray(events.chogId, chogIds), sql`${events.data}->>'crewId' is not null`),
      ),
    )
    .orderBy(desc(events.id))
    .limit(limit);
  return rows.map(toFeed);
}

/** Today's open crews and every crew that includes one of these Chogs. */
export async function crewsFor(db: Db, now: number, chogIds: number[] = []) {
  const day = dayOf(now);
  const open = await db
    .select()
    .from(crews)
    .where(and(eq(crews.day, day), eq(crews.status, 'open')))
    .orderBy(desc(crews.createdAt))
    .limit(200);
  // Slots are a JSON array of numbers, so match with containment (@>), one Chog at a time.
  const mine = chogIds.length
    ? await db
        .select()
        .from(crews)
        .where(
          and(
            gte(crews.day, day - 1),
            or(...chogIds.map((id) => sql`${crews.slots} @> ${JSON.stringify([Number(id)])}::jsonb`)),
          ),
        )
        .orderBy(desc(crews.createdAt))
        .limit(20)
    : [];
  const fix = (r: typeof crews.$inferSelect) => ({ ...r, createdAt: r.createdAt.getTime() });
  return { open: open.map(fix), mine: mine.map(fix) };
}

/** Older events, for the city feed. */
export async function feed(db: Db, before?: number, limit = 50): Promise<FeedRow[]> {
  const q = db.select().from(events);
  const rows = await (before ? q.where(lt(events.id, before)) : q).orderBy(desc(events.id)).limit(limit);
  return rows.map(toFeed);
}
