// How the phone's stick reads a thumb (see thumb-stick.tsx), and how what it reads turns into a move in the
// vault. Kept apart from the drawing so it can be tested.
//
// Built the way maze games do it:
// - The stick reads eight ways, and a diagonal counts as BOTH of its directions held, like holding two arrow
//   keys (phone maze games let you hold two directions to "grind" corners). A thumb pushing "down" is rarely
//   straight down; reading it as one way threw the down away and slid you sideways past the turn.
// - Like Pac-Man, a turn you ask for waits: you keep going the way you're going and take the turn at the first
//   opening, instead of stopping or needing to hit the corner exactly.

import { DIRS, RUSH, open, type RushMap, type RushState } from '@chog-city/game/rush';

export type Dir = 0 | 1 | 2 | 3;

/** The ring's radius: the knob stops at it. */
export const RING = 56;
/** Past this the ring is dragged after your thumb, so it never ends up out of reach. */
const FOLLOW = 64;
/** The knob has to be this far out to move you, and back inside the smaller one to stop. */
const DEAD_IN = 13;
const DEAD_OUT = 8;
/** Half the width of the straight slices (degrees); between them a push holds both ways. */
const STRAIGHT = 22.5;
/** A slice's edge moves out this far (degrees) for the way you're already holding, so it doesn't flicker. */
const STAY = 5;

/** The stick: the ring's middle (where your thumb landed) and the ways it holds (the stronger first). */
export interface StickState {
  cx: number;
  cy: number;
  held: Dir[];
}

/**
 * Reads where the thumb is inside the ring. Returns the ways held: none, one (pushed straight), or two (a
 * diagonal: the stronger one first). Moves the ring after a thumb that goes well past it.
 */
export function readStick(l: StickState, fx: number, fy: number): Dir[] {
  let vx = fx - l.cx;
  let vy = fy - l.cy;
  const r = Math.hypot(vx, vy);
  if (r > FOLLOW) {
    l.cx += (vx / r) * (r - FOLLOW);
    l.cy += (vy / r) * (r - FOLLOW);
    vx = fx - l.cx;
    vy = fy - l.cy;
  }
  if (Math.hypot(vx, vy) < (l.held.length ? DEAD_OUT : DEAD_IN)) return (l.held = []);
  const h: Dir = vx > 0 ? 1 : 3;
  const v: Dir = vy > 0 ? 2 : 0;
  // Angle from the horizontal, 0..90.
  const a = (Math.atan2(Math.abs(vy), Math.abs(vx)) * 180) / Math.PI;
  const was = new Set(l.held);
  const onlyH = was.size === 1 && was.has(h);
  const onlyV = was.size === 1 && was.has(v);
  const both = was.size === 2;
  // Straight-across slice is 0..22.5 degrees, straight-up/down 67.5..90; the diagonal is between.
  const hEdge = STRAIGHT + (onlyH ? STAY : both ? -STAY : 0);
  const vEdge = 90 - STRAIGHT - (onlyV ? STAY : both ? -STAY : 0);
  if (a < hEdge) return (l.held = [h]);
  if (a > vEdge) return (l.held = [v]);
  return (l.held = a < 45 ? [h, v] : [v, h]);
}

const centre = (v: number) => Math.floor(v) + 0.5;

/** Could you turn `d` right now (the same rule the vault uses: near enough a tile's middle, and open)? */
function canTurn(m: RushMap, s: RushState, d: Dir) {
  const me = s.me;
  const [wx, wy] = DIRS[d];
  const off = wx !== 0 ? Math.abs(me.y - centre(me.y)) : Math.abs(me.x - centre(me.x));
  return off <= (me.dir === -1 ? 0.5 : RUSH.turn) && open(m, Math.floor(me.x) + wx, Math.floor(me.y) + wy);
}

/** Is there an opening to `turn` into within `max` tiles ahead along `go`? */
function openingAhead(m: RushMap, s: RushState, go: Dir, turn: Dir, max: number) {
  const [dx, dy] = DIRS[go];
  const [wx, wy] = DIRS[turn];
  const tx = Math.floor(s.me.x);
  const ty = Math.floor(s.me.y);
  for (let k = 0; k <= Math.ceil(max) + 1; k++) {
    const cx = tx + dx * k;
    const cy = ty + dy * k;
    const ahead = (cx + 0.5 - s.me.x) * dx + (cy + 0.5 - s.me.y) * dy;
    if (ahead < -RUSH.turn) continue;
    if (ahead > max || !open(m, cx, cy)) return false;
    if (open(m, cx + wx, cy + wy)) return true;
  }
  return false;
}

/** Can you keep going `d` (not yet at the middle of this tile, or the next tile is open)? */
function canGo(m: RushMap, s: RushState, d: Dir) {
  const [dx, dy] = DIRS[d];
  const toMid = (centre(s.me.x) - s.me.x) * dx + (centre(s.me.y) - s.me.y) * dy;
  return toMid > 1e-6 || open(m, Math.floor(s.me.x) + dx, Math.floor(s.me.y) + dy);
}

/**
 * The one way to send the vault this step, from the ways held. A diagonal holds two: the stronger one is where
 * you're going, the weaker one only helps you get there. So you take the stronger way the moment it opens and
 * until then keep moving (the way you were going, or along the weaker one); once you're going the stronger way
 * you stay on it, and only slide onto the weaker one if a wall stops you (grinding round a corner). One way
 * held: send it; the vault keeps you going until that turn opens, like Pac-Man.
 */
export function stickPick(m: RushMap, s: RushState, held: Dir[]): Dir | -1 {
  if (!held.length) return -1;
  const main = held[0]!;
  if (held.length === 1) return main;
  const help = held[1]!;
  const me = s.me;
  if (me.dir === -1) return canTurn(m, s, main) ? main : help;
  if (me.dir === main) return canGo(m, s, main) || !canTurn(m, s, help) ? main : help;
  if (canTurn(m, s, main)) return main;
  if (me.dir === help) return help;
  // Going the opposite way to the weaker one (you ran past the turn and push back towards it): go back if the
  // turn is behind you, but if it's just ahead keep going and take it.
  return openingAhead(m, s, me.dir as Dir, main, 1.5) ? (me.dir as Dir) : help;
}
