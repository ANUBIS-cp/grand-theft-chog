import { describe, expect, it } from 'vitest';
import { rushMap, rushRules, startRush } from '@chog-city/game/rush';
import { readStick, stickWay, type StickState } from './stick';

/** Slides the thumb from where it is to (x, y) in 2 px steps, like a real move event stream. */
function slide(l: StickState, from: [number, number], to: [number, number]) {
  const n = Math.max(1, Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / 2));
  let d = l.d;
  for (let i = 1; i <= n; i++) d = readStick(l, from[0] + ((to[0] - from[0]) * i) / n, from[1] + ((to[1] - from[1]) * i) / n);
  return d;
}

describe('the phone stick', () => {
  it('turns down with a short pull after holding right far out (the slant that used to read "right")', () => {
    const l: StickState = { px: 100, py: 100, d: -1 };
    expect(slide(l, [100, 100], [160, 100])).toBe(1);
    expect(slide(l, [160, 100], [160, 116])).toBe(2);
  });
  it("doesn't turn from the drift of a long curved slide", () => {
    const l: StickState = { px: 0, py: 0, d: -1 };
    // 120 px right while the thumb drifts 18 px down, like a thumb's arc.
    let d = l.d;
    for (let i = 1; i <= 60; i++) d = readStick(l, i * 2, Math.sin((i / 60) * (Math.PI / 2)) * 18);
    expect(d).toBe(1);
  });
  it('reverses with a short move back, and ignores a tiny wobble', () => {
    const l: StickState = { px: 0, py: 0, d: -1 };
    expect(slide(l, [0, 0], [6, 0])).toBe(-1);
    expect(slide(l, [6, 0], [40, 0])).toBe(1);
    expect(slide(l, [40, 0], [40, 5])).toBe(1);
    expect(slide(l, [40, 5], [14, 5])).toBe(3);
  });
  it('chains turns: up, then left, then down', () => {
    const l: StickState = { px: 0, py: 0, d: -1 };
    expect(slide(l, [0, 0], [0, -30])).toBe(0);
    expect(slide(l, [0, -30], [-16, -30])).toBe(3);
    expect(slide(l, [-16, -30], [-16, -14])).toBe(2);
  });
});

describe('a held way in the vault', () => {
  const m = rushMap('rush-bank')!;
  const s = startRush(m, rushRules(1, false, false), [], 1);
  // Row 14 runs along the bottom; the corridors up from it are at x = 2, 4, 8, 10, 14, 16.
  it('keeps running to a turn just ahead', () => {
    s.me.x = 9.5;
    s.me.y = 14.5;
    s.me.dir = 3;
    expect(stickWay(m, s, 0)).toBe(0);
  });
  it('stops at the wall when the turn is far off, instead of running on sideways', () => {
    s.me.x = 7.5;
    s.me.y = 14.5;
    s.me.dir = 3;
    expect(stickWay(m, s, 0)).toBe(-1);
  });
  it('always allows reversing, or a way from standing still', () => {
    s.me.dir = 3;
    expect(stickWay(m, s, 1)).toBe(1);
    s.me.dir = -1;
    expect(stickWay(m, s, 0)).toBe(0);
  });
});
