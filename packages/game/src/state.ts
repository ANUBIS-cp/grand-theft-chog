import {
  JAIL_BASE_HOURS,
  JAIL_HOURS_PER_STAR,
  HOUR,
  LEVEL_XP,
  MAX_WANTED,
  MOVES_PER_DAY,
  STARTING_CASH,
  WANTED_DECAY_MS,
} from './constants.ts';
import { dayOf } from './time.ts';
import type { ChogState, Stats } from './types.ts';

export const emptyStats = (): Stats => ({
  jobsWon: 0,
  jobsLost: 0,
  cashEarned: 0,
  biggestPayout: 0,
  robWins: 0,
  robLosses: 0,
  timesRobbed: 0,
  cashLostToRobbers: 0,
  arrestsMade: 0,
  timesArrested: 0,
  jailHours: 0,
  crewJobs: 0,
  bigJobs: 0,
  jailbreaks: 0,
});

/** Every Chog starts like this on day one, played or not. */
export function newChogState(id: number, now: number): ChogState {
  return {
    id,
    active: false,
    gang: null,
    gangDay: null,
    cash: STARTING_CASH,
    xp: 0,
    wanted: 0,
    wantedAt: now,
    jailUntil: 0,
    day: dayOf(now),
    movesUsed: 0,
    timesRobbedToday: 0,
    doneToday: [],
    actionSeq: 0,
    revenge: [],
    crewId: null,
    stats: emptyStats(),
  };
}

/** Stars right now, after wearing off one per 6 hours since the last change. */
export function currentWanted(s: Pick<ChogState, 'wanted' | 'wantedAt'>, now: number): number {
  const drops = Math.floor(Math.max(0, now - s.wantedAt) / WANTED_DECAY_MS);
  return Math.max(0, s.wanted - drops);
}

/**
 * Brings a state up to `now`: a new game day resets the daily counters, stars wear off, a finished jail
 * term ends, and expired revenge is dropped. Every rule calls this first, so stored states can be stale.
 */
export function refresh(s: ChogState, now: number): ChogState {
  const day = dayOf(now);
  const next: ChogState = { ...s, revenge: s.revenge.filter((r) => r.until > now) };
  if (s.day !== day) {
    next.day = day;
    next.movesUsed = 0;
    next.timesRobbedToday = 0;
    next.doneToday = [];
  }
  const drops = Math.floor(Math.max(0, now - s.wantedAt) / WANTED_DECAY_MS);
  if (drops > 0) {
    next.wanted = Math.max(0, s.wanted - drops);
    next.wantedAt = next.wanted === 0 ? now : s.wantedAt + drops * WANTED_DECAY_MS;
  }
  if (s.jailUntil && s.jailUntil <= now) next.jailUntil = 0;
  return next;
}

/** Changes stars and restarts the 6-hour wear-off clock. */
export function addWanted(s: ChogState, delta: number, now: number): ChogState {
  const wanted = Math.min(MAX_WANTED, Math.max(0, currentWanted(s, now) + delta));
  return { ...s, wanted, wantedAt: now };
}

export function inJail(s: ChogState, now: number): boolean {
  return s.jailUntil > now;
}

export function movesLeft(s: ChogState, now: number): number {
  return s.day === dayOf(now) ? Math.max(0, MOVES_PER_DAY - s.movesUsed) : MOVES_PER_DAY;
}

/** Jail time is 2 hours plus 1 per star. Going to jail clears the stars: time served. */
export function sendToJail(s: ChogState, now: number): ChogState {
  const stars = currentWanted(s, now);
  const hours = JAIL_BASE_HOURS + JAIL_HOURS_PER_STAR * stars;
  return {
    ...s,
    jailUntil: now + hours * HOUR,
    wanted: 0,
    wantedAt: now,
    stats: { ...s.stats, jailHours: s.stats.jailHours + hours },
  };
}

export function levelOf(xp: number): number {
  let level = 1;
  for (let i = 0; i < LEVEL_XP.length; i++) if (xp >= LEVEL_XP[i]!) level = i + 1;
  return level;
}

/** XP still needed for the next level, or 0 at the top. */
export function xpToNext(xp: number): number {
  const level = levelOf(xp);
  return level >= LEVEL_XP.length ? 0 : LEVEL_XP[level]! - xp;
}
