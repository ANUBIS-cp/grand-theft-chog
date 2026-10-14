import { CHOGS } from '@chog-city/data';
import { CITY, Ground, groundAt, route, slide, standable, type Place } from './map.ts';
import { WALK_SPEED } from './walkers.ts';

// The police in a getaway (stage 3 of a robbery): you carry the bag from the robbed gang's door to your own
// and they come for you. The live server runs them for real robberies; the browser runs the same code for
// the practice getaway.

/**
 * Police on foot, each with a job: two come out of the robbed door after you, one heads for a spot ahead of
 * you on your way home to cut you off, and for a well-defended vault one waits at your own door.
 */
export const COP_SPEED = { chase: 3.85, cut: 3.6, door: 3.4 };
/** How far ahead of you (in tiles along your way home) a cut-off cop aims. */
const CUT_AHEAD = 9;
/** A cop waiting at your door comes at you once you're this close. */
const DOOR_RANGE = 5;
/** Seconds out of the door before the police run and anyone can tag you. */
export const HEAD_START = 3;
export const COP_CATCH = 0.62;

export interface Cop {
  id: number;
  /** Whose picture the officer wears. */
  chog: number;
  job: 'chase' | 'cut' | 'door';
  x: number;
  y: number;
  face: -1 | 1;
  moving: boolean;
  path: { x: number; y: number }[];
  repath: number;
}

export function seeded(n: number) {
  let s = n | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Road tiles between `min` and `max` tiles (as the crow walks the grid) from a spot: where police start. */
function roadSpots(x: number, y: number, min: number, max: number) {
  const out: { x: number; y: number }[] = [];
  for (let ty = 0; ty < CITY.h; ty++)
    for (let tx = 0; tx < CITY.w; tx++) {
      const g = groundAt(tx, ty);
      if ((g !== Ground.Road && g !== Ground.Cross) || !standable(tx + 0.5, ty + 0.5)) continue;
      const d = Math.abs(tx + 0.5 - x) + Math.abs(ty + 0.5 - y);
      if (d >= min && d <= max) out.push({ x: tx + 0.5, y: ty + 0.5 });
    }
  return out;
}

/** How long you get (ms): the walk from door to door at full speed, half again, plus a little. */
export function getawayTime(from: { x: number; y: number }, to: { x: number; y: number }) {
  const r = route(from.x, from.y, to.x, to.y);
  const tiles = r ? r.length : 60;
  return Math.round(((tiles / WALK_SPEED) * 1.5 + 12) * 1000);
}

/** The police for one getaway: from the robbed door to `home` (a place's door, or any spot for practice). */
export function spawnCops(
  from: Place,
  home: { x: number; y: number },
  tier: number,
  rand: () => number,
  firstId: number,
): Cop[] {
  const jobs: Cop['job'][] = ['chase', 'chase', 'cut', ...(tier >= 2 ? (['door'] as const) : [])];
  const far = roadSpots(from.door.x, from.door.y, 14, 26);
  return jobs.map((job, i) => {
    // Chasers come out of the robbed building's door; the cut-off cop starts out in the streets; the door
    // guard starts at your door.
    const at =
      job === 'chase'
        ? { x: from.door.x + (i ? 0.5 : -0.5), y: from.door.y }
        : job === 'door'
          ? { x: home.x, y: home.y + 1 }
          : (far[Math.floor(rand() * far.length)] ?? { ...CITY.spawn });
    return {
      id: firstId - i,
      chog: CHOGS[Math.floor(rand() * CHOGS.length)]!.id,
      job,
      x: at.x,
      y: at.y,
      face: 1 as const,
      moving: false,
      path: [],
      repath: 0,
    };
  });
}

/** Moves every cop one step towards you (by its job). True when one of them has caught you. */
export function stepCops(
  cops: Cop[],
  me: { x: number; y: number },
  home: { x: number; y: number },
  dt: number,
): boolean {
  let ahead: { x: number; y: number } | null = null;
  for (const k of cops) {
    const near = Math.hypot(k.x - me.x, k.y - me.y);
    k.repath -= dt;
    if (k.repath <= 0 || !k.path.length) {
      k.repath = 0.35 + (Math.abs(k.id) % 5) * 0.04;
      // Close up, every job runs straight at you.
      let goal = { x: me.x, y: me.y };
      if (k.job === 'cut' && near > 4) {
        if (!ahead) {
          const way = route(me.x, me.y, home.x, home.y) ?? [];
          ahead = way[Math.min(CUT_AHEAD, way.length - 1)] ?? goal;
        }
        goal = ahead;
      } else if (k.job === 'door' && Math.hypot(me.x - home.x, me.y - home.y) > DOOR_RANGE)
        goal = { x: home.x, y: home.y + 1 };
      k.path = route(k.x, k.y, goal.x, goal.y) ?? [];
      k.path.push(goal);
    }
    let left = COP_SPEED[k.job] * dt;
    k.moving = false;
    while (left > 0 && k.path.length) {
      const to = k.path[0]!;
      const dx = to.x - k.x;
      const dy = to.y - k.y;
      const d = Math.hypot(dx, dy);
      if (Math.abs(dx) > 0.05) k.face = dx < 0 ? -1 : 1;
      if (d <= left) {
        ({ x: k.x, y: k.y } = slide(k.x, k.y, dx, dy));
        k.path.shift();
        left -= d;
      } else {
        ({ x: k.x, y: k.y } = slide(k.x, k.y, (dx / d) * left, (dy / d) * left));
        left = 0;
      }
      k.moving = true;
    }
    if (Math.hypot(k.x - me.x, k.y - me.y) < COP_CATCH) return true;
  }
  return false;
}
