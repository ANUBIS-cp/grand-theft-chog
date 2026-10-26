import { describe, expect, it } from 'vitest';
import {
  CALM_MS,
  CYCLE_MS,
  JUDGING,
  bloodMoon,
  halloweenCity,
  hauntedVault,
  nextBloodMoon,
} from './season.ts';

const MIN = 60_000;
const at = (d: number, h: number, m = 0) => Date.UTC(2026, 9, d, h, m);

describe('the judging cycle', () => {
  it('turns every 20 minutes: 10 of the normal city, then 10 of the Blood Moon', () => {
    const start = at(28, 9, 0);
    expect(start % CYCLE_MS).toBe(0);
    expect(bloodMoon(start)).toBeNull();
    expect(bloodMoon(start + CALM_MS - 1)).toBeNull();
    expect(bloodMoon(start + CALM_MS)).toEqual({ from: start + CALM_MS, to: start + CYCLE_MS });
    expect(bloodMoon(start + CYCLE_MS - 1)).not.toBeNull();
    expect(bloodMoon(start + CYCLE_MS)).toBeNull();
  });

  it('knows the next moon from anywhere in the cycle', () => {
    const start = at(30, 22, 40);
    expect(nextBloodMoon(start + 3 * MIN)!.from).toBe(start + CALM_MS);
    expect(nextBloodMoon(start + 15 * MIN)!.from).toBe(start + CALM_MS);
    expect(nextBloodMoon(start + CYCLE_MS - 1)!.to).toBe(start + CYCLE_MS);
    expect(nextBloodMoon(start + CYCLE_MS)!.from).toBe(start + CYCLE_MS + CALM_MS);
  });

  it('brings Halloween with the moon, and haunts every vault while it is up', () => {
    const calm = at(29, 12, 5);
    const moon = at(29, 12, 15);
    expect(halloweenCity(calm)).toBe(false);
    expect(halloweenCity(moon)).toBe(true);
    expect(hauntedVault('skulls', calm)).toBe(false);
    expect(hauntedVault('mcga', moon)).toBe(true);
  });

  it('stops when judging ends', () => {
    expect(bloodMoon(JUDGING.to - 5 * MIN)).not.toBeNull();
    expect(bloodMoon(JUDGING.to + 15 * MIN)).toBeNull();
    expect(nextBloodMoon(JUDGING.to)).toBeNull();
    expect(halloweenCity(JUDGING.to + 15 * MIN)).toBe(false);
  });
});
