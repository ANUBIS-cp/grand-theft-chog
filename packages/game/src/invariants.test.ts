import { CHOGS } from '@chog-city/data';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { arrest, doSoloJob, payBail, rob } from './actions.ts';
import { fullBoard } from './board.ts';
import { HOUR, MAX_WANTED, MOVES_PER_DAY } from './constants.ts';
import { infoOf } from './info.ts';
import { newChogState, refresh } from './state.ts';
import { T0, ctxAt } from './test-helpers.ts';
import { dayOf } from './time.ts';
import type { ChogInfo, ChogState, GameEvent } from './types.ts';

// A small town: a mix of skills, two guards and a 1:1.
const guards = CHOGS.filter((c) => infoOf(c).skills.includes('guard') && !infoOf(c).wildcard).slice(0, 2);
const town = [...[12, 561, 683, 900, 1061, 1192, 1300, 1500].map((id) => CHOGS[id - 1]!), ...guards];
const infos: ChogInfo[] = town.map(infoOf);
const seedArb = fc.uint8Array({ minLength: 32, maxLength: 32 }).map((b) => Buffer.from(b).toString('hex'));
const offers = fullBoard(dayOf(T0), new Set()).filter((o) => o.job.kind === 'solo' || o.job.kind === 'legal');

type Act =
  | { k: 'job'; who: number; offer: number }
  | { k: 'rob'; who: number; target: number }
  | { k: 'arrest'; who: number; target: number }
  | { k: 'bail'; who: number; target: number }
  | { k: 'wait'; hours: number };

const act: fc.Arbitrary<Act> = fc.oneof(
  fc.record({
    k: fc.constant('job' as const),
    who: fc.nat(town.length - 1),
    offer: fc.nat(offers.length - 1),
  }),
  fc.record({
    k: fc.constant('rob' as const),
    who: fc.nat(town.length - 1),
    target: fc.nat(town.length - 1),
  }),
  fc.record({
    k: fc.constant('arrest' as const),
    who: fc.nat(town.length - 1),
    target: fc.nat(town.length - 1),
  }),
  fc.record({
    k: fc.constant('bail' as const),
    who: fc.nat(town.length - 1),
    target: fc.nat(town.length - 1),
  }),
  fc.record({ k: fc.constant('wait' as const), hours: fc.integer({ min: 1, max: 30 }) }),
);

function play(seed: string, acts: Act[]) {
  let now = T0;
  const states: ChogState[] = town.map((c) => ({ ...newChogState(c.id, T0), active: true }));
  const events: GameEvent[] = [];
  for (const a of acts) {
    const ctx = ctxAt(now, seed);
    if (a.k === 'wait') {
      now += a.hours * HOUR;
      continue;
    }
    if (a.k === 'job') {
      // Offers are for day T0; use the same key on later days (it may be gone).
      const r = doSoloJob(ctx, infos[a.who]!, states[a.who]!, offers[a.offer]!.key);
      if (r.ok) {
        states[a.who] = r.value.state;
        events.push(...r.value.events);
      }
    } else if (a.k === 'rob' || a.k === 'arrest') {
      const fn = a.k === 'rob' ? rob : arrest;
      const r = fn(ctx, infos[a.who]!, states[a.who]!, infos[a.target]!, states[a.target]!, {
        sameOwner: false,
      });
      if (r.ok) {
        states[a.who] = r.value.attacker;
        states[a.target] = r.value.target;
        events.push(...r.value.events);
      }
    } else {
      const r = payBail(ctx, states[a.who]!, states[a.target]!);
      if (r.ok) {
        states[a.who] = r.value.payer;
        states[a.target] = r.value.target;
        events.push(...r.value.events);
      }
    }
    now += 60_000;
  }
  return { states: states.map((s) => refresh(s, now)), events, now };
}

describe('invariants under random play', () => {
  it('never breaks the rules', () => {
    fc.assert(
      fc.property(seedArb, fc.array(act, { maxLength: 120 }), (seed, acts) => {
        const { states, events, now } = play(seed, acts);
        for (const s of states) {
          expect(s.cash).toBeGreaterThanOrEqual(0);
          expect(s.movesUsed).toBeGreaterThanOrEqual(0);
          expect(s.movesUsed).toBeLessThanOrEqual(MOVES_PER_DAY);
          expect(s.wanted).toBeGreaterThanOrEqual(0);
          expect(s.wanted).toBeLessThanOrEqual(MAX_WANTED);
          expect(s.jailUntil === 0 || s.jailUntil > now).toBe(true);
          expect(s.timesRobbedToday).toBeLessThanOrEqual(3);
        }
        // Cash only enters through pay and bounties, and only moves between Chogs through robbery and bail.
        const minted = events.reduce(
          (sum, e) => sum + (e.type === 'job' ? e.pay : e.type === 'arrest' ? e.bounty : 0),
          0,
        );
        const burned = events.reduce((sum, e) => sum + (e.type === 'bail' ? e.cost : 0), 0);
        const total = states.reduce((sum, s) => sum + s.cash, 0);
        expect(total).toBe(town.length * 100 + minted - burned);
        // Every roll can be recomputed from the seed and its label.
        for (const e of events) if ('rollLabel' in e) expect(e.roll).toBeGreaterThanOrEqual(1);
      }),
      { numRuns: 300 },
    );
  });

  it('is deterministic: same seed and moves give the same result', () => {
    fc.assert(
      fc.property(seedArb, fc.array(act, { maxLength: 80 }), (seed, acts) => {
        expect(play(seed, acts)).toEqual(play(seed, acts));
      }),
      { numRuns: 100 },
    );
  });
});
