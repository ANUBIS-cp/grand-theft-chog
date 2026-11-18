import { describe, expect, it } from 'vitest';
import { CITY, Ground, groundAt } from './map.ts';
import { seeded } from './police.ts';
import { WALK_SPEED } from './walkers.ts';
import {
  BAGS,
  TRUCK,
  blinker,
  carrySpeed,
  dropBag,
  newTruck,
  poseAt,
  previewRoute,
  rearOf,
  slam,
  stepBags,
  stepTruck,
  truckRoute,
} from './truck.ts';

const onRoad = (x: number, y: number) => {
  const g = groundAt(Math.floor(x), Math.floor(y));
  return g === Ground.Road || g === Ground.Cross || g === Ground.Prop;
};

describe('the cash truck', () => {
  it('drives on the roads, keeps right, and never goes through the plaza', () => {
    for (let seed = 1; seed < 40; seed++) {
      const r = truckRoute({ c: 0, r: 0 }, seeded(seed), 30);
      expect(r.length).toBeGreaterThan(200);
      for (const p of r.pts) expect(onRoad(p.x, p.y)).toBe(true);
      // Both sides of the truck stay on the road too.
      for (let s = 0; s < r.length; s += 1.5) {
        const p = poseAt(r, s);
        const side = TRUCK.width / 2;
        expect(onRoad(p.x - p.hy * side, p.y + p.hx * side)).toBe(true);
        expect(onRoad(p.x + p.hy * side, p.y - p.hx * side)).toBe(true);
      }
      expect(r.turns.length).toBeGreaterThan(8);
    }
  });

  it('is faster than you on a straight road and slower round a corner', () => {
    expect(TRUCK.speed).toBeGreaterThan(WALK_SPEED);
    expect(TRUCK.corner).toBeLessThan(WALK_SPEED);
    const t = newTruck(truckRoute({ c: 0, r: 0 }, seeded(3), 30));
    let fastest = 0;
    let slowestInTurn = Infinity;
    for (let i = 0; i < 30 * 40 && t.state === 'driving'; i++) {
      stepTruck(t, 1 / 30);
      fastest = Math.max(fastest, t.v);
      const inTurn = t.route.turns.find((u) => t.s >= u.from && t.s <= u.to);
      if (inTurn) slowestInTurn = Math.min(slowestInTurn, t.v);
    }
    expect(fastest).toBeCloseTo(TRUCK.speed, 1);
    expect(slowestInTurn).toBeLessThan(TRUCK.corner + 0.3);
  });

  it('shows its blinker before each turn', () => {
    const t = newTruck(truckRoute({ c: 1, r: 1 }, seeded(8), 30));
    const first = t.route.turns[0]!;
    while (t.s < first.from - 2) stepTruck(t, 1 / 30);
    expect(blinker(t)).toBe(first.side);
  });

  it('stops when the doors burst open, with the bags spilling behind it', () => {
    const t = newTruck(truckRoute({ c: 0, r: 0 }, seeded(5), 30));
    for (let i = 0; i < 60; i++) stepTruck(t, 1 / 30);
    slam(t);
    const rand = seeded(9);
    const bags = [];
    let wait = 0;
    for (let i = 0; i < 30 * 4; i++) {
      stepTruck(t, 1 / 30);
      wait -= 1 / 30;
      if (wait <= 0 && bags.length < BAGS.count) {
        bags.push(dropBag(t, bags.length, rand));
        wait = BAGS.every;
      }
      stepBags(bags, 1 / 30);
    }
    expect(t.state).toBe('stopped');
    expect(bags.length).toBe(BAGS.count);
    const back = rearOf(poseAt(t.route, t.s));
    for (const b of bags) {
      expect(onRoad(b.x, b.y) || groundAt(Math.floor(b.x), Math.floor(b.y)) === Ground.Walk).toBe(true);
      expect(Math.hypot(b.x - back.x, b.y - back.y)).toBeLessThan(14);
    }
  });

  it('the more bags you carry, the slower you run', () => {
    expect(carrySpeed(0)).toBe(1);
    expect(carrySpeed(4)).toBeLessThan(carrySpeed(1));
    expect(carrySpeed(BAGS.count)).toBeGreaterThanOrEqual(BAGS.slowest);
    // With a few bags you still outrun the guards; with the lot you don't.
    expect(WALK_SPEED * carrySpeed(2)).toBeGreaterThan(3.85);
    expect(WALK_SPEED * carrySpeed(BAGS.count)).toBeLessThan(3.85);
  });

  it('the preview truck starts near you and comes your way', () => {
    const me = { ...CITY.spawn };
    for (let seed = 1; seed < 20; seed++) {
      const r = previewRoute(me, seeded(seed));
      const p = poseAt(r, 0);
      const d0 = Math.hypot(p.x - me.x, p.y - me.y);
      expect(d0).toBeLessThan(40);
      const later = poseAt(r, 15);
      expect(Math.hypot(later.x - me.x, later.y - me.y)).toBeLessThan(d0 + 1);
    }
  });
});
