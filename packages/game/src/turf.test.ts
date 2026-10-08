import { describe, expect, it } from 'vitest';
import { flipTurf, turfScores } from './turf.ts';
import type { GameEvent } from './types.ts';

const job = (
  chogId: number,
  gang: 'lazoor' | 'mcga' | null,
  district: 'lemon-row' | 'mon-square',
  turf: number,
): GameEvent => ({
  type: 'job',
  chogId,
  gang,
  jobId: 'x',
  district,
  crewId: null,
  success: turf > 0,
  roll: 1,
  odds: 50,
  pay: 0,
  turf,
  xp: 0,
  wanted: 0,
  jailedUntil: 0,
  rollLabel: 'x',
});

describe('turf', () => {
  it('counts only the best 15 Chogs per gang per district', () => {
    const big = Array.from({ length: 40 }, (_, i) => job(i + 1, 'lazoor', 'lemon-row', 2)); // 40 Chogs x 2
    const small = Array.from({ length: 12 }, (_, i) => job(100 + i, 'mcga', 'lemon-row', 6)); // 12 Chogs x 6
    const s = turfScores([...big, ...small]);
    expect(s['lemon-row']).toEqual({ lazoor: 30, mcga: 72 });
  });

  it("adds a Chog's jobs together and ignores failures and gangless Chogs", () => {
    const s = turfScores([
      job(1, 'mcga', 'mon-square', 2),
      job(1, 'mcga', 'mon-square', 6),
      job(2, 'mcga', 'mon-square', 0),
      job(3, null, 'mon-square', 9),
    ]);
    expect(s['mon-square']).toEqual({ mcga: 8 });
  });

  it('flips districts to the top gang; ties change nothing', () => {
    const scores = { 'lemon-row': { lazoor: 10, mcga: 20 }, 'mon-square': { lazoor: 5, mcga: 5 } } as const;
    const { holders, changes } = flipTurf({ 'mon-square': 'lazoor' }, scores);
    expect(holders).toEqual({ 'lemon-row': 'mcga', 'mon-square': 'lazoor' });
    expect(changes).toEqual([{ district: 'lemon-row', from: null, to: 'mcga', score: 20 }]);
    expect(flipTurf({}, { 'mon-square': { lazoor: 5, mcga: 5 } }).holders).toEqual({});
  });
});
