import { GANG_IDS } from '@chog-city/data';
import { describe, expect, it } from 'vitest';
import { IDLE, type Input } from './sim.ts';
import { LOOT_VALUE, tierFor } from './level.ts';
import { BUST_FINE, decodeInputs, encodeInputs, levelFor, settle, tierNow, vaultFor } from './war.ts';

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
