import { canJoinGang, type Chog, type GangId } from '@chog-city/data';
import {
  ARREST,
  BAIL_CASH_PER_HOUR,
  GANG_SWITCH_COOLDOWN_DAYS,
  HELD_DISTRICT_PAY_BONUS,
  HOUR,
  ROB,
  XP,
  XP_ON_FAIL_SHARE,
} from './constants.ts';
import { findOffer, type JobOffer } from './board.ts';
import { passes, roll, rollLabel } from './dice.ts';
import { arrestOdds, canFill, jobOdds, robOdds } from './odds.ts';
import { addWanted, currentWanted, inJail, levelOf, movesLeft, refresh, sendToJail } from './state.ts';
import { dayOf } from './time.ts';
import { fail, ok, type ChogInfo, type ChogState, type Ctx, type GameEvent, type Result } from './types.ts';

export interface Outcome {
  state: ChogState;
  events: GameEvent[];
}

/** Adds XP and emits a level event when a level is crossed. */
export function gainXp(s: ChogState, xp: number, events: GameEvent[]): ChogState {
  const before = levelOf(s.xp);
  const next = { ...s, xp: s.xp + xp };
  const after = levelOf(next.xp);
  if (after > before) events.push({ type: 'level', chogId: s.id, level: after });
  return next;
}

/** Pay for one member, with the bonus for working in a district your gang holds. */
export function memberPay(base: number, s: ChogState, offer: JobOffer, ctx: Ctx): number {
  const held = s.gang !== null && ctx.holders[offer.district] === s.gang;
  return Math.floor(base * (held ? 1 + HELD_DISTRICT_PAY_BONUS : 1));
}

/** Common checks before a Chog spends a move. */
function canAct(s: ChogState, ctx: Ctx): Result<true> {
  if (inJail(s, ctx.now)) return fail('IN_JAIL');
  if (movesLeft(s, ctx.now) <= 0) return fail('NO_MOVES');
  return ok(true);
}

/** Solo and legal jobs: one Chog, one move, the result right away. */
export function doSoloJob(ctx: Ctx, info: ChogInfo, prev: ChogState, offerKey: string): Result<Outcome> {
  let s = refresh(prev, ctx.now);
  const can = canAct(s, ctx);
  if (!can.ok) return can;
  const offer = findOffer(dayOf(ctx.now), offerKey, ctx.events);
  if (!offer) return fail('UNKNOWN_JOB');
  const { job, district } = offer;
  if (job.kind !== 'solo' && job.kind !== 'legal') return fail('WRONG_JOB_TYPE');
  if (levelOf(s.xp) < job.minLevel) return fail('LEVEL_TOO_LOW');
  if (!canFill(info, job.slots[0]!)) return fail('MISSING_SKILL');
  if (s.doneToday.includes(offer.key)) return fail('DONE_TODAY');

  const { odds } = jobOdds(job, [{ info, state: s }], district, ctx);
  const label = rollLabel('job', info.id, s.actionSeq);
  const r = roll(ctx.seed, label);
  const success = passes(r, odds);
  const events: GameEvent[] = [];

  s = {
    ...s,
    active: true,
    movesUsed: s.movesUsed + 1,
    actionSeq: s.actionSeq + 1,
    doneToday: [...s.doneToday, offer.key],
  };
  let pay = 0;
  let jailedUntil = 0;
  const fullXp = XP[job.kind];
  const xp = success ? fullXp : Math.floor(fullXp * XP_ON_FAIL_SHARE);
  if (success) {
    pay = memberPay(offer.pay, s, offer, ctx);
    s = addWanted(s, job.wantedOnSuccess, ctx.now);
    s = {
      ...s,
      cash: s.cash + pay,
      stats: {
        ...s.stats,
        jobsWon: s.stats.jobsWon + 1,
        cashEarned: s.stats.cashEarned + pay,
        biggestPayout: Math.max(s.stats.biggestPayout, pay),
      },
    };
  } else {
    s = addWanted(s, job.wantedOnFail, ctx.now);
    s = { ...s, stats: { ...s.stats, jobsLost: s.stats.jobsLost + 1 } };
    if (job.jailChanceOnFail > 0 && passes(roll(ctx.seed, `${label}:jail`), job.jailChanceOnFail)) {
      s = sendToJail(s, ctx.now);
      s = { ...s, stats: { ...s.stats, timesArrested: s.stats.timesArrested + 1 } };
      jailedUntil = s.jailUntil;
    }
  }
  events.push({
    type: 'job',
    chogId: info.id,
    gang: s.gang,
    jobId: job.id,
    district,
    crewId: null,
    success,
    roll: r,
    odds,
    pay,
    turf: success ? job.turf : 0,
    xp,
    wanted: currentWanted(s, ctx.now),
    jailedUntil,
    rollLabel: label,
  });
  s = gainXp(s, xp, events);
  return ok({ state: s, events });
}

