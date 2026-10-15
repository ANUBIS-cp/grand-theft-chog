// How the phone's stick reads a thumb (see thumb-stick.tsx), and what a held way means in the vault. Kept apart
// from the drawing so it can be tested.

import { DIRS, open, type RushMap, type RushState } from '@chog-city/game/rush';

export type Dir = 0 | 1 | 2 | 3;

/** A move this long from rest picks a way. */
const DEAD = 10;
/** How far behind your thumb the stick's pivot trails while you hold a way. */
const LAG = 12;
const UNIT: Record<Dir, [number, number]> = { 0: [0, -1], 1: [1, 0], 2: [0, 1], 3: [-1, 0] };

const dominant = (x: number, y: number): Dir =>
  Math.abs(x) > Math.abs(y) ? (x > 0 ? 1 : 3) : y > 0 ? 2 : 0;

/** Where the stick is: its pivot and the way it's held. */
export interface StickState {
  px: number;
  py: number;
  d: Dir | -1;
}

/** Feeds one finger position to the stick; returns the way it now reads (and moves the pivot). */
export function readStick(l: StickState, fx: number, fy: number): Dir | -1 {
  const vx = fx - l.px;
  const vy = fy - l.py;
  if (l.d === -1) {
    if (Math.hypot(vx, vy) < DEAD) return -1;
  } else {
    const [ux, uy] = UNIT[l.d];
    const along = vx * ux + vy * uy;
    // The sideways part of the move, as a vector.
    const sx = vx - along * ux;
    const sy = vy - along * uy;
    const side = Math.hypot(sx, sy);
    // Turn when the thumb has clearly moved another way since the pivot: sideways more than along, or back.
    const turn = (side >= DEAD && side > along) || (-along >= DEAD && -along > side);
    if (!turn) {
      if (along > LAG) {
        // Holding the same way: the pivot trails behind your thumb and forgives half the sideways drift, so a
        // long slide that curves a little doesn't add up to a turn.
        const step = along - LAG;
        const k = Math.min(1, (step * 0.5) / Math.max(1, side));
        l.px += ux * step + sx * k;
        l.py += uy * step + sy * k;
      }
      return l.d;
    }
  }
  const d = dominant(vx, vy);
  // A new way: the pivot goes just behind your thumb on it, so the next turn is a short move from here.
  l.px = fx - UNIT[d][0] * LAG;
  l.py = fy - UNIT[d][1] * LAG;
  l.d = d;
  return d;
}


/**
 * The phone's stick asks for one way at a time. Pushing a way you can't go yet would leave your Chog running
 * on the way it was going, which on a phone feels like it ignored you. So it only keeps running if the turn
 * comes within about a tile and a half (pushing a little early still works); otherwise it stops at the wall.
 */
export function stickWay(m: RushMap, s: RushState, want: Dir): Dir | -1 {
  const me = s.me;
  if (me.dir === -1 || (DIRS[me.dir][0] !== 0) === (DIRS[want][0] !== 0)) return want;
  const [dx, dy] = DIRS[me.dir];
  const [wx, wy] = DIRS[want];
  const tx = Math.floor(me.x);
  const ty = Math.floor(me.y);
  for (let k = 0; k <= 2; k++) {
    const cx = tx + dx * k;
    const cy = ty + dy * k;
    // How far ahead this tile's middle is along the way you're going.
    const ahead = (cx + 0.5 - me.x) * dx + (cy + 0.5 - me.y) * dy;
    if (ahead < -0.4) continue;
    if (ahead > 1.5 || !open(m, cx, cy)) break;
    if (open(m, cx + wx, cy + wy)) return want;
  }
  return -1;
}
