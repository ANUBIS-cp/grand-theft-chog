import { describe, expect, it } from 'vitest';
import { passes, roll, seedCommitment } from './dice.ts';
import { dayOf, dayStart, nextReset } from './time.ts';

describe('dice', () => {
  it('is deterministic and in 1..100', () => {
    const seed = 'ab'.repeat(32);
    expect(roll(seed, 'job:1:0')).toBe(roll(seed, 'job:1:0'));
    for (let i = 0; i < 2000; i++) {
      const r = roll(seed, `x:${i}`);
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThanOrEqual(100);
    }
  });

  it('is close to uniform', () => {
    const buckets = new Array(10).fill(0);
    const n = 50_000;
    for (let i = 0; i < n; i++) buckets[Math.floor((roll('01'.repeat(32), `u:${i}`) - 1) / 10)]++;
    for (const b of buckets) expect(Math.abs(b - n / 10)).toBeLessThan((n / 10) * 0.05);
  });

  it('changes with the seed and the label', () => {
    const a = Array.from({ length: 50 }, (_, i) => roll('01'.repeat(32), `l:${i}`));
    const b = Array.from({ length: 50 }, (_, i) => roll('02'.repeat(32), `l:${i}`));
    expect(a).not.toEqual(b);
  });

  it('wins when the roll is at or under the odds', () => {
    expect(passes(64, 64)).toBe(true);
    expect(passes(65, 64)).toBe(false);
  });

  it('commits to a seed with sha256', () => {
    expect(seedCommitment('00'.repeat(32))).toBe(
      '66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925',
    );
  });
});

describe('game days', () => {
  it('reset at 18:00 UTC', () => {
    const d = Date.UTC(2026, 9, 9, 17, 59, 59);
    expect(dayOf(Date.UTC(2026, 9, 9, 18, 0, 0))).toBe(dayOf(d) + 1);
    expect(new Date(dayStart(dayOf(d) + 1)).toISOString()).toBe('2026-10-09T18:00:00.000Z');
    expect(new Date(nextReset(Date.UTC(2026, 9, 9, 20))).toISOString()).toBe('2026-10-10T18:00:00.000Z');
  });
});
