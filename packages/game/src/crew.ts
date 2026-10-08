import { gainXp, memberPay } from './actions.ts';
import { findOffer } from './board.ts';
import { XP, XP_ON_FAIL_SHARE } from './constants.ts';
import { passes, roll, rollLabel } from './dice.ts';
import type { Slot } from './jobs.ts';
import { canFill, jobOdds, type Member } from './odds.ts';
import { addWanted, currentWanted, inJail, levelOf, movesLeft, refresh, sendToJail } from './state.ts';
import { dayOf } from './time.ts';
import { fail, ok, type ChogInfo, type ChogState, type Ctx, type GameEvent, type Result } from './types.ts';

export interface Crew {
  /** Given by the server in order ("<day>-<n>"); it is part of the roll label. */
  id: string;
  day: number;
  offerKey: string;
  leaderId: number;
  /** Chog ID in each slot, or null while open. Slot order matches the job's slots. */
  slots: (number | null)[];
  /** Jailbreak only: the jailed Chog this crew is breaking out. */
  jailbreakTarget: number | null;
  status: 'open' | 'done' | 'cancelled' | 'expired';
  createdAt: number;
}

function joinChecks(
  ctx: Ctx,
  crewDay: number,
  offerKey: string,
  info: ChogInfo,
  s: ChogState,
  slot: Slot | undefined,
): Result<true> {
  if (!slot) return fail('BAD_TARGET');
  if (inJail(s, ctx.now)) return fail('IN_JAIL');
  if (movesLeft(s, ctx.now) <= 0) return fail('NO_MOVES');
  if (s.crewId) return fail('IN_A_CREW');
  if (s.doneToday.includes(offerKey)) return fail('DONE_TODAY');
  if (crewDay !== dayOf(ctx.now)) return fail('CREW_NOT_OPEN');
  if (!canFill(info, slot)) return fail('MISSING_SKILL');
  return ok(true);
}

/** The leader opens a crew job, takes one slot and spends a move to hold it. */
export function openCrew(
  ctx: Ctx,
  crewId: string,
  leader: ChogInfo,
  prev: ChogState,
  offerKey: string,
  slotIndex: number,
  jailbreak?: { target: ChogState },
): Result<{ crew: Crew; state: ChogState }> {
  const s = refresh(prev, ctx.now);
  const day = dayOf(ctx.now);
  const offer = findOffer(day, offerKey, ctx.events);
  if (!offer) return fail('UNKNOWN_JOB');
  const { job } = offer;
  if (job.kind !== 'crew' && job.kind !== 'big') return fail('WRONG_JOB_TYPE');
  if (levelOf(s.xp) < job.minLevel) return fail('LEVEL_TOO_LOW');
  const check = joinChecks(ctx, day, offer.key, leader, s, job.slots[slotIndex]);
  if (!check.ok) return check;
  let jailbreakTarget: number | null = null;
  if (job.special === 'jailbreak') {
    if (!jailbreak || jailbreak.target.id === leader.id || !inJail(jailbreak.target, ctx.now))
      return fail('BAD_TARGET');
    jailbreakTarget = jailbreak.target.id;
  }
  const slots: (number | null)[] = job.slots.map(() => null);
  slots[slotIndex] = leader.id;
  return ok({
    crew: {
      id: crewId,
      day,
      offerKey: offer.key,
      leaderId: leader.id,
      slots,
      jailbreakTarget,
      status: 'open',
      createdAt: ctx.now,
    },
    state: { ...s, active: true, movesUsed: s.movesUsed + 1, crewId },
  });
}

/** Another Chog takes an open slot. `full` tells the caller to resolve the job now. */
export function joinCrew(
  ctx: Ctx,
  crew: Crew,
  info: ChogInfo,
  prev: ChogState,
  slotIndex: number,
): Result<{ crew: Crew; state: ChogState; full: boolean }> {
  if (crew.status !== 'open') return fail('CREW_NOT_OPEN');
  const s = refresh(prev, ctx.now);
  const offer = findOffer(crew.day, crew.offerKey, ctx.events);
  if (!offer) return fail('UNKNOWN_JOB');
  if (crew.slots[slotIndex] !== null)
    return fail(slotIndex < crew.slots.length ? 'SLOT_TAKEN' : 'BAD_TARGET');
  if (crew.slots.includes(info.id)) return fail('IN_A_CREW');
  if (crew.jailbreakTarget === info.id) return fail('BAD_TARGET');
  if (levelOf(s.xp) < offer.job.minLevel) return fail('LEVEL_TOO_LOW');
  const check = joinChecks(ctx, crew.day, crew.offerKey, info, s, offer.job.slots[slotIndex]);
  if (!check.ok) return check;
  const slots = [...crew.slots];
  slots[slotIndex] = info.id;
  return ok({
    crew: { ...crew, slots },
    state: { ...s, active: true, movesUsed: s.movesUsed + 1, crewId: crew.id },
    full: slots.every((x) => x !== null),
  });
}

