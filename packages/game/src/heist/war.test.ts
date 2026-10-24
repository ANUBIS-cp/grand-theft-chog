import { GANG_IDS } from '@chog-city/data';
import { describe, expect, it } from 'vitest';
import { IDLE, type Input } from './sim.ts';
import { LOOT_VALUE, tierFor } from './level.ts';
import {
  BUST_FINE,
  REFILL_TO,
  decodeInputs,
  encodeInputs,
  levelFor,
  settle,
  takeCap,
  tickVault,
  tierNow,
  upkeepPercent,
  vaultFor,
} from './war.ts';

describe('war rules', () => {
  it('round-trips inputs through text', () => {
    const inputs: Input[] = [IDLE, { d: 0, p: -1 }, { d: 3, p: 1 }, { d: -1, p: 0 }, { d: 2, p: 1 }];
    const text = encodeInputs(inputs);
    expect(text).toHaveLength(5);
    expect(decodeInputs(text)).toEqual(inputs);
    expect(decodeInputs('zz')).toBeNull();
  });

  it('gives every gang a vault and more defences to richer vaults', () => {
    for (const g of GANG_IDS) expect(vaultFor(g)).toBeTruthy();
    expect(levelFor('mcga', tierFor(3_000)).level.guards.length).toBeLessThan(
      levelFor('mcga', tierFor(40_000)).level.guards.length,
    );
  });

  it('bought defence counts until it runs out, and never lowers what the cash gives', () => {
    expect(tierNow(10_000, { level: 3, until: 2_000 }, 1_000)).toBe(3);
    expect(tierNow(10_000, { level: 3, until: 2_000 }, 3_000)).toBe(tierFor(10_000));
    expect(tierNow(30_000, { level: 1, until: 2_000 }, 1_000)).toBe(tierFor(30_000));
  });

  it('a grab-and-go moves cash from the vault, capped by what is in it, with a revenge bonus', () => {
    const { level } = levelFor('mcga', tierFor(10_000));
    const go = (d: 0 | 2, n: number): Input[] => Array.from({ length: n }, () => ({ d, p: -1 }));
    const run = [...go(0, 16), ...go(2, 16), ...go(2, 8)];
    const plain = settle(level, [], run, 10_000, 10_000, false);
    expect(plain.state.phase).toBe('escaped');
    expect(plain.moved).toBe(plain.state.score);
    expect(settle(level, [], run, 10_000, 10_000, true).moved).toBe(Math.floor(plain.state.score * 1.25));
    expect(settle(level, [], run, 10, 10_000, false).moved).toBe(10);
  });

  it('a bust costs your gang what you carried plus the fine, capped by what it has', () => {
    const { level } = levelFor('mcga', tierFor(10_000));
    const s = settle(level, [], [], 10_000, 10_000, false);
    expect(s.state.phase).toBe('busted');
    expect(s.moved).toBe(BUST_FINE);
    expect(settle(level, [], [], 10_000, 100, false).moved).toBe(100);
  });

  it('the safe holds far more than the loose cash, and more in richer vaults', () => {
    const poor = levelFor('mcga', 0).level;
    const rich = levelFor('mcga', 3).level;
    const loose = poor.loot.reduce((a, l) => a + LOOT_VALUE[l.kind], 0);
    expect(poor.safes[0]!.value).toBeGreaterThan(loose * 0.8);
    expect(rich.safes[0]!.value).toBeGreaterThan(poor.safes[0]!.value * 4);
  });
});

describe('vault economy', () => {
  it('one robbery takes a fifth of the vault at most, a quarter on revenge', () => {
    expect(takeCap(3_000, false)).toBe(600);
    expect(takeCap(3_000, true)).toBe(750);
    expect(takeCap(-5, false)).toBe(0);
  });

  it('upkeep starts at Fortress, 10% a day, and grows with the stash up to half', () => {
    expect(upkeepPercent(24_999)).toBe(0);
    expect(upkeepPercent(25_000)).toBe(10);
    expect(upkeepPercent(50_000)).toBe(20);
    expect(upkeepPercent(1_000_000)).toBe(50);
    // Upkeep stops once the vault drops under Fortress; a day at $40k costs about a seventh, at $60k a fifth.
    expect(tickVault(25_000, 24)).toBeGreaterThan(24_800);
    expect(40_000 - tickVault(40_000, 24)).toBeGreaterThan(5_000);
    expect(60_000 - tickVault(60_000, 24)).toBeGreaterThan(11_000);
  });

  it('a near-empty vault refills $100 an hour to $5,000 and no further; the middle is left alone', () => {
    expect(tickVault(0, 1)).toBe(100);
    expect(tickVault(4_950, 3)).toBe(REFILL_TO);
    expect(tickVault(0, 1_000)).toBe(REFILL_TO);
    expect(tickVault(12_000, 48)).toBe(12_000);
  });

  it('nobody can stack for ever: even $20k a day of robbing settles under $75k', () => {
    let cash = 30_000;
    for (let day = 0; day < 60; day++) cash = tickVault(cash + 20_000, 24);
    expect(cash).toBeLessThan(75_000);
  });
});
