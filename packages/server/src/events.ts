import { getChog, type GangId } from '@chog-city/data';
import {
  BLOOD_MOON_BONUS,
  HALLOWEEN_NIGHT,
  HALLOWEEN_WEEK,
  SPOOKY_GANGS,
  bloodMoon,
  nextBloodMoon,
} from '@chog-city/game';
import { and, gte, isNotNull, lt } from 'drizzle-orm';
import { heistRuns, type Db } from './db/index.ts';
import { wantedBonus } from './hunts.ts';

// Judging-week events, on fixed dates (UTC). EVENTS=off in the server's settings turns them all off.
//
// Left vs Right election (24-26 Oct): every robbery carried home and every break-out that frees someone
// scores a point for the Chog's Side trait. A side's score is its points per Chog of that side who played, so
// Right's bigger headcount (1,309 to 650) can't decide it. For the next three days the winning side's hauls are
// worth 20% more.
//
// Halloween week (27-31 Oct): the undead and the toxic, Skulls and Radioactive, take 25% more; on Halloween
// itself (31 Oct) every haul counts double. While the Blood Moon is up (every 20 minutes during judging) hauls
// take half as much again (the calendar is in packages/game/src/season.ts, shared with the live server).

export const ELECTION = { from: Date.UTC(2026, 9, 24), to: Date.UTC(2026, 9, 27) };
export const WINNERS_UNTIL = Date.UTC(2026, 9, 30);
export { HALLOWEEN_NIGHT, HALLOWEEN_WEEK };

export const WINNERS_BONUS = 20;
export const SPOOKY_BONUS = 25;
export const HALLOWEEN_NIGHT_BONUS = 100;
export { BLOOD_MOON_BONUS };

export type Side = 'Left' | 'Right';

const eventsOn = () => (process.env.EVENTS ?? 'on').toLowerCase() !== 'off';
const within = (t: number, w: { from: number; to: number }) => t >= w.from && t < w.to;

export const sideOf = (chogId: number): Side | null => {
  const s = getChog(chogId)?.traits.Side;
  return s === 'Left' || s === 'Right' ? s : null;
};

export interface SideScore {
  points: number;
  players: number;
  /** Points per Chog that played. */
  score: number;
}

export interface Election {
  left: SideScore;
  right: SideScore;
  leader: Side | null;
}

/** The election's standings from the runs in its window (up to `now`). */
export async function election(db: Db, now: number): Promise<Election> {
  const to = Math.min(now, ELECTION.to);
  const rows =
    to <= ELECTION.from
      ? []
      : await db
          .select({
            chogId: heistRuns.chogId,
            result: heistRuns.result,
            getaway: heistRuns.getaway,
            prisoner: heistRuns.prisoner,
            moved: heistRuns.moved,
          })
          .from(heistRuns)
          .where(
            and(
              isNotNull(heistRuns.finishedAt),
              gte(heistRuns.startedAt, new Date(ELECTION.from)),
              lt(heistRuns.startedAt, new Date(to)),
            ),
          );
  const tally = {
    Left: { points: 0, players: new Set<number>() },
    Right: { points: 0, players: new Set<number>() },
  };
  for (const r of rows) {
    const side = sideOf(r.chogId);
    if (!side) continue;
    tally[side].players.add(r.chogId);
    const scored =
      r.result === 'escaped' && r.getaway !== 'running' && (r.prisoner !== null || (r.moved ?? 0) > 0);
    if (scored) tally[side].points++;
  }
  const score = (s: Side): SideScore => {
    const t = tally[s];
    const players = t.players.size;
    return { points: t.points, players, score: players ? Math.round((t.points / players) * 100) / 100 : 0 };
  };
  const left = score('Left');
  const right = score('Right');
  const leader = left.score === right.score ? null : left.score > right.score ? 'Left' : 'Right';
  return { left, right, leader };
}

