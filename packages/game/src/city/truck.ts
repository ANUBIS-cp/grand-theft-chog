import { BH, BW, CITY, COLS, Ground, ROAD, ROWS, groundAt, type City } from './map.ts';

// The winter cash truck: an armoured truck full of cash bags drives a long route through the city. You catch
// it (it's faster than you on a straight road, so you cut it off at a corner), jump on the back, pick the lock
// on its back doors while it drives, and the bags tumble out onto the street. Then it's a getaway home with the
// guards after you, and every bag you carry slows you down.
//
// Everything here is plain numbers stepped by time, so the browser and (later) the live server can run the
// same truck.

export const TRUCK = {
  /** Tiles a second on a straight road (you walk at 4.2: it pulls away from you). */
  speed: 5.4,
  /** Round a corner (you're faster here: this is where you catch it). */
  corner: 1.9,
  accel: 2.4,
  /** Slowing for a corner coming up, and the emergency stop when the doors burst open. */
  slow: 2.6,
  /** The stop when the doors burst open: hard, but long enough that the bags trail out down the street. */
  brake: 2.4,
  /** Its size in tiles: length along the road, width across it. */
  length: 2.9,
  width: 1.4,
  /** How far off the road's middle its lane is (it keeps right). */
  lane: 0.75,
  /** How close to the back doors you must be to jump on. */
  grab: 0.95,
  /** Seconds the blinker shows before a turn. */
  signal: 2.2,
};

/** The money bags that fall out. */
export const BAGS = {
  count: 12,
  /** Seconds between bags tumbling out while the truck brakes. */
  every: 0.22,
  cash: 125,
  /** How close you must get to scoop one up. */
  grab: 0.8,
  /** Each bag carried slows you by this share of your speed, down to `slowest`. */
  slowPer: 0.025,
  slowest: 0.62,
};

export const carrySpeed = (bags: number) => Math.max(BAGS.slowest, 1 - bags * BAGS.slowPer);

export interface Pt {
  x: number;
  y: number;
}
interface Node {
  c: number;
  r: number;
}

const STEP_X = BW + ROAD;
const STEP_Y = BH + ROAD;
const centre = (n: Node): Pt => ({ x: n.c * STEP_X + ROAD / 2, y: n.r * STEP_Y + ROAD / 2 });
export const nearestJunction = (p: Pt): Node => ({
  c: Math.max(0, Math.min(COLS, Math.round((p.x - ROAD / 2) / STEP_X))),
  r: Math.max(0, Math.min(ROWS, Math.round((p.y - ROAD / 2) / STEP_Y))),
});

/** The road between two neighbouring junctions is a real road (the plaza paves one over). */
function drivable(a: Node, b: Node, city: City) {
  if (b.c < 0 || b.r < 0 || b.c > COLS || b.r > ROWS) return false;
  const p = centre(a);
  const q = centre(b);
  for (let i = 1; i < 8; i++) {
    const g = groundAt((p.x + (q.x - p.x) * (i / 8)) | 0, (p.y + (q.y - p.y) * (i / 8)) | 0, city);
    if (g !== Ground.Road && g !== Ground.Cross && g !== Ground.Prop) return false;
  }
  return true;
}

const NEXT: Node[] = [
  { c: 0, r: -1 },
  { c: 1, r: 0 },
  { c: 0, r: 1 },
  { c: -1, r: 0 },
];

export interface Turn {
  /** Where along the route the turn starts and ends (tiles). */
  from: number;
  to: number;
  side: 'left' | 'right';
}

export interface TruckRoute {
  /** The lane it drives, sampled every few tenths of a tile, with the distance along it. */
  pts: { x: number; y: number; s: number }[];
  length: number;
  turns: Turn[];
}

/**
 * A route of `legs` roads from junction `start`, heading first to `toward` if it's a neighbour. It never turns
 * back, wanders the whole city, and turns at most junctions (a truck that only drives straight is too easy to
 * read and too hard to catch).
 */