/** A member leaves and gets the move back. If the leader leaves, the crew is cancelled. */
export function leaveCrew(ctx: Ctx, crew: Crew, prev: ChogState): Result<{ crew: Crew; state: ChogState }> {
  if (crew.status !== 'open') return fail('CREW_NOT_OPEN');
  if (!crew.slots.includes(prev.id)) return fail('NOT_IN_CREW');
  const s = refresh(prev, ctx.now);
  const refunded = {
    ...s,
    crewId: null,
    movesUsed: s.day === crew.day ? Math.max(0, s.movesUsed - 1) : s.movesUsed,
  };
  if (prev.id === crew.leaderId) return ok({ crew: { ...crew, status: 'cancelled' }, state: refunded });
  return ok({ crew: { ...crew, slots: crew.slots.map((x) => (x === prev.id ? null : x)) }, state: refunded });
}

/** Members of a cancelled crew get their move back (call for each member except the one who left). */
export function refundCancelled(ctx: Ctx, crew: Crew, prev: ChogState): ChogState {
  const s = refresh(prev, ctx.now);
  if (s.crewId !== crew.id) return s;
  return { ...s, crewId: null, movesUsed: s.day === crew.day ? Math.max(0, s.movesUsed - 1) : s.movesUsed };
}

/** Clears the crew from a member's state when the crew expired at the reset. */
export function clearExpired(prev: ChogState, crew: Crew): ChogState {
  return prev.crewId === crew.id ? { ...prev, crewId: null } : prev;
}

export interface CrewOutcome {
  crew: Crew;
  members: ChogState[];
  /** The freed Chog's new state (jailbreak only). */
  freed: ChogState | null;
  success: boolean;
  events: GameEvent[];
}

/**
 * Runs a full crew job: one roll for the job, then one jail roll per member if it failed.
 * `members` must be in slot order and match `crew.slots`.
 */
export function resolveCrew(
  ctx: Ctx,
  crew: Crew,
  members: Member[],
  jailbreakTarget?: ChogState,
): Result<CrewOutcome> {
  if (crew.status !== 'open' || crew.slots.some((x) => x === null)) return fail('CREW_NOT_OPEN');
  if (members.length !== crew.slots.length || members.some((m, i) => m.info.id !== crew.slots[i]))
    return fail('BAD_TARGET');
  const offer = findOffer(crew.day, crew.offerKey, ctx.events);
  if (!offer) return fail('UNKNOWN_JOB');
  const { job, district } = offer;
  const fresh = members.map((m) => ({ info: m.info, state: refresh(m.state, ctx.now) }));
  // The leader first: the leader's gang decides the "your gang holds this district" bonus.
  const ordered = [...fresh].sort((a, b) =>
    a.info.id === crew.leaderId ? -1 : b.info.id === crew.leaderId ? 1 : 0,
  );
  const { odds } = jobOdds(job, ordered, district, ctx);
  const label = rollLabel('crew', crew.id);
  const r = roll(ctx.seed, label);
  const success = passes(r, odds);
  const events: GameEvent[] = [];
  const share = Math.floor(offer.pay / members.length);
  const fullXp = XP[job.kind];

  const out = fresh.map(({ info, state }) => {
    let s: ChogState = {
      ...state,
      crewId: null,
      actionSeq: state.actionSeq + 1,
      doneToday: [...state.doneToday, offer.key],
    };
    let pay = 0;
    let jailedUntil = 0;
    if (success) {
      pay = memberPay(share, s, offer, ctx);
      s = addWanted(s, job.wantedOnSuccess, ctx.now);
      s = {
        ...s,
        cash: s.cash + pay,
        stats: {
          ...s.stats,
          jobsWon: s.stats.jobsWon + 1,
          crewJobs: s.stats.crewJobs + 1,
          bigJobs: s.stats.bigJobs + (job.kind === 'big' ? 1 : 0),
          jailbreaks: s.stats.jailbreaks + (job.special === 'jailbreak' ? 1 : 0),
          cashEarned: s.stats.cashEarned + pay,
          biggestPayout: Math.max(s.stats.biggestPayout, pay),
        },
      };
    } else {
      s = addWanted(s, job.wantedOnFail, ctx.now);
      s = { ...s, stats: { ...s.stats, jobsLost: s.stats.jobsLost + 1, crewJobs: s.stats.crewJobs + 1 } };
      if (passes(roll(ctx.seed, `${label}:jail:${info.id}`), job.jailChanceOnFail)) {
        s = sendToJail(s, ctx.now);
        s = { ...s, stats: { ...s.stats, timesArrested: s.stats.timesArrested + 1 } };
        jailedUntil = s.jailUntil;
      }
    }
    const xp = success ? fullXp : Math.floor(fullXp * XP_ON_FAIL_SHARE);
    events.push({
      type: 'job',
      chogId: info.id,
      gang: s.gang,
      jobId: job.id,
      district,
      crewId: crew.id,
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
    return gainXp(s, xp, events);
  });

  let freed: ChogState | null = null;
  if (job.special === 'jailbreak' && jailbreakTarget && success) {
    const t = refresh(jailbreakTarget, ctx.now);
    if (inJail(t, ctx.now)) {
      freed = { ...t, jailUntil: 0 };
      events.push({ type: 'bail', chogId: crew.leaderId, target: t.id, method: 'jailbreak', cost: 0 });
    }
  }
  return ok({ crew: { ...crew, status: 'done' }, members: out, freed, success, events });
}
