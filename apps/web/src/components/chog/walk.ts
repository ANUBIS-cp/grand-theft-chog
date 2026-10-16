import type { GangId } from '@chog-city/data';
import { drawLayers, SPIN_MS, type Piece } from './piece';

// How a Chog moves in the city. Every gang walks its own way (Royals glide, Clowns bounce, Wizards float,
// Skulls stomp), and every walk has weight: steps keyed to the distance covered, a lean into the way you're
// going that springs back when you stop, a little crouch before you set off and a squash when you land, and
// puffs of dust. Looks only: where you are comes from the game, not from here.

export type WalkStyle = 'swagger' | 'glide' | 'bounce' | 'float' | 'stomp' | 'zip' | 'mope';

export const WALK_OF: Record<GangId, WalkStyle> = {
  mcga: 'swagger',
  lazoor: 'zip',
  gangstas: 'swagger',
  robbers: 'zip',
  suits: 'glide',
  royals: 'glide',
  wizards: 'float',
  'squid-game': 'stomp',
  jailbirds: 'stomp',
  clowns: 'bounce',
  'btc-maxis': 'zip',
  'mon-maxis': 'zip',
  crybabies: 'mope',
  'visor-gang': 'float',
  skulls: 'stomp',
  radioactive: 'float',
  caps: 'bounce',
  durags: 'swagger',
  naked: 'bounce',
  legends: 'glide',
};

/** A sparkle or glint left behind as they move. */
export const TRAIL_OF: Partial<Record<GangId, string>> = {
  wizards: '#c9a7ff',
  'visor-gang': '#5ce1e6',
  radioactive: '#9be33b',
  royals: '#ffd23f',
  legends: '#ffd23f',
};

interface Feel {
  /** Steps per tile walked. */
  steps: number;
  /** Hop height, as a share of the card's height. */
  hop: number;
  /** Squash on each landing. */
  squash: number;
  /** Side-to-side rock, alternating each step (radians). */
  sway: number;
  /** Lean into the way you're going at full speed (radians). */
  lean: number;
  /** Hovering off the ground all the time (share of card height). */
  hover: number;
  /** Dust on every step. */
  dusty: boolean;
}

// Steps per tile are kept low: at walking speed (about 4.4 tiles a second) that's 2.5 to 4 steps a second, a
// calm rhythm. More than that reads as the piece vibrating.
const FEEL: Record<WalkStyle, Feel> = {
  swagger: { steps: 0.75, hop: 0.06, squash: 0.04, sway: 0.09, lean: 0.04, hover: 0, dusty: false },
  glide: { steps: 0.6, hop: 0.012, squash: 0.01, sway: 0.012, lean: 0.1, hover: 0, dusty: false },
  bounce: { steps: 0.62, hop: 0.26, squash: 0.14, sway: 0.025, lean: 0.05, hover: 0, dusty: false },
  float: { steps: 0.5, hop: 0.02, squash: 0, sway: 0.02, lean: 0.08, hover: 0.16, dusty: false },
  stomp: { steps: 0.85, hop: 0.07, squash: 0.1, sway: 0.04, lean: 0.03, hover: 0, dusty: true },
  zip: { steps: 0.9, hop: 0.1, squash: 0.05, sway: 0.025, lean: 0.09, hover: 0, dusty: false },
  mope: { steps: 0.65, hop: 0.04, squash: 0.04, sway: 0.05, lean: -0.05, hover: 0, dusty: false },
};

export interface WalkState {
  x: number;
  y: number;
  /** Tiles walked so far: the steps are keyed to this, so feet match the ground. */
  dist: number;
  /** Smoothed speed (tiles a second) and sideways velocity. */
  speed: number;
  vx: number;
  lean: number;
  leanV: number;
  moving: boolean;
  /** When they last set off and stopped (ms). */
  startAt: number;
  stopAt: number;
  face: -1 | 1;
  turnedAt: number;
  lastStep: number;
  lastTrail: number;
  /** How high off the ground they're drawn right now (CSS px), for the name tag above. */
  lift: number;
}

export function newWalk(x: number, y: number, face: -1 | 1): WalkState {
  return {
    x,
    y,
    dist: 0,
    speed: 0,
    vx: 0,
    lean: 0,
    leanV: 0,
    moving: false,
    startAt: -1e9,
    stopAt: -1e9,
    face,
    turnedAt: -1e9,
    lastStep: 0,
    lastTrail: 0,
    lift: 0,
  };
}

export interface Dust {
  x: number;
  y: number;
  vx: number;
  at: number;
  r: number;
  color: string;
  life: number;
}

/**
 * Moves the walk on to where they are now. Returns any dust or sparkles to draw (positions in tiles).
 * `moving` is what the game says; the walk also notices movement from the position changing.
 */
