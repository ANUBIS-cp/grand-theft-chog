import { describe, expect, it } from 'vitest';
import { reaches, segmentGap, type Pumpkin } from './hunts.ts';

const pk = (x: number, y: number, was?: Pumpkin['was']): Pumpkin => ({
  id: 'p',
  x,
  y,
  cash: 300,
  gold: false,
  until: 1e12,
  was,
});

describe('grabbing a pumpkin', () => {
  it('measures how close a stretch of running comes to a point', () => {
    expect(segmentGap(0, 0, 10, 0, 5, 1)).toBeCloseTo(1);
    expect(segmentGap(0, 0, 10, 0, -3, 4)).toBeCloseTo(5);
    expect(segmentGap(2, 2, 2, 2, 2, 3)).toBeCloseTo(1);
  });

  it('counts running straight through it between two ticks', () => {
    // Before and after the tick you're 1.2 tiles either side of it: neither end is close enough, the way is.
    expect(reaches({ x: 3.8, y: 5 }, { x: 6.2, y: 5 }, pk(5, 5), 0)).toBe(true);
    expect(reaches(undefined, { x: 6.2, y: 5 }, pk(5, 5), 0)).toBe(false);
  });

  it('counts the spot it just hopped from, but only for a moment', () => {
    const hopped = pk(8, 5, { x: 5, y: 5, at: 1000 });
    expect(reaches({ x: 4.5, y: 5 }, { x: 5, y: 5 }, hopped, 1200)).toBe(true);
    expect(reaches({ x: 4.5, y: 5 }, { x: 5, y: 5 }, hopped, 1800)).toBe(false);
  });

  it('does not count a jump across the map as running past it', () => {
    expect(reaches({ x: 0, y: 5 }, { x: 20, y: 5 }, pk(10, 5), 0)).toBe(false);
  });
});