export function truckRoute(
  start: Node,
  rand: () => number,
  legs = 30,
  opts: { toward?: Node; stayNear?: Pt; city?: City } = {},
): TruckRoute {
  const city = opts.city ?? CITY;
  const nodes: Node[] = [start];
  let prev: Node | null = null;
  let at = start;
  for (let i = 0; i < legs; i++) {
    const options = NEXT.map((d) => ({ c: at.c + d.c, r: at.r + d.r })).filter(
      (n) => drivable(at, n, city) && !(prev && n.c === prev.c && n.r === prev.r),
    );
    if (!options.length) break;
    let next: Node;
    const first =
      i === 0 && opts.toward && options.find((n) => n.c === opts.toward!.c && n.r === opts.toward!.r);
    if (first) next = first;
    else {
      // Score each way: a little randomness, a pull towards turning, and (for a preview) staying near you.
      const dir = prev ? { c: at.c - prev.c, r: at.r - prev.r } : null;
      let best = options[0]!;
      let bestScore = -Infinity;
      for (const n of options) {
        const straight = dir && n.c - at.c === dir.c && n.r - at.r === dir.r;
        let score = rand() * 1.4 + (straight ? 0 : 0.55);
        if (opts.stayNear) {
          const p = centre(n);
          score -= Math.hypot(p.x - opts.stayNear.x, p.y - opts.stayNear.y) / 40;
        }
        if (score > bestScore) {
          bestScore = score;
          best = n;
        }
      }
      next = best;
    }
    nodes.push(next);
    prev = at;
    at = next;
  }
  return laneOf(nodes);
}

const sub = (a: Pt, b: Pt) => ({ x: a.x - b.x, y: a.y - b.y });
const unit = (a: Pt) => {
  const l = Math.hypot(a.x, a.y) || 1;
  return { x: a.x / l, y: a.y / l };
};
/** To the right of heading `d` on screen (y points down). */
const right = (d: Pt) => ({ x: -d.y, y: d.x });

/** The lane through a list of junctions, with each corner rounded off, sampled finely. */
function laneOf(nodes: Node[]): TruckRoute {
  const c = nodes.map(centre);
  const o = TRUCK.lane;
  // Key points: the lane at the start, each corner (where the two lanes meet), the lane at the end.
  type Key = { p: Pt; d1?: Pt; d2?: Pt; side?: 'left' | 'right' };
  const keys: Key[] = [];
  const d0 = unit(sub(c[1]!, c[0]!));
  keys.push({ p: { x: c[0]!.x + right(d0).x * o, y: c[0]!.y + right(d0).y * o } });
  for (let i = 1; i < c.length - 1; i++) {
    const d1 = unit(sub(c[i]!, c[i - 1]!));
    const d2 = unit(sub(c[i + 1]!, c[i]!));
    const r1 = right(d1);
    const r2 = right(d2);
    const cross = d1.x * d2.y - d1.y * d2.x;
    if (Math.abs(cross) < 1e-6) continue; // straight on: no corner
    keys.push({
      p: { x: c[i]!.x + (r1.x + r2.x) * o, y: c[i]!.y + (r1.y + r2.y) * o },
      d1,
      d2,
      side: cross > 0 ? 'right' : 'left',
    });
  }
  const dn = unit(sub(c[c.length - 1]!, c[c.length - 2]!));
  keys.push({ p: { x: c[c.length - 1]!.x + right(dn).x * o, y: c[c.length - 1]!.y + right(dn).y * o } });

  const pts: TruckRoute['pts'] = [];
  const turns: Turn[] = [];
  let s = 0;
  const add = (p: Pt) => {
    const last = pts[pts.length - 1];
    if (last) s += Math.hypot(p.x - last.x, p.y - last.y);
    pts.push({ x: p.x, y: p.y, s });
  };
  const line = (a: Pt, b: Pt) => {
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.3));
    for (let k = 1; k <= n; k++) add({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  };
  add(keys[0]!.p);
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i]!;
    if (!k.d1 || !k.d2) {
      line(pts[pts.length - 1]!, k.p);
      continue;
    }
    // A right turn hugs the corner, a left one swings wide across the junction.
    const rad = k.side === 'right' ? 0.95 : 1.7;
    const a = { x: k.p.x - k.d1.x * rad, y: k.p.y - k.d1.y * rad };
    const b = { x: k.p.x + k.d2.x * rad, y: k.p.y + k.d2.y * rad };
    line(pts[pts.length - 1]!, a);
    const from = s;
    for (let j = 1; j <= 8; j++) {
      const t = j / 8;
      const u = 1 - t;
      add({
        x: u * u * a.x + 2 * u * t * k.p.x + t * t * b.x,
        y: u * u * a.y + 2 * u * t * k.p.y + t * t * b.y,
      });
    }
    turns.push({ from, to: s, side: k.side! });
  }
  return { pts, length: s, turns };
}

