import { CHOGS, getChog, gangOptions } from '@chog-city/data';
import { describe, expect, it } from 'vitest';
import { arrest, bailCost, chooseGang, doSoloJob, payBail, release, rob } from './actions.ts';
import { HOUR, MOVES_PER_DAY, ROB } from './constants.ts';
import { roll, rollLabel } from './dice.ts';
import { infoOf } from './info.ts';
import { jobOdds, robOdds } from './odds.ts';
import { addWanted, newChogState, sendToJail } from './state.ts';
import { T0, chogWith, chogWithout, ctxAt, player, seedWhere } from './test-helpers.ts';
import { dayOf } from './time.ts';
import { findOffer } from './board.ts';

const tech = player(chogWith('tech'));
const ATM = 'skim-atm@mon-square';

function mustOk<T>(r: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

describe('solo jobs', () => {
  it('pays, adds a star and XP, and spends a move on success', () => {
    const offer = findOffer(dayOf(T0), ATM, new Set())!;
    const odds = jobOdds(offer.job, [tech], offer.district, ctxAt()).odds;
    const seed = seedWhere(rollLabel('job', tech.info.id, 0), (r) => r <= odds);
    const out = mustOk(doSoloJob(ctxAt(T0, seed), tech.info, tech.state, ATM));
    const ev = out.events[0]!;
    expect(ev.type).toBe('job');
    if (ev.type !== 'job') return;
    expect(ev.success).toBe(true);
    expect(ev.pay).toBe(offer.pay);
    expect(out.state.cash).toBe(100 + offer.pay);
    expect(out.state.wanted).toBe(1);
    expect(out.state.movesUsed).toBe(1);
    expect(out.state.actionSeq).toBe(1);
    expect(out.state.doneToday).toEqual([ATM]);
    expect(ev.turf).toBe(2);
    expect(ev.roll).toBe(roll(seed, ev.rollLabel));
  });

  it('can fail into jail', () => {
    const offer = findOffer(dayOf(T0), ATM, new Set())!;
    const odds = jobOdds(offer.job, [tech], offer.district, ctxAt()).odds;
    const label = rollLabel('job', tech.info.id, 0);
    const seed = seedWhere(label, (r) => r > odds, {
      label: `${label}:jail`,
      pred: (r) => r <= offer.job.jailChanceOnFail,
    });
    const out = mustOk(doSoloJob(ctxAt(T0, seed), tech.info, tech.state, ATM));
    expect(out.state.cash).toBe(100);
    // one star from failing, then jail clears it: 2 h + 1 h per star
    expect(out.state.jailUntil).toBe(T0 + 3 * HOUR);
    expect(out.state.wanted).toBe(0);
    expect(out.state.stats.jobsLost).toBe(1);
  });

  it('rejects a Chog without the skill', () => {
    const p = player(chogWithout(['tech']));
    expect(doSoloJob(ctxAt(), p.info, p.state, ATM)).toEqual({ ok: false, error: 'MISSING_SKILL' });
  });

  it('allows each job once a day and 5 moves a day', () => {
    const p = player(chogWith('worker'));
    let s = p.state;
    s = mustOk(doSoloJob(ctxAt(), p.info, s, 'clean-streets@lemon-row')).state;
    expect(doSoloJob(ctxAt(), p.info, s, 'clean-streets@lemon-row')).toEqual({
      ok: false,
      error: 'DONE_TODAY',
    });
    s = { ...s, jailUntil: 0, movesUsed: MOVES_PER_DAY };
    expect(doSoloJob(ctxAt(), p.info, s, 'clean-streets@aqua-docks')).toEqual({
      ok: false,
      error: 'NO_MOVES',
    });
  });

  it('rejects jailed Chogs, crew jobs and unknown jobs', () => {
    expect(doSoloJob(ctxAt(), tech.info, sendToJail(tech.state, T0), ATM)).toEqual({
      ok: false,
      error: 'IN_JAIL',
    });
    expect(doSoloJob(ctxAt(), tech.info, tech.state, 'con-whale@purple-hill')).toEqual({
      ok: false,
      error: 'WRONG_JOB_TYPE',
    });
    expect(doSoloJob(ctxAt(), tech.info, tech.state, 'made-up@mon-square')).toEqual({
      ok: false,
      error: 'UNKNOWN_JOB',
    });
  });

  it('lets a Legendary 1:1 fill any skill', () => {
    const legend = CHOGS.find((c) => c.traits.Base === '1:1')!;
    const p = player(legend);
    expect(doSoloJob(ctxAt(), p.info, p.state, ATM).ok).toBe(true);
  });

  it('pays 10% more where your gang holds the district', () => {
    const offer = findOffer(dayOf(T0), ATM, new Set())!;
    const gang = gangOptions(getChog(tech.info.id)!).born[0] ?? 'lazoor';
    const state = { ...tech.state, gang };
    const ctx = { ...ctxAt(), holders: { 'mon-square': gang } } as const;
    const odds = jobOdds(offer.job, [{ info: tech.info, state }], offer.district, ctx).odds;
    const seed = seedWhere(rollLabel('job', tech.info.id, 0), (r) => r <= odds);
    const out = mustOk(doSoloJob({ ...ctx, seed }, tech.info, state, ATM));
    expect(out.state.cash).toBe(100 + Math.floor(offer.pay * 1.1));
  });
});

describe('odds', () => {
  it('shows each part and clamps to 5..95', () => {
    const offer = findOffer(dayOf(T0), ATM, new Set())!;
    const hot = { ...tech, state: addWanted(tech.state, 5, T0) };
    const o = jobOdds(offer.job, [hot], offer.district, ctxAt());
    expect(o.parts.find((p) => p.label.startsWith('Wanted'))?.pct).toBe(-25);
    expect(o.odds).toBe(
      Math.max(
        5,
        Math.min(
          95,
          o.parts.reduce((s, p) => s + p.pct, 0),
        ),
      ),
    );
  });
});

describe('robbing', () => {
  const muscle = player(chogWith('muscle', ['blade', 'stealth']));
  const victim = player(chogWithout(['muscle', 'guard', 'blade']));

  it('takes 10% of the target cash on success and gives the victim revenge', () => {
    const odds = robOdds(muscle.info, victim.info, false).odds;
    expect(odds).toBe(60);
    const seed = seedWhere(rollLabel('rob', muscle.info.id, 0), (r) => r <= odds);
    const v = { ...victim.state, cash: 1000 };
    const out = mustOk(rob(ctxAt(T0, seed), muscle.info, muscle.state, victim.info, v, { sameOwner: false }));
    expect(out.attacker.cash).toBe(200);
    expect(out.target.cash).toBe(900);
    expect(out.attacker.wanted).toBe(1);
    expect(out.target.revenge).toEqual([{ against: muscle.info.id, until: T0 + ROB.revengeWindowMs }]);
    expect(out.target.timesRobbedToday).toBe(1);
  });

  it('caps loot at 200, and at 10 from Chogs whose owner never played', () => {
    const odds = robOdds(muscle.info, victim.info, false).odds;
    const seed = seedWhere(rollLabel('rob', muscle.info.id, 0), (r) => r <= odds);
    const rich = mustOk(
      rob(
        ctxAt(T0, seed),
        muscle.info,
        muscle.state,
        victim.info,
        { ...victim.state, cash: 50_000 },
        { sameOwner: false },
      ),
    );
    expect(rich.attacker.cash - 100).toBe(200);
    const idle = { ...newChogState(victim.info.id, T0) };
    const out = mustOk(
      rob(ctxAt(T0, seed), muscle.info, muscle.state, victim.info, idle, { sameOwner: false }),
    );
    expect(out.attacker.cash - 100).toBe(10);
    expect(out.target.revenge).toEqual([]);
    const again = rob(
      ctxAt(T0, seed),
      { ...muscle.info, id: 999_001 },
      { ...muscle.state, id: 999_001 },
      victim.info,
      out.target,
      { sameOwner: false },
    );
    expect(again).toEqual({ ok: false, error: 'TARGET_ROBBED_OUT' });
  });

  it('makes revenge free and adds 10%', () => {
    const v = {
      ...victim.state,
      revenge: [{ against: muscle.info.id, until: T0 + HOUR }],
      movesUsed: MOVES_PER_DAY,
    };
    expect(robOdds(victim.info, muscle.info, true).odds).toBe(
      robOdds(victim.info, muscle.info, false).odds + 10,
    );
    const out = mustOk(rob(ctxAt(), victim.info, v, muscle.info, muscle.state, { sameOwner: false }));
    expect(out.attacker.movesUsed).toBe(MOVES_PER_DAY);
    expect(out.attacker.revenge).toEqual([]);
  });

  it('refuses self, own Chogs and jailed targets', () => {
    expect(rob(ctxAt(), muscle.info, muscle.state, muscle.info, muscle.state, { sameOwner: false })).toEqual({
      ok: false,
      error: 'SELF',
    });
    expect(rob(ctxAt(), muscle.info, muscle.state, victim.info, victim.state, { sameOwner: true })).toEqual({
      ok: false,
      error: 'SAME_OWNER',
    });
    expect(
      rob(ctxAt(), muscle.info, muscle.state, victim.info, sendToJail(victim.state, T0), {
        sameOwner: false,
      }),
    ).toEqual({ ok: false, error: 'TARGET_IN_JAIL' });
  });
});

describe('arrests and bail', () => {
  const guard = player(chogWith('guard'));
  const crook = player(chogWithout(['guard']));

  it('only guards arrest, only Chogs with 3+ stars', () => {
    expect(
      arrest(ctxAt(), crook.info, crook.state, guard.info, addWanted(guard.state, 3, T0), {
        sameOwner: false,
      }),
    ).toEqual({ ok: false, error: 'NOT_A_GUARD' });
    expect(
      arrest(ctxAt(), guard.info, guard.state, crook.info, addWanted(crook.state, 2, T0), {
        sameOwner: false,
      }),
    ).toEqual({ ok: false, error: 'TARGET_NOT_WANTED' });
  });

  it('jails the target and pays 25 per star', () => {
    const seed = seedWhere(rollLabel('arrest', guard.info.id, 0), (r) => r <= 61);
    const out = mustOk(
      arrest(ctxAt(T0, seed), guard.info, guard.state, crook.info, addWanted(crook.state, 4, T0), {
        sameOwner: false,
      }),
    );
    expect(out.attacker.cash).toBe(100 + 4 * 25);
    expect(out.target.jailUntil).toBe(T0 + 6 * HOUR);
    expect(out.target.wanted).toBe(0);
  });

  it('charges 50 cash per started hour and lets anyone pay', () => {
    const jailed = sendToJail(addWanted(crook.state, 1, T0), T0); // 3 hours
    expect(bailCost(jailed, T0 + 30 * 60_000)).toBe(150);
    expect(payBail(ctxAt(), guard.state, jailed)).toEqual({ ok: false, error: 'NOT_ENOUGH_CASH' });
    const rich = { ...guard.state, cash: 500 };
    const out = mustOk(payBail(ctxAt(), rich, jailed));
    expect(out.payer.cash).toBe(350);
    expect(out.target.jailUntil).toBe(0);
    const self = mustOk(payBail(ctxAt(), { ...jailed, cash: 400 }, { ...jailed, cash: 400 }));
    expect(self.target.cash).toBe(250);
    expect(self.payer).toEqual(self.target);
    expect(mustOk(release(ctxAt(), jailed, { chogId: 0, method: 'chog', cost: 30 })).target.jailUntil).toBe(
      0,
    );
    expect(payBail(ctxAt(), rich, crook.state)).toEqual({ ok: false, error: 'NOT_IN_JAIL' });
  });
});

describe('gangs', () => {
  it('allows only gangs the traits give, and switching once a week', () => {
    const c = CHOGS.find((x) => gangOptions(x).born.includes('lazoor') && !gangOptions(x).anyGang)!;
    const s0 = newChogState(c.id, T0);
    expect(chooseGang(ctxAt(), c, s0, 'mcga').ok).toBe(gangOptions(c).born.includes('mcga'));
    const s1 = mustOk(chooseGang(ctxAt(), c, s0, 'lazoor')).state;
    expect(s1.gang).toBe('lazoor');
    const other = gangOptions(c).born.find((g) => g !== 'lazoor');
    if (other) {
      expect(chooseGang(ctxAt(T0 + 2 * 24 * HOUR), c, s1, other)).toEqual({
        ok: false,
        error: 'GANG_COOLDOWN',
      });
      expect(chooseGang(ctxAt(T0 + 7 * 24 * HOUR), c, s1, other).ok).toBe(true);
    }
  });

  it('lets free agents join any gang', () => {
    const free = CHOGS.find((x) => gangOptions(x).born.length === 0)!;
    expect(chooseGang(ctxAt(), free, newChogState(free.id, T0), 'robbers').ok).toBe(true);
    expect(infoOf(free).skills.length).toBeGreaterThan(0);
  });
});
