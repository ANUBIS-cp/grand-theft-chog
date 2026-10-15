import { describe, expect, it } from 'vitest';
import { CITY, Ground, groundAt } from './map.ts';
import { spawnPatrol, stepPatrol } from './patrol.ts';
import { seeded } from './police.ts';

describe('police cars', () => {
  it('stay on the roads and come round to the bag', () => {
    const rnd = seeded(7);
    const target = { x: 40, y: 30 };
    const cars = [spawnPatrol(target, rnd), spawnPatrol(target, rnd), spawnPatrol(target, rnd)];
    let near = 0;
    for (let i = 0; i < 1200; i++) {
      stepPatrol(cars, target, 1 / 20, rnd);
      for (const c of cars) {
        const g = groundAt(Math.floor(c.x), Math.floor(c.y), CITY);
        expect([Ground.Road, Ground.Cross, Ground.Prop]).toContain(g);
        if (Math.hypot(c.x - target.x, c.y - target.y) < 12) near++;
      }
    }
    // Most of the minute is spent around the robber.
    expect(near / (1200 * 3)).toBeGreaterThan(0.5);
  });
});