export function stepWalk(
  w: WalkState,
  x: number,
  y: number,
  moving: boolean,
  face: -1 | 1,
  style: WalkStyle,
  trail: string | undefined,
  now: number,
  dt: number,
): Dust[] {
  const out: Dust[] = [];
  const dx = x - w.x;
  const dy = y - w.y;
  const d = Math.hypot(dx, dy);
  // A jump (a teleport, a fix from the server) isn't a walk.
  const moved = d < 1.5 ? d : 0;
  w.x = x;
  w.y = y;
  w.dist += moved;
  const sp = dt > 0 ? moved / dt : 0;
  // Smoothed hard: other players' positions arrive ten times a second in little jumps, and raw speed
  // from those flickers, which would make their lean and hop shake.
  w.speed += (sp - w.speed) * Math.min(1, dt * 4);
  w.vx += ((dt > 0 && d < 1.5 ? dx / dt : 0) - w.vx) * Math.min(1, dt * 4);
  // Set off above one speed, stop below a lower one, so it never flips between walking and standing.
  const nowMoving = w.moving ? moving || w.speed > 0.6 : moving && w.speed > 1.2;
  if (nowMoving !== w.moving) {
    w.moving = nowMoving;
    if (nowMoving) w.startAt = now;
    else w.stopAt = now;
    // A puff as they set off or plant their feet.
    for (let i = 0; i < 4; i++)
      out.push({
        x: x + (Math.random() - 0.5) * 0.3,
        y: y + 0.32,
        vx: (Math.random() - 0.5) * 0.6 - Math.sign(w.vx) * 0.3,
        at: now,
        r: 0.1 + Math.random() * 0.06,
        color: 'rgba(200,190,220,0.55)',
        life: 420,
      });
  }
  if (face !== w.face) {
    w.face = face;
    w.turnedAt = now;
  }
  // Lean: a spring towards how fast you're going sideways, so a stop rocks back and settles.
  const f = FEEL[style];
  const target = Math.max(-1, Math.min(1, w.vx / 4.4)) * f.lean;
  const k = 120;
  const damp = 11;
  w.leanV += ((target - w.lean) * k - w.leanV * damp) * dt;
  w.lean += w.leanV * dt;
  // Dust on each heavy step; sparkles behind the magic ones.
  const step = Math.floor(w.dist * f.steps);
  if (step !== w.lastStep) {
    w.lastStep = step;
    if (f.dusty && w.moving)
      out.push({
        x,
        y: y + 0.32,
        vx: (Math.random() - 0.5) * 0.4,
        at: now,
        r: 0.09,
        color: 'rgba(200,190,220,0.5)',
        life: 360,
      });
  }
  if (trail && w.moving && now - w.lastTrail > 70) {
    w.lastTrail = now;
    out.push({
      x: x + (Math.random() - 0.5) * 0.5,
      y: y - 0.2 - Math.random() * 0.6,
      vx: (Math.random() - 0.5) * 0.2,
      at: now,
      r: 0.05 + Math.random() * 0.04,
      color: trail,
      life: 700,
    });
  }
  return out;
}

/** Draws the piece with its feet at (x, y) the way this gang walks. */
export function drawWalker(
  g: CanvasRenderingContext2D,
  p: Piece,
  x: number,
  y: number,
  w: WalkState,
  style: WalkStyle,
  now: number,
  opts: { seed: number; emoted?: number; alpha?: number } = { seed: 0 },
) {
  const f = FEEL[style];
  const H = p.top;
  // Where in the step they are: 0..1, keyed to distance so feet and ground agree.
  const ph = (w.dist * f.steps) % 1;
  const stepN = Math.floor(w.dist * f.steps);
  const moveK = Math.min(1, w.speed / 3);
  let lift = 0;
  let sy = 1;
  let rot = w.lean;
  if (w.moving) {
    lift = Math.sin(ph * Math.PI) * H * f.hop * moveK;
    sy = ph < 0.12 || ph > 0.9 ? 1 - f.squash * moveK : 1 + Math.sin(ph * Math.PI) * f.squash * 0.4;
    rot += (stepN % 2 ? 1 : -1) * Math.sin(ph * Math.PI) * f.sway * moveK;
  } else {
    // Standing: a slow breath.
    sy = 1 + Math.sin(now / 700 + opts.seed * 6) * 0.014;
  }
  // A crouch before setting off, a squash on stopping.
  const since = now - w.startAt;
  if (since < 110) sy *= 1 - 0.1 * Math.sin((since / 110) * Math.PI);
  const stopped = now - w.stopAt;
  if (!w.moving && stopped < 260) sy *= 1 - 0.08 * Math.sin((stopped / 260) * Math.PI) * (1 - stopped / 260);
  // Floaters hover and bob, even standing still.
  const hover = f.hover ? H * f.hover + Math.sin(now / 420 + opts.seed * 5) * H * 0.04 : 0;
  lift += hover;
  const sx = 1 / sy;
  // Turning round: the card squeezes in and springs back, with a little pop up off the ground.
  const turned = now - w.turnedAt;
  const spin = turned < SPIN_MS ? turned / SPIN_MS : 0;
  if (spin) lift += Math.sin(spin * Math.PI) * H * 0.07;
  if (opts.emoted !== undefined && opts.emoted < 700)
    rot += Math.sin(opts.emoted / 45) * 0.12 * (1 - opts.emoted / 700);
  w.lift = lift;

  // Shadow: stays on the ground, smaller the higher they are.
  const air = Math.min(1, lift / (H * 0.45));
  const sw = p.w * 0.42 * (1 - air * 0.45);
  g.fillStyle = `rgba(0,0,0,${0.42 - air * 0.22})`;
  g.beginPath();
  g.ellipse(x, y + p.h - p.fy - 4, sw, sw * 0.3, 0, 0, Math.PI * 2);
  g.fill();
  if (f.hover) {
    // A soft glow under a floater.
    g.save();
    g.globalAlpha = 0.25 + 0.1 * Math.sin(now / 300);
    g.fillStyle = '#b48cff';
    g.beginPath();
    g.ellipse(x, y + p.h - p.fy - 4, sw * 0.8, sw * 0.24, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  g.save();
  if (opts.alpha !== undefined) g.globalAlpha = opts.alpha;
  // Rotate about the feet, so a lean tips the whole piece like a real standee.
  g.translate(x, y - lift);
  g.rotate(rot);
  drawLayers(g, p, sx, sy, spin);
  g.restore();
  return lift;
}
