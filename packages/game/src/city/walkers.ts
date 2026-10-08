import { CHOGS, gangOptions, type GangId } from '@chog-city/data';
import { dayOf } from '../time.ts';
import { CITY, Ground, groundAt, route, smooth, type City } from './map.ts';

// Chogs nobody is playing right now, strolling between spots so the city never looks empty.

export const WALK_SPEED = 4.2;
export const STROLL_SPEED = 1.9;

export interface Walker {
  x: number;
  y: number;
  path: { x: number; y: number }[];
  /** Seconds left standing still. */
  wait: number;
  face: -1 | 1;
  moving: boolean;
}

/** A small seeded random number generator (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let spots: { x: number; y: number }[] | null = null;
/** Places worth strolling to: pavements, yards and the plaza, never the middle of a road. */
function strollSpots(c: City) {
  if (spots) return spots;
  spots = [];
  for (let y = 0; y < c.h; y++)
    for (let x = 0; x < c.w; x++) {
      const g = groundAt(x, y, c);
      if (g === Ground.Walk || g === Ground.Plaza || g === Ground.Yard)
        spots.push({ x: x + 0.5, y: y + 0.5 });
    }
  return spots;
}

export function newWalker(rand: () => number, c: City = CITY): Walker {
  const s = strollSpots(c);
  const at = s[Math.floor(rand() * s.length)]!;
  return { x: at.x, y: at.y, path: [], wait: rand() * 4, face: rand() < 0.5 ? -1 : 1, moving: false };
}

/** Moves a walker on by dt seconds. */
export function stepWalker(w: Walker, dt: number, rand: () => number, c: City = CITY) {
  if (w.wait > 0) {
    w.wait -= dt;
    w.moving = false;
    return;
  }
  if (!w.path.length) {
    const s = strollSpots(c);
    // Mostly short trips nearby, sometimes across town.
    for (let tries = 0; tries < 6 && !w.path.length; tries++) {
      const to = s[Math.floor(rand() * s.length)]!;
      if (rand() < 0.75 && Math.hypot(to.x - w.x, to.y - w.y) > 18) continue;
      const r = route(w.x, w.y, to.x, to.y, c);
      if (r && r.length) w.path = smooth(w, r, c);
    }
    if (!w.path.length) {
      w.wait = 1 + rand() * 2;
      return;
    }
  }
  let left = STROLL_SPEED * dt;
  while (left > 0 && w.path.length) {
    const to = w.path[0]!;
    const dx = to.x - w.x;
    const dy = to.y - w.y;
    const d = Math.hypot(dx, dy);
    if (Math.abs(dx) > 0.05) w.face = dx < 0 ? -1 : 1;
    if (d <= left) {
      w.x = to.x;
      w.y = to.y;
      w.path.shift();
      left -= d;
    } else {
      w.x += (dx / d) * left;
      w.y += (dy / d) * left;
      left = 0;
    }
  }
  w.moving = true;
  if (!w.path.length) w.wait = 2 + rand() * 6;
}

/** Chogs strolling round the city today: a fixed pick per day, each walking for its gang. */
export function strollers(now: number, n = 36): { id: number; gang: GangId }[] {
  const day = dayOf(now);
  const out: { id: number; gang: GangId }[] = [];
  let seed = day * 2654435761;
  for (let tries = 0; out.length < n && tries < n * 20; tries++) {
    seed = (Math.imul(seed ^ (seed >>> 15), 2246822519) + 3266489917) >>> 0;
    const c = CHOGS[seed % CHOGS.length]!;
    const gang = gangOptions(c).born[0];
    if (gang && !out.some((o) => o.id === c.id)) out.push({ id: c.id, gang });
  }
  return out;
}
