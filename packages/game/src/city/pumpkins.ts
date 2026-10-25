import { CITY, Ground, groundAt, standable } from './map.ts';

// Where a Pumpkin Rush pumpkin can sit: open street, away from doors (no camping a door for them). Shared by
// the live server (real pumpkins) and the browser (the Halloween preview's practice pumpkins).

const STREET = new Set<Ground>([Ground.Road, Ground.Walk, Ground.Cross, Ground.Plaza, Ground.Grass]);
let spots: { x: number; y: number }[] | null = null;

export function pumpkinSpots(): { x: number; y: number }[] {
  if (spots) return spots;
  const doors = CITY.places.map((p) => p.door);
  spots = [];
  for (let y = 1; y < CITY.h - 1; y++)
    for (let x = 1; x < CITY.w - 1; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      if (!STREET.has(groundAt(x, y)) || !standable(px, py)) continue;
      if (doors.some((d) => Math.hypot(d.x - px, d.y - py) < 3)) continue;
      spots.push({ x: px, y: py });
    }
  return spots;
}

/** Reaching a pumpkin: this close (tiles). */
export const PUMPKIN_GRAB = 0.9;

/** A pumpkin that hops away from whoever comes near (the live server's, and the preview's in the browser). */
export interface Hopper {
  x: number;
  y: number;
  gold: boolean;
  /** When it may hop next (ms). */
  next?: number;
}

/** How a pumpkin hops: how far each hop goes, how often, and how close a Chog must be to startle it. */
export const HOP = {
  normal: { len: 1.5, every: 620, startle: 5 },
  gold: { len: 1.8, every: 500, startle: 6.5 },
  /** How long a hop is in the air, for drawing it (ms). */
  air: 300,
};

/**
 * If a Chog is close, hop away from the nearest one: straight away from it with a little wobble, else the
 * best open spot to one side (a cornered pumpkin can still slip past). Returns where it lands, or null if it
 * stays (nobody near, resting between hops, or nowhere to go).
 */
export function hopAway(
  p: Hopper,
  chasers: Iterable<{ x: number; y: number }>,
  now: number,
  rand: () => number,
): { x: number; y: number } | null {
  if (p.next !== undefined && now < p.next) return null;
  const k = p.gold ? HOP.gold : HOP.normal;
  let near: { x: number; y: number } | null = null;
  let best = k.startle;
  for (const c of chasers) {
    const d = Math.hypot(c.x - p.x, c.y - p.y);
    if (d < best) {
      best = d;
      near = c;
    }
  }
  if (!near) return null;
  const away = Math.atan2(p.y - near.y, p.x - near.x);
  const doors = CITY.places.map((q) => q.door);
  for (const turn of [0, 0.5, -0.5, 1, -1, 1.6, -1.6]) {
    const a = away + turn + (rand() - 0.5) * 0.5;
    const x = p.x + Math.cos(a) * k.len;
    const y = p.y + Math.sin(a) * k.len;
    if (!standable(x, y) || !STREET.has(groundAt(Math.floor(x), Math.floor(y)))) continue;
    if (doors.some((d) => Math.hypot(d.x - x, d.y - y) < 2.5)) continue;
    p.next = now + k.every * (0.85 + rand() * 0.3);
    return { x, y };
  }
  p.next = now + 250;
  return null;
}
