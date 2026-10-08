import type { DistrictId, GangId, SkillId } from '@chog-city/data';

/** What a Chog is, from its traits. Never changes. */
export interface ChogInfo {
  id: number;
  skills: SkillId[];
  /** Legendary 1:1: counts as any one skill per job. */
  wildcard: boolean;
  home: DistrictId | 'any';
  side: 'Left' | 'Right' | null;
}

export interface Stats {
  jobsWon: number;
  jobsLost: number;
  cashEarned: number;
  biggestPayout: number;
  robWins: number;
  robLosses: number;
  timesRobbed: number;
  cashLostToRobbers: number;
  arrestsMade: number;
  timesArrested: number;
  jailHours: number;
  crewJobs: number;
  bigJobs: number;
  jailbreaks: number;
}

export interface Revenge {
  against: number;
  until: number;
}

/** What a Chog has done so far. Belongs to the token, not the wallet. */
export interface ChogState {
  id: number;
  /** The owner has played at least once. */
  active: boolean;
  gang: GangId | null;
  /** Game day the Chog joined its current gang. */
  gangDay: number | null;
  cash: number;
  xp: number;
  /** Stars as of `wantedAt`; they wear off over time (see `currentWanted`). */
  wanted: number;
  wantedAt: number;
  /** 0 when free. */
  jailUntil: number;
  /** Game day the daily counters below belong to. */
  day: number;
  movesUsed: number;
  timesRobbedToday: number;
  /** Job keys done today ("jobId@district"). */
  doneToday: string[];
  /** Counts every action this Chog starts. Used in roll labels so each roll is unique and checkable. */
  actionSeq: number;
  revenge: Revenge[];
  crewId: string | null;
  stats: Stats;
}

/** What the rules need to know about the world right now. */
export interface Ctx {
  now: number;
  /** This game day's secret seed (hex). */
  seed: string;
  /** Which gang holds each district today. */
  holders: Partial<Record<DistrictId, GangId>>;
  /** Event jobs currently on the board. */
  events: ReadonlySet<'halloween'>;
}

export type GameError =
  | 'IN_JAIL'
  | 'NO_MOVES'
  | 'LEVEL_TOO_LOW'
  | 'MISSING_SKILL'
  | 'DONE_TODAY'
  | 'DISTRICT_CLOSED'
  | 'UNKNOWN_JOB'
  | 'WRONG_JOB_TYPE'
  | 'TARGET_IN_JAIL'
  | 'TARGET_ROBBED_OUT'
  | 'SAME_OWNER'
  | 'SELF'
  | 'NOT_A_GUARD'
  | 'TARGET_NOT_WANTED'
  | 'NOT_IN_JAIL'
  | 'NOT_ENOUGH_CASH'
  | 'GANG_NOT_ALLOWED'
  | 'GANG_COOLDOWN'
  | 'NO_GANG'
  | 'IN_A_CREW'
  | 'CREW_NOT_OPEN'
  | 'SLOT_TAKEN'
  | 'NOT_IN_CREW'
  | 'NOT_LEADER'
  | 'BAD_TARGET';

export interface OddsPart {
  label: string;
  pct: number;
}

export interface Odds {
  odds: number;
  parts: OddsPart[];
}

/** Everything that happens is one of these. The server stores them in order; they are the source of truth. */
export type GameEvent =
  | {
      type: 'job';
      chogId: number;
      gang: GangId | null;
      jobId: string;
      district: DistrictId;
      crewId: string | null;
      success: boolean;
      roll: number;
      odds: number;
      pay: number;
      turf: number;
      xp: number;
      wanted: number;
      jailedUntil: number;
      rollLabel: string;
    }
  | {
      type: 'rob';
      chogId: number;
      target: number;
      revenge: boolean;
      success: boolean;
      roll: number;
      odds: number;
      loot: number;
      jailedUntil: number;
      rollLabel: string;
    }
  | {
      type: 'arrest';
      chogId: number;
      target: number;
      success: boolean;
      roll: number;
      odds: number;
      bounty: number;
      jailedUntil: number;
      rollLabel: string;
    }
  | { type: 'bail'; chogId: number; target: number; method: 'cash' | 'chog' | 'jailbreak'; cost: number }
  | { type: 'gang'; chogId: number; gang: GangId }
  | { type: 'level'; chogId: number; level: number };

/** A move as the player asks for it. Same shape for the server and the practice city. */
export type MoveInput =
  | { action: 'job'; chogId: number; offerKey: string }
  | { action: 'rob'; chogId: number; target: number }
  | { action: 'arrest'; chogId: number; target: number }
  | { action: 'bail'; chogId: number; target: number }
  | { action: 'gang'; chogId: number; gang: import('@chog-city/data').GangId }
  | { action: 'crew.open'; chogId: number; offerKey: string; slot: number; jailbreakTarget?: number }
  | { action: 'crew.join'; chogId: number; crewId: string; slot: number }
  | { action: 'crew.leave'; chogId: number; crewId: string };

export type Result<T> = { ok: true; value: T } | { ok: false; error: GameError };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const fail = <T = never>(error: GameError): Result<T> => ({ ok: false, error });
