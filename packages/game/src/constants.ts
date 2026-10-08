// Every tunable number in one place. The balance simulator (tools/sim) changes these, not the rules code.

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

/** Moves refill and turf flips at 18:00 UTC. */
export const RESET_HOUR_UTC = 18;

export const MOVES_PER_DAY = 5;
export const STARTING_CASH = 100;

export const ODDS_MIN = 5;
export const ODDS_MAX = 95;
export const HELPFUL_SKILL_BONUS = 5;
export const HELPFUL_SKILL_MAX = 20;
export const LEVEL_BONUS_PER_LEVEL = 1;
export const HOME_DISTRICT_BONUS = 5;
export const HELD_DISTRICT_BONUS = 5;
export const HELD_DISTRICT_PAY_BONUS = 0.1;
export const WANTED_PENALTY_PER_STAR = 5;
export const HOT_JOB_PAY_BONUS = 0.5;

export const MAX_WANTED = 5;
/** One star drops off every 6 hours. */
export const WANTED_DECAY_MS = 6 * HOUR;
/** Jail time = base + per star (stars counted before the arrest). */
export const JAIL_BASE_HOURS = 2;
export const JAIL_HOURS_PER_STAR = 1;
/** Cash bail: this much per started hour left. */
export const BAIL_CASH_PER_HOUR = 50;

export const ROB = {
  baseOdds: 50,
  attack: { muscle: 10, blade: 15, stealth: 5 },
  defend: { muscle: 10, guard: 15, blade: 10 },
  revengeBonus: 10,
  revengeWindowMs: 24 * HOUR,
  lootShare: 0.1,
  lootMax: 200,
  /** Owners who never played: robbed at most once a day, for at most this much. */
  inactiveLootMax: 10,
  maxTimesRobbedPerDay: 3,
  maxTimesRobbedPerDayInactive: 1,
  wantedOnSuccess: 1,
  wantedOnFail: 2,
  jailChanceOnFail: 40,
} as const;

export const ARREST = {
  minTargetWanted: 3,
  baseOdds: 60,
  bountyPerStar: 25,
} as const;

/** XP needed to reach each level (index 0 = level 1). */
export const LEVEL_XP = [0, 30, 80, 160, 280, 450, 680, 980, 1360, 1830] as const;
export const MAX_LEVEL = LEVEL_XP.length;
export const XP = { legal: 5, solo: 10, crew: 25, big: 50, rob: 8, arrest: 12 } as const;
/** A failed job still teaches something. */
export const XP_ON_FAIL_SHARE = 0.5;

export const TURF_TOP_CHOGS_COUNTED = 15;
export const GANG_SWITCH_COOLDOWN_DAYS = 7;