export interface RobOutcome {
  attacker: ChogState;
  target: ChogState;
  events: GameEvent[];
}

/**
 * Rob another Chog. Costs a move unless it is revenge (you were robbed by this Chog in the last 24 hours).
 * `sameOwner` comes from the server: you can't rob your own Chogs.
 */
export function rob(
  ctx: Ctx,
  aInfo: ChogInfo,
  aPrev: ChogState,
  tInfo: ChogInfo,
  tPrev: ChogState,
  opts: { sameOwner: boolean },
): Result<RobOutcome> {
  if (aInfo.id === tInfo.id) return fail('SELF');
  if (opts.sameOwner) return fail('SAME_OWNER');
  let a = refresh(aPrev, ctx.now);
  let t = refresh(tPrev, ctx.now);
  const revengeIdx = a.revenge.findIndex((r) => r.against === tInfo.id);
  const revenge = revengeIdx >= 0;
  if (inJail(a, ctx.now)) return fail('IN_JAIL');
  if (!revenge && movesLeft(a, ctx.now) <= 0) return fail('NO_MOVES');
  if (inJail(t, ctx.now)) return fail('TARGET_IN_JAIL');
  const limit = t.active ? ROB.maxTimesRobbedPerDay : ROB.maxTimesRobbedPerDayInactive;
  if (t.timesRobbedToday >= limit) return fail('TARGET_ROBBED_OUT');

  const { odds } = robOdds(aInfo, tInfo, revenge);
  const label = rollLabel('rob', aInfo.id, a.actionSeq);
  const r = roll(ctx.seed, label);
  const success = passes(r, odds);
  const events: GameEvent[] = [];

  a = {
    ...a,
    active: true,
    actionSeq: a.actionSeq + 1,
    movesUsed: revenge ? a.movesUsed : a.movesUsed + 1,
    revenge: revenge ? a.revenge.filter((_, i) => i !== revengeIdx) : a.revenge,
  };
  let loot = 0;
  let jailedUntil = 0;
  if (success) {
    const cap = t.active ? ROB.lootMax : ROB.inactiveLootMax;
    loot = Math.max(0, Math.min(Math.floor(t.cash * ROB.lootShare), cap));
    a = addWanted(a, ROB.wantedOnSuccess, ctx.now);
    a = {
      ...a,
      cash: a.cash + loot,
      stats: { ...a.stats, robWins: a.stats.robWins + 1, cashEarned: a.stats.cashEarned + loot },
    };
    t = {
      ...t,
      cash: t.cash - loot,
      timesRobbedToday: t.timesRobbedToday + 1,
      stats: {
        ...t.stats,
        timesRobbed: t.stats.timesRobbed + 1,
        cashLostToRobbers: t.stats.cashLostToRobbers + loot,
      },
      // Only players get revenge; there is nobody to use it on an unplayed Chog.
      revenge: t.active
        ? [
            ...t.revenge.filter((x) => x.against !== aInfo.id),
            { against: aInfo.id, until: ctx.now + ROB.revengeWindowMs },
          ]
        : t.revenge,
    };
  } else {
    a = addWanted(a, ROB.wantedOnFail, ctx.now);
    a = { ...a, stats: { ...a.stats, robLosses: a.stats.robLosses + 1 } };
    if (passes(roll(ctx.seed, `${label}:jail`), ROB.jailChanceOnFail)) {
      a = sendToJail(a, ctx.now);
      a = { ...a, stats: { ...a.stats, timesArrested: a.stats.timesArrested + 1 } };
      jailedUntil = a.jailUntil;
    }
  }
  events.push({
    type: 'rob',
    chogId: aInfo.id,
    target: tInfo.id,
    revenge,
    success,
    roll: r,
    odds,
    loot,
    jailedUntil,
    rollLabel: label,
  });
  a = gainXp(a, success ? XP.rob : Math.floor(XP.rob * XP_ON_FAIL_SHARE), events);
  return ok({ attacker: a, target: t, events });
}