/** Extra percent on a haul for a run that started at `at`: the election's winners, Halloween. */
export async function eventBonus(db: Db, chogId: number, gang: GangId, at: number): Promise<number> {
  // Most Wanted is every day, not a judging-week event.
  const wanted = await wantedBonus(db, chogId, at);
  if (!eventsOn()) return wanted;
  let bonus = wanted;
  if (at >= ELECTION.to && at < WINNERS_UNTIL) {
    const side = sideOf(chogId);
    if (side && (await election(db, ELECTION.to)).leader === side) bonus += WINNERS_BONUS;
  }
  if (within(at, HALLOWEEN_WEEK) && SPOOKY_GANGS.includes(gang)) bonus += SPOOKY_BONUS;
  if (within(at, HALLOWEEN_NIGHT)) bonus += HALLOWEEN_NIGHT_BONUS;
  if (bloodMoon(at)) bonus += BLOOD_MOON_BONUS;
  return bonus;
}

export type EventNow =
  | { kind: 'election'; until: number; election: Election }
  | { kind: 'winners'; until: number; side: Side | null }
  | null;

export interface EventsNow {
  /** The election, or its winners' days after it. */
  side: EventNow;
  halloween: { until: number; night: boolean } | null;
  /** The Blood Moon up now, or the next one. */
  moon: { from: number; to: number; up: boolean } | null;
}

/** What's on now in a few words: the big screen's line, and the banner shown once a day. */
export function eventText(e: EventsNow): { key: string; screen: string; title: string; line: string }[] {
  const out: { key: string; screen: string; title: string; line: string }[] = [];
  const s = e.side;
  if (s?.kind === 'election') {
    const { left, right } = s.election;
    out.push({
      key: 'election',
      screen: `LEFT ${left.score.toFixed(2)} · RIGHT ${right.score.toFixed(2)} PER CHOG`,
      title: 'Left vs Right',
      line: 'Every bag you carry home scores for your Chog’s side, counted per Chog that plays. Winners take 20% more for 3 days.',
    });
  } else if (s?.kind === 'winners' && s.side) {
    out.push({
      key: `winners-${s.side}`,
      screen: `${s.side.toUpperCase()} WON · +${WINNERS_BONUS}% HAULS`,
      title: `${s.side} won the vote`,
      line: `${s.side} Chogs take ${WINNERS_BONUS}% more on every haul until 30 Oct.`,
    });
  }
  // Its banner once a day (the moonrise itself shows every time), so the key doesn't change with each moon.
  if (e.moon?.up)
    out.push({
      key: 'blood-moon',
      screen: `BLOOD MOON · +${BLOOD_MOON_BONUS}% HAULS · PUMPKINS OUT`,
      title: 'The Blood Moon is up',
      line: `Until it sets every vault is haunted, hauls pay ${BLOOD_MOON_BONUS}% more, and pumpkins full of cash are all over the city. First Chog to one keeps it.`,
    });
  if (e.halloween)
    out.push(
      e.halloween.night
        ? {
            key: 'halloween-night',
            screen: 'HALLOWEEN · EVERY HAUL X2',
            title: 'Halloween night',
            line: 'Every haul counts double today.',
          }
        : {
            key: 'halloween',
            screen: `SKULLS + RADIOACTIVE +${SPOOKY_BONUS}%`,
            title: 'Halloween week',
            line: `Skulls and Radioactive take ${SPOOKY_BONUS}% more all week. On the 31st every haul counts double.`,
          },
    );
  return out;
}

/** What's on now, for the city's big screen and banner. */
export async function eventsNow(db: Db, now: number): Promise<EventsNow> {
  if (!eventsOn()) return { side: null, halloween: null, moon: null };
  let side: EventNow = null;
  if (within(now, ELECTION))
    side = { kind: 'election', until: ELECTION.to, election: await election(db, now) };
  else if (now >= ELECTION.to && now < WINNERS_UNTIL)
    side = { kind: 'winners', until: WINNERS_UNTIL, side: (await election(db, ELECTION.to)).leader };
  const halloween = within(now, HALLOWEEN_WEEK)
    ? { until: HALLOWEEN_WEEK.to, night: within(now, HALLOWEEN_NIGHT) }
    : null;
  const next = nextBloodMoon(now);
  const moon = next ? { ...next, up: now >= next.from } : null;
  return { side, halloween, moon };
}