export interface Pose {
  x: number;
  y: number;
  /** Which way it points: the unit heading, and the angle from straight up (radians, clockwise). */
  hx: number;
  hy: number;
  angle: number;
}

/** Where the truck is, `s` tiles along its route. */
export function poseAt(route: TruckRoute, s: number): Pose {
  const pts = route.pts;
  s = Math.max(0, Math.min(route.length, s));
  let lo = 0;
  let hi = pts.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pts[mid]!.s <= s) lo = mid;
    else hi = mid;
  }
  const a = pts[lo]!;
  const b = pts[hi]!;
  const k = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0;
  // Heading from a short way either side, so it turns smoothly rather than snapping at each sample.
  const ahead = pointAt(route, s + 0.6);
  const behind = pointAt(route, s - 0.6);
  const h = unit(sub(ahead, behind));
  return {
    x: a.x + (b.x - a.x) * k,
    y: a.y + (b.y - a.y) * k,
    hx: h.x,
    hy: h.y,
    angle: Math.atan2(h.x, -h.y),
  };
}

function pointAt(route: TruckRoute, s: number): Pt {
  const pts = route.pts;
  s = Math.max(0, Math.min(route.length, s));
  let lo = 0;
  let hi = pts.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pts[mid]!.s <= s) lo = mid;
    else hi = mid;
  }
  const a = pts[lo]!;
  const b = pts[hi]!;
  const k = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0;
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}

/** The spot behind the back doors, where you jump on and where the bags fall out. */
export const rearOf = (p: Pose): Pt => ({
  x: p.x - p.hx * (TRUCK.length / 2 + 0.3),
  y: p.y - p.hy * (TRUCK.length / 2 + 0.3),
});

export interface Truck {
  route: TruckRoute;
  /** Tiles along the route, and speed. */
  s: number;
  v: number;
  state: 'driving' | 'braking' | 'stopped' | 'gone';
  /** How hard it's turning right now (-1 left .. 1 right), for the lean and for shaking you off. */
  turning: number;
}

export function newTruck(route: TruckRoute): Truck {
  return { route, s: 0, v: TRUCK.speed * 0.6, state: 'driving', turning: 0 };
}

/** The turn it's in or coming up to, and how far away it starts (0 inside it). */
export function nextTurn(t: Truck): { turn: Turn; in: number } | null {
  for (const turn of t.route.turns) if (turn.to > t.s) return { turn, in: Math.max(0, turn.from - t.s) };
  return null;
}

/** The blinker: on for the next turn when it's a couple of seconds away or under way. */
export function blinker(t: Truck): 'left' | 'right' | null {
  if (t.state !== 'driving') return null;
  const n = nextTurn(t);
  return n && n.in <= Math.max(3, t.v * TRUCK.signal) ? n.turn.side : null;
}

