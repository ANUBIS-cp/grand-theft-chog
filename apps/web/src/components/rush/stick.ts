// How the phone's stick reads a thumb (see thumb-stick.tsx), and what a held way means in the vault. Kept apart
// from the drawing so it can be tested.

import { DIRS, open, type RushMap, type RushState } from '@chog-city/game/rush';

export type Dir = 0 | 1 | 2 | 3;

/** The ring's radius: the knob stops at it. */
export const RING = 56;
/** Past this the ring is dragged after your thumb, so it never ends up out of reach. */
const FOLLOW = 64;
/** The knob has to be this far out to move you, and back inside the smaller one to stop. */
const DEAD_IN = 13;
const DEAD_OUT = 8;
/** Changing between up/down and left/right needs the knob about 5 degrees past the diagonal, so it doesn't flicker. */
const SWITCH = 1.19;

/** The stick: the ring's middle (where your thumb landed) and the way it reads. */
export interface StickState {
  cx: number;
  cy: number;
  d: Dir | -1;
}

/**
 * Reads the stick like any phone game's: the way is wherever your thumb is inside the ring, in four slices,
 * exactly what the knob shows. The ring stays where you put your thumb down (it only follows if you go well
 * past its edge). Returns the way and moves the ring if needed.
 */
export function readStick(l: StickState, fx: number, fy: number): Dir | -1 {
  let vx = fx - l.cx;
  let vy = fy - l.cy;
  const r = Math.hypot(vx, vy);
  if (r > FOLLOW) {
    l.cx += (vx / r) * (r - FOLLOW);
    l.cy += (vy / r) * (r - FOLLOW);
    vx = fx - l.cx;
    vy = fy - l.cy;
  }
  const len = Math.hypot(vx, vy);
  if (len < (l.d === -1 ? DEAD_IN : DEAD_OUT)) return (l.d = -1);
  const ax = Math.abs(vx);
  const ay = Math.abs(vy);
  const wasX = l.d === 1 || l.d === 3;
  const wasY = l.d === 0 || l.d === 2;
  const useX = wasX ? ay <= ax * SWITCH : wasY ? ax > ay * SWITCH : ax > ay;
  return (l.d = useX ? (vx > 0 ? 1 : 3) : vy > 0 ? 2 : 0);
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
