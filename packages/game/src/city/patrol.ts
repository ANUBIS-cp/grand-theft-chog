import { BH, BW, CITY, COLS, Ground, ROAD, ROWS, groundAt, type City } from './map.ts';

// Police cars on a getaway: sirens going, they drive the roads around the robber, keeping to their side of the
// road and turning at the junctions towards the bag. They're there for the show (the officers on foot make the
// catch, see police.ts), so this runs in each browser and nothing is sent.

/** Tiles a second. */
const SPEED = 4.6;

export interface PatrolCar {
  /** The junction it left and the one it's driving to (grid column, row). */
  from: { c: number; r: number };
  to: { c: number; r: number };
  /** 0..1 along the way between them. */
  k: number;
  /** Where it is and which way it faces: 0 up, 1 right, 2 down, 3 left. */
  x: number;
  y: number;
  dir: 0 | 1 | 2 | 3;
  /** Sirens start at slightly different times. */
  phase: number;
}

const STEP_X = BW + ROAD;
const STEP_Y = BH + ROAD;
/** The middle of a junction, in tiles. */
const centre = (c: number, r: number) => ({ x: c * STEP_X + ROAD / 2, y: r * STEP_Y + ROAD / 2 });

/** Is the road between two neighbouring junctions a road (not paved over, like the plaza's)? */
function drivable(a: { c: number; r: number }, b: { c: number; r: number }, city: City) {
  if (b.c < 0 || b.r < 0 || b.c > COLS || b.r > ROWS) return false;
  const p = centre(a.c, a.r);
  const q = centre(b.c, b.r);
  for (let i = 1; i < 6; i++) {
    const g = groundAt((p.x + (q.x - p.x) * (i / 6)) | 0, (p.y + (q.y - p.y) * (i / 6)) | 0, city);
    if (g !== Ground.Road && g !== Ground.Cross && g !== Ground.Prop) return false;
  }
  return true;
}

const dirOf = (a: { c: number; r: number }, b: { c: number; r: number }): 0 | 1 | 2 | 3 =>
  b.c > a.c ? 1 : b.c < a.c ? 3 : b.r > a.r ? 2 : 0;

const NEXT = [
  { c: 0, r: -1 },
  { c: 1, r: 0 },
  { c: 0, r: 1 },
  { c: -1, r: 0 },
];

/** Picks the next junction: towards the target mostly, never straight back unless it has to. */
function pick(
  at: { c: number; r: number },
  came: { c: number; r: number },
  target: { x: number; y: number },
  rnd: () => number,
  city: City,
) {
  const options = NEXT.map((d) => ({ c: at.c + d.c, r: at.r + d.r })).filter(
    (n) => drivable(at, n, city) && !(n.c === came.c && n.r === came.r),
  );
  if (!options.length) return came;
  let best = options[0]!;
  let bestScore = Infinity;
  for (const n of options) {
    const p = centre(n.c, n.r);
    const score = Math.hypot(p.x - target.x, p.y - target.y) + rnd() * 9;
    if (score < bestScore) {
      bestScore = score;
      best = n;
    }
  }
  return best;
}

/** Puts the car on its lane: keeps right, so the two ways pass each other. */
function place(car: PatrolCar) {
  const p = centre(car.from.c, car.from.r);
  const q = centre(car.to.c, car.to.r);
  car.dir = dirOf(car.from, car.to);
  const side = 0.42;
  car.x = p.x + (q.x - p.x) * car.k + (car.dir === 0 ? side : car.dir === 2 ? -side : 0);
  car.y = p.y + (q.y - p.y) * car.k + (car.dir === 1 ? side : car.dir === 3 ? -side : 0);
}

/** A car starting at a junction some way from the target, heading its way. */
export function spawnPatrol(
  target: { x: number; y: number },
  rnd: () => number,
  city: City = CITY,
): PatrolCar {
  const tc = Math.round((target.x - ROAD / 2) / STEP_X);
  const tr = Math.round((target.y - ROAD / 2) / STEP_Y);
  for (let tries = 0; tries < 40; tries++) {
    const c = Math.max(0, Math.min(COLS, tc + Math.round((rnd() - 0.5) * 4)));
    const r = Math.max(0, Math.min(ROWS, tr + Math.round((rnd() - 0.5) * 4)));
    if (Math.abs(c - tc) + Math.abs(r - tr) < 1) continue;
    const from = { c, r };
    const to = pick(from, { c: -9, r: -9 }, target, rnd, city);
    if (to.c === -9) continue;
    const car: PatrolCar = { from, to, k: 0, x: 0, y: 0, dir: 1, phase: rnd() * 1000 };
    place(car);
    return car;
  }
  const car: PatrolCar = { from: { c: 0, r: 0 }, to: { c: 1, r: 0 }, k: 0, x: 0, y: 0, dir: 1, phase: 0 };
  place(car);
  return car;
}

/** Drives every car on by `dt` seconds. */
export function stepPatrol(
  cars: PatrolCar[],
  target: { x: number; y: number },
  dt: number,
  rnd: () => number,
  city: City = CITY,
) {
  for (const car of cars) {
    const p = centre(car.from.c, car.from.r);
    const q = centre(car.to.c, car.to.r);
    car.k += (SPEED * dt) / Math.max(1, Math.hypot(q.x - p.x, q.y - p.y));
    while (car.k >= 1) {
      car.k -= 1;
      const next = pick(car.to, car.from, target, rnd, city);
      car.from = car.to;
      car.to = next;
    }
    place(car);
  }
}