/** Drives the truck on by `dt` seconds. */
export function stepTruck(t: Truck, dt: number): void {
  if (t.state === 'gone' || t.state === 'stopped') {
    t.turning = 0;
    return;
  }
  if (t.state === 'braking') {
    t.v = Math.max(0, t.v - TRUCK.brake * dt);
    if (t.v === 0) t.state = 'stopped';
  } else {
    // As fast as it can go and still slow to corner speed by the next turn.
    const n = nextTurn(t);
    const room = n ? n.in : Infinity;
    const want = Math.min(TRUCK.speed, Math.sqrt(TRUCK.corner ** 2 + 2 * TRUCK.slow * room));
    if (t.v < want) t.v = Math.min(want, t.v + TRUCK.accel * dt);
    else t.v = Math.max(want, t.v - TRUCK.brake * dt);
  }
  t.s += t.v * dt;
  const n = nextTurn(t);
  const inTurn = n && n.in === 0 ? n.turn : null;
  const target = inTurn ? (inTurn.side === 'right' ? 1 : -1) * Math.min(1, t.v / TRUCK.corner) : 0;
  t.turning += (target - t.turning) * Math.min(1, dt * 6);
  if (t.s >= t.route.length) {
    t.s = t.route.length;
    if (t.state === 'driving') t.state = 'gone';
  }
}

/** The doors are open: the truck stamps on the brakes (and the bags start falling out). */
export function slam(t: Truck): void {
  if (t.state === 'driving') t.state = 'braking';
}

export interface Bag {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Seconds since it fell out (it bounces, then settles). */
  age: number;
}

/** A bag tumbling out of the back: thrown along with the truck, a little to one side. */
export function dropBag(t: Truck, id: number, rand: () => number, city: City = CITY): Bag {
  const p = poseAt(t.route, t.s);
  const r = rearOf(p);
  const side = (rand() - 0.5) * 1.4;
  const fling = 0.8 + rand() * 1.4;
  const bag = {
    id,
    x: r.x + -p.hy * side * 0.4,
    y: r.y + p.hx * side * 0.4,
    // Out of the back: thrown backwards off the moving truck (so they land behind it), and a little to one side.
    vx: -p.hx * fling - p.hy * side * 1.5,
    vy: -p.hy * fling + p.hx * side * 1.5,
    age: 0,
  };
  // Never inside a wall or a block: back onto the lane if it would be.
  if (!onStreet(bag.x, bag.y, city)) {
    bag.x = r.x;
    bag.y = r.y;
  }
  return bag;
}

const onStreet = (x: number, y: number, city: City) => {
  const g = groundAt(Math.floor(x), Math.floor(y), city);
  return g === Ground.Road || g === Ground.Cross || g === Ground.Walk;
};

/** Bags slide to a stop on the snow. */
export function stepBags(bags: Bag[], dt: number, city: City = CITY): void {
  for (const b of bags) {
    b.age += dt;
    const nx = b.x + b.vx * dt;
    const ny = b.y + b.vy * dt;
    if (onStreet(nx, ny, city)) {
      b.x = nx;
      b.y = ny;
    } else {
      b.vx = 0;
      b.vy = 0;
    }
    const f = Math.max(0, 1 - dt * 3.2);
    b.vx *= f;
    b.vy *= f;
  }
}

/**
 * A route for the preview: it starts a couple of junctions away from you and comes your way, then wanders the
 * streets round you, so you see it at once and can learn to catch it.
 */
export function previewRoute(me: Pt, rand: () => number, city: City = CITY): TruckRoute {
  const here = nearestJunction(me);
  const starts: Node[] = [];
  for (let c = 0; c <= COLS; c++)
    for (let r = 0; r <= ROWS; r++) {
      const d = Math.abs(c - here.c) + Math.abs(r - here.r);
      if (d === 2) starts.push({ c, r });
    }
  const start = starts[Math.floor(rand() * starts.length)] ?? { c: 0, r: 0 };
  const toward = NEXT.map((d) => ({ c: start.c + d.c, r: start.r + d.r })).find(
    (n) => Math.abs(n.c - here.c) + Math.abs(n.r - here.r) === 1 && drivable(start, n, city),
  );
  return truckRoute(start, rand, 34, { toward, stayNear: me, city });
}
