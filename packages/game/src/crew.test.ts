import { describe, expect, it } from 'vitest';
import { findOffer } from './board.ts';
import { HOUR, MOVES_PER_DAY } from './constants.ts';
import {
  clearExpired,
  joinCrew,
  leaveCrew,
  openCrew,
  refundCancelled,
  resolveCrew,
  type Crew,
} from './crew.ts';
import { rollLabel } from './dice.ts';
import { jobOdds } from './odds.ts';
import { addWanted, sendToJail } from './state.ts';
import { T0, chogWith, chogWithout, ctxAt, player, seedWhere } from './test-helpers.ts';
import { dayOf } from './time.ts';
import type { ChogState } from './types.ts';

function mustOk<T>(r: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

// "Con a whale": slots Smooth, Money; level 2 needed.
const WHALE = 'con-whale@purple-hill';
const lvl2 = (s: ChogState): ChogState => ({ ...s, xp: 30 });
const smooth = player(chogWith('smooth', ['money']));
const money = player(chogWith('money', ['smooth']));
smooth.state = lvl2(smooth.state);
money.state = lvl2(money.state);

function fullCrew(seed = '00'.repeat(32)) {
  const ctx = ctxAt(T0, seed);
  const a = mustOk(openCrew(ctx, `${dayOf(T0)}-1`, smooth.info, smooth.state, WHALE, 0));
  const b = mustOk(joinCrew(ctx, a.crew, money.info, money.state, 1));
  return { ctx, crew: b.crew, leader: a.state, member: b.state, full: b.full };
}

describe('crew jobs', () => {
  it('opens with the leader in a slot and a move held', () => {
    const { crew, leader, member, full } = fullCrew();
    expect(crew.slots).toEqual([smooth.info.id, money.info.id]);
    expect(leader.movesUsed).toBe(1);
    expect(leader.crewId).toBe(crew.id);
    expect(member.crewId).toBe(crew.id);
    expect(full).toBe(true);
  });

  it('checks level, skill, slot and one crew at a time', () => {
    const ctx = ctxAt();
    const low = player(chogWith('smooth'));
    expect(openCrew(ctx, 'x', low.info, low.state, WHALE, 0)).toEqual({ ok: false, error: 'LEVEL_TOO_LOW' });
    expect(openCrew(ctx, 'x', money.info, money.state, WHALE, 0)).toEqual({
      ok: false,
      error: 'MISSING_SKILL',
    });
    expect(openCrew(ctx, 'x', smooth.info, smooth.state, 'skim-atm@mon-square', 0)).toEqual({
      ok: false,
      error: 'WRONG_JOB_TYPE',
    });
    const a = mustOk(openCrew(ctx, 'x', smooth.info, smooth.state, WHALE, 0));
    expect(joinCrew(ctx, a.crew, money.info, money.state, 0)).toEqual({ ok: false, error: 'SLOT_TAKEN' });
    expect(openCrew(ctx, 'y', smooth.info, a.state, WHALE, 0)).toEqual({ ok: false, error: 'IN_A_CREW' });
    const other = player(chogWithout(['money']));
    expect(joinCrew(ctx, a.crew, other.info, lvl2(other.state), 1)).toEqual({
      ok: false,
      error: 'MISSING_SKILL',
    });
  });

  it('pays every member an even share on success', () => {
    const offer = findOffer(dayOf(T0), WHALE, new Set())!;
    const odds = jobOdds(offer.job, [smooth, money], offer.district, ctxAt()).odds;
    const seed = seedWhere(rollLabel('crew', `${dayOf(T0)}-1`), (r) => r <= odds);
    const { ctx, crew, leader, member } = fullCrew(seed);
    const out = mustOk(
      resolveCrew(ctx, crew, [
        { info: smooth.info, state: leader },
        { info: money.info, state: member },
      ]),
    );
    expect(out.success).toBe(true);
    const share = Math.floor(offer.pay / 2);
    expect(out.members.map((m) => m.cash)).toEqual([100 + share, 100 + share]);
    expect(out.members.every((m) => m.crewId === null && m.doneToday.includes(WHALE))).toBe(true);
    expect(out.events.filter((e) => e.type === 'job')).toHaveLength(2);
    expect(out.crew.status).toBe('done');
  });

  it('can jail members one by one when it fails', () => {
    const offer = findOffer(dayOf(T0), WHALE, new Set())!;
    const odds = jobOdds(offer.job, [smooth, money], offer.district, ctxAt()).odds;
    const label = rollLabel('crew', `${dayOf(T0)}-1`);
    const seed = seedWhere(label, (r) => r > odds, {
      label: `${label}:jail:${smooth.info.id}`,
      pred: (r) => r <= 50,
    });
    const { ctx, crew, leader, member } = fullCrew(seed);
    const out = mustOk(
      resolveCrew(ctx, crew, [
        { info: smooth.info, state: leader },
        { info: money.info, state: member },
      ]),
    );
    expect(out.success).toBe(false);
    expect(out.members[0]!.jailUntil).toBeGreaterThan(T0);
    expect(out.members.every((m) => m.cash === 100)).toBe(true);
  });

  it('refunds moves when a member leaves or the leader cancels', () => {
    const { ctx, crew, leader, member } = fullCrew();
    const left = mustOk(leaveCrew(ctx, crew, member));
    expect(left.state.movesUsed).toBe(0);
    expect(left.crew.slots).toEqual([smooth.info.id, null]);
    const cancelled = mustOk(leaveCrew(ctx, crew, leader));
    expect(cancelled.crew.status).toBe('cancelled');
    expect(refundCancelled(ctx, cancelled.crew, member).movesUsed).toBe(0);
    expect(clearExpired(member, crew).crewId).toBeNull();
  });

  it('refuses to resolve an unfilled crew or the wrong members', () => {
    const ctx = ctxAt();
    const a = mustOk(openCrew(ctx, 'x', smooth.info, smooth.state, WHALE, 0));
    expect(resolveCrew(ctx, a.crew, [{ info: smooth.info, state: a.state }])).toEqual({
      ok: false,
      error: 'CREW_NOT_OPEN',
    });
    const { crew, leader } = fullCrew();
    expect(
      resolveCrew(ctx, crew, [
        { info: smooth.info, state: leader },
        { info: smooth.info, state: leader },
      ]),
    ).toEqual({ ok: false, error: 'BAD_TARGET' });
  });

  it('jailbreak frees its target on success', () => {
    const jb = 'jailbreak@lemon-row';
    const bird = player(chogWith('jailbird'));
    const runner = player(chogWith('runner'));
    const muscle = player(chogWith('muscle'));
    for (const p of [bird, runner, muscle]) p.state = lvl2(p.state);
    const prisoner = player(chogWithout(['jailbird', 'runner', 'muscle']));
    const jailed = sendToJail(addWanted(prisoner.state, 2, T0), T0);
    const ctx0 = ctxAt();
    expect(openCrew(ctx0, 'j', bird.info, bird.state, jb, 0)).toEqual({ ok: false, error: 'BAD_TARGET' });
    const offer = findOffer(dayOf(T0), jb, new Set())!;
    const odds = jobOdds(offer.job, [bird, runner, muscle], offer.district, ctx0).odds;
    const seed = seedWhere(rollLabel('crew', 'j'), (r) => r <= odds);
    const ctx = ctxAt(T0, seed);
    let c: Crew = mustOk(openCrew(ctx, 'j', bird.info, bird.state, jb, 0, { target: jailed })).crew;
    const r1 = mustOk(joinCrew(ctx, c, runner.info, runner.state, 1));
    c = r1.crew;
    const r2 = mustOk(joinCrew(ctx, c, muscle.info, muscle.state, 2));
    expect(r2.full).toBe(true);
    const out = mustOk(
      resolveCrew(
        ctx,
        r2.crew,
        [
          { info: bird.info, state: { ...bird.state, crewId: 'j', movesUsed: 1 } },
          { info: runner.info, state: r1.state },
          { info: muscle.info, state: r2.state },
        ],
        jailed,
      ),
    );
    expect(out.freed?.jailUntil).toBe(0);
    expect(out.events.some((e) => e.type === 'bail' && e.method === 'jailbreak')).toBe(true);
  });

  it("closes yesterday's crews", () => {
    const { crew } = fullCrew();
    const tomorrow = ctxAt(T0 + 24 * HOUR);
    const late = player(chogWith('money'));
    expect(
      joinCrew(tomorrow, { ...crew, slots: [crew.slots[0]!, null] }, late.info, lvl2(late.state), 1),
    ).toEqual({ ok: false, error: 'CREW_NOT_OPEN' });
    expect(MOVES_PER_DAY).toBe(5);
  });
});