/** Guards (and 1:1s) can arrest Chogs with 3 or more stars. The city pays a bounty per star. */
export function arrest(
  ctx: Ctx,
  gInfo: ChogInfo,
  gPrev: ChogState,
  tInfo: ChogInfo,
  tPrev: ChogState,
  opts: { sameOwner: boolean; posterBounty?: number },
): Result<RobOutcome> {
  if (gInfo.id === tInfo.id) return fail('SELF');
  if (opts.sameOwner) return fail('SAME_OWNER');
  if (!gInfo.wildcard && !gInfo.skills.includes('guard')) return fail('NOT_A_GUARD');
  let g = refresh(gPrev, ctx.now);
  let t = refresh(tPrev, ctx.now);
  const can = canAct(g, ctx);
  if (!can.ok) return can;
  if (inJail(t, ctx.now)) return fail('TARGET_IN_JAIL');
  const stars = currentWanted(t, ctx.now);
  if (stars < ARREST.minTargetWanted) return fail('TARGET_NOT_WANTED');

  const { odds } = arrestOdds(g);
  const label = rollLabel('arrest', gInfo.id, g.actionSeq);
  const r = roll(ctx.seed, label);
  const success = passes(r, odds);
  const events: GameEvent[] = [];
  g = { ...g, active: true, movesUsed: g.movesUsed + 1, actionSeq: g.actionSeq + 1 };
  let bounty = 0;
  let jailedUntil = 0;
  if (success) {
    bounty = stars * ARREST.bountyPerStar + (opts.posterBounty ?? 0);
    g = {
      ...g,
      cash: g.cash + bounty,
      stats: { ...g.stats, arrestsMade: g.stats.arrestsMade + 1, cashEarned: g.stats.cashEarned + bounty },
    };
    t = sendToJail(t, ctx.now);
    t = { ...t, stats: { ...t.stats, timesArrested: t.stats.timesArrested + 1 } };
    jailedUntil = t.jailUntil;
  }
  events.push({
    type: 'arrest',
    chogId: gInfo.id,
    target: tInfo.id,
    success,
    roll: r,
    odds,
    bounty,
    jailedUntil,
    rollLabel: label,
  });
  g = gainXp(g, success ? XP.arrest : Math.floor(XP.arrest * XP_ON_FAIL_SHARE), events);
  return ok({ attacker: g, target: t, events });
}

export function bailCost(target: ChogState, now: number): number {
  if (!inJail(target, now)) return 0;
  return Math.ceil((target.jailUntil - now) / HOUR) * BAIL_CASH_PER_HOUR;
}

/** Anyone can pay a jailed Chog's bail in cash, including the Chog itself. */
export function payBail(
  ctx: Ctx,
  payerPrev: ChogState,
  targetPrev: ChogState,
): Result<{ payer: ChogState; target: ChogState; events: GameEvent[] }> {
  const self = payerPrev.id === targetPrev.id;
  let t = refresh(targetPrev, ctx.now);
  let p = self ? t : refresh(payerPrev, ctx.now);
  if (!inJail(t, ctx.now)) return fail('NOT_IN_JAIL');
  const cost = bailCost(t, ctx.now);
  if (p.cash < cost) return fail('NOT_ENOUGH_CASH');
  p = { ...p, cash: p.cash - cost };
  t = self ? { ...p, jailUntil: 0 } : { ...t, jailUntil: 0 };
  if (self) p = t;
  return ok({
    payer: p,
    target: t,
    events: [{ type: 'bail', chogId: payerPrev.id, target: targetPrev.id, method: 'cash', cost }],
  });
}

/** Instant release after a confirmed on-chain $CHOG burn (or a successful jailbreak). */
export function release(
  ctx: Ctx,
  targetPrev: ChogState,
  by: { chogId: number; method: 'chog' | 'jailbreak'; cost: number },
): Result<{ target: ChogState; events: GameEvent[] }> {
  const t = refresh(targetPrev, ctx.now);
  if (!inJail(t, ctx.now)) return fail('NOT_IN_JAIL');
  return ok({
    target: { ...t, jailUntil: 0 },
    events: [{ type: 'bail', chogId: by.chogId, target: t.id, method: by.method, cost: by.cost }],
  });
}

/** Pick or switch gang. The first pick is free; after that, once every 7 days. */
export function chooseGang(ctx: Ctx, chog: Chog, prev: ChogState, gang: GangId): Result<Outcome> {
  const s = refresh(prev, ctx.now);
  if (!canJoinGang(chog, gang)) return fail('GANG_NOT_ALLOWED');
  const day = dayOf(ctx.now);
  if (s.gang === gang) return ok({ state: s, events: [] });
  if (s.gang !== null && s.gangDay !== null && day - s.gangDay < GANG_SWITCH_COOLDOWN_DAYS)
    return fail('GANG_COOLDOWN');
  return ok({
    state: { ...s, active: true, gang, gangDay: day },
    events: [{ type: 'gang', chogId: chog.id, gang }],
  });
}
