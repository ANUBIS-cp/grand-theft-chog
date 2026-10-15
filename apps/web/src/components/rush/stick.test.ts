import { describe, expect, it } from 'vitest';
import { rushMap, rushRules, startRush } from '@chog-city/game/rush';
import { readStick, stickWay, type StickState } from './stick';

/** Slides the thumb from where it is to (x, y) in 2 px steps, like a real move event stream. */
function slide(l: StickState, from: [number, number], to: [number, number]) {
  const n = Math.max(1, Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / 2));
  let d = l.d;
  for (let i = 1; i <= n; i++)
    d = readStick(l, from[0] + ((to[0] - from[0]) * i) / n, from[1] + ((to[1] - from[1]) * i) / n);
  return d;
}
const at = (): StickState => ({ cx: 0, cy: 0, d: -1 });

describe('the phone stick', () => {
  it('reads where the thumb is in the ring: right, then below the middle is down', () => {
    const l = at();
    expect(slide(l, [0, 0], [40, 0])).toBe(1);
    expect(slide(l, [40, 0], [0, 40])).toBe(2);
  });
  it('rolling round the ring from down to left reads left, never up', () => {
    const l = at();
    expect(slide(l, [0, 0], [0, 40])).toBe(2);
    let d = l.d;
    const seen = new Set<number>();
    for (let a = 90; a <= 180; a += 3) {
      d = readStick(l, Math.cos((a * Math.PI) / 180) * 40, Math.sin((a * Math.PI) / 180) * 40);
      seen.add(d);
    }
    expect(d).toBe(3);
    expect([...seen].sort()).toEqual([2, 3]);
  });
  it("doesn't flicker on the diagonal", () => {
    const l = at();
    expect(slide(l, [0, 0], [40, 0])).toBe(1);
    expect(slide(l, [40, 0], [38, 40])).toBe(1);
    expect(slide(l, [38, 40], [30, 45])).toBe(2);
  });
  it('a small wobble does nothing; back to the middle stops', () => {
    const l = at();
    expect(slide(l, [0, 0], [7, 4])).toBe(-1);
    expect(slide(l, [7, 4], [0, -30])).toBe(0);
    expect(slide(l, [0, -30], [2, -3])).toBe(-1);
  });
  it('the ring follows a thumb that goes far past it, so turning back is quick', () => {
    const l = at();
    expect(slide(l, [0, 0], [150, 0])).toBe(1);
    expect(slide(l, [150, 0], [70, 0])).toBe(3);
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
