import type { PowerId } from '../heist/powers.ts';
import { Cell, DIRS, cellAt, distanceMap, open, type Dir, type RushMap } from './map.ts';

// One Cash Rush run, a step at a time (TPS steps a second). The same code runs in the browser for practice
// and on the live server for real raids, where it is the referee. Randomness comes from a seeded generator
// in the state, so a run with the same inputs plays out the same way.

export const TPS = 30;
export const DT = 1 / TPS;

export const RUSH = {
  /** Tiles a second. */
  speed: 5.2,
  sprint: 8.2,
  guardPatrol: 3.2,
  guardHunt: 4.0,
  guardHurry: 4.7,
  guardPanic: 2.8,
  defender: 4.8,
  dash: 8.5,
  /** How far off a tile's middle you can still turn into a side corridor (tiles). */
  turn: 0.4,
  /** Remember a turn pressed this early (seconds). */
  buffer: 0.15,
  /** Touching distance between a guard and you. */
  catch: 0.62,
  coin: 1,
  stack: 15,
  /** Pickups within this long of each other keep the combo going. */
  comboGap: 0.75,
  /** The multiplier goes up one for every this many pickups in a row, up to comboMax. */
  comboStep: 10,
  comboMax: 3,
  flip: 6,
  out: 6,
  /** Knocking out guards in one flip: 100, 200, 400, 800. */
  knockBonus: 100,
  alarm: 8,
  hurry: 15,
  /** Patrol and hunt, in turns (seconds); the last hunt lasts to the end. */
  waves: [7, 10, 6, 12, 5],
  /** Tags you can take: each costs a heart and this share of your cash; the last one busts you. */
  hearts: 3,
  tagLoss: 0.3,
  /** Seconds you flash (can't be tagged) after a tag. */
  safeTime: 1.6,
  laserOn: 1.2,
  laserOff: 1.5,
  /** The safe dial: degrees a second, and the green zone for each hit. */
  dialSpeed: 300,
  dialZones: [80, 56],
  /** Seconds the guards are knocked flat when the safe blows open: your head start. */
  blast: 3,
  noise: 4,
  sweepPercent: 80,
  sweepBonus: 25,
} as const;

export type GuardKind = 'bruiser' | 'cutter' | 'flanker' | 'drifter';
const KINDS: GuardKind[] = ['bruiser', 'cutter', 'flanker', 'drifter'];

export type GuardMode = 'patrol' | 'hunt' | 'panic' | 'out';

export interface Mover {
  x: number;
  y: number;
  /** Direction it's moving, or -1 standing. */
  dir: Dir | -1;
  /** Last way it faced: -1 left, 1 right. */
  face: -1 | 1;
}

export interface RushGuard extends Mover {
  kind: GuardKind;
  mode: GuardMode;
  /** Seconds left knocked out. */
  out: number;
  home: number;
  /** A defender (a real player) steers this guard; null for a bot. */
  human: string | null;
  dash: number;
  dashReady: number;
}

export interface RushInput {
  /** Wanted direction, or -1. */
  d: Dir | -1;
  /** Use pressed this step (crack the safe / press the dial). */
  use?: boolean;
  /** Power slot pressed this step. */
  p?: number;
}

export interface DefenderInput {
  d: Dir | -1;
  dash?: boolean;
}

export type RushPhase = 'play' | 'escaped' | 'busted';

export interface RushState {
  tick: number;
  phase: RushPhase;
  timeLeft: number;
  seed: number;
  me: Mover & { want: Dir | -1; wantFor: number };
  guards: RushGuard[];
  coins: boolean[];
  stacks: boolean[];
  flips: boolean[];
  carried: number;
  /** Pickups in a row and seconds since the last. */
  chain: number;
  chainAge: number;
  /** Seconds left on the flip (guards run), and how many were knocked out in it. */
  flip: number;
  knocked: number;
  alarm: number;
  /** Seconds into the waves of patrol and hunt. */
  clock: number;
  safe: { open: boolean; hits: number; dialing: boolean; needle: number; zone: number; at: number } | null;
  noise: { x: number; y: number; t: number } | null;
  powers: { id: PowerId; ready: number; used: boolean; left: number }[];
  /** Effects running: hide, sprint, tackle, magnet, hack. */
  fx: { hide: number; sprint: number; tackle: number; magnet: number; hack: number };
  bribed: boolean;
  hearts: number;
  /** Seconds left flashing after a tag. */
  safeTime: number;
  laserHit: number;
  swept: boolean;
  score: number;
  caughtBy: number | null;
}

export type RushEvent =
  | { t: 'coin'; x: number; y: number; value: number; mult: number }
  | { t: 'stack'; x: number; y: number; value: number; mult: number }
  | { t: 'combo'; mult: number }
  | { t: 'flip' }
  | { t: 'flipEnd' }
  | { t: 'knock'; i: number; bonus: number }
  | { t: 'wave'; hunt: boolean }
  | { t: 'dial' }
  | { t: 'hit'; n: number }
  | { t: 'miss' }
  | { t: 'safe'; value: number }
  | { t: 'laser' }
  | { t: 'hurry' }
  | { t: 'power'; id: PowerId }
  | { t: 'paid'; lost: number }
  | { t: 'tag'; i: number; lost: number; hearts: number }
  | { t: 'escaped'; score: number }
  | { t: 'busted'; by: number | null };

/** The rules a vault is played with: from its defence level and what's in the safe. */
export interface RushRules {
  /** 3 or 4 guards. */
  guards: number;
  safeValue: number;
  /** Extra hunting speed for richer vaults (tiles a second). */
  hunt: number;
  /** A break-out: you can only leave once the cell (the safe) is open. */
  needSafe?: boolean;
}

const rand = (s: RushState) => {
  // mulberry32
  let t = (s.seed = (s.seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const centre = (v: number) => Math.floor(v) + 0.5;

export function startRush(
  map: RushMap,
  rules: RushRules,
  powers: readonly PowerId[],
  seed: number,
): RushState {
  const at = (p: { x: number; y: number }) => ({ x: p.x + 0.5, y: p.y + 0.5 });
  const spots = map.guards.length ? map.guards : [map.corners[0]!];
  return {
    tick: 0,
    phase: 'play',
    timeLeft: map.seconds,
    seed: seed | 0,
    me: { ...at(map.start), dir: -1, face: 1, want: -1, wantFor: 0 },
    guards: Array.from({ length: rules.guards }, (_, i) => ({
      ...at(spots[i % spots.length]!),
      dir: -1 as const,
      face: 1 as const,
      kind: KINDS[i % KINDS.length]!,
      mode: 'patrol' as const,
      out: 0,
      home: i % map.corners.length,
      human: null,
      dash: 0,
      dashReady: 0,
    })),
    coins: map.coins.map(() => false),
    stacks: map.stacks.map(() => false),
    flips: map.flips.map(() => false),
    carried: 0,
    chain: 0,
    chainAge: 99,
    flip: 0,
    knocked: 0,
    alarm: 0,
    clock: 0,
    safe: map.safe ? { open: false, hits: 0, dialing: false, needle: 0, zone: 0, at: 0 } : null,
    noise: null,
    powers: powers.map((id) => ({ id, ready: 0, used: false, left: 0 })),
    fx: { hide: 0, sprint: 0, tackle: 0, magnet: 0, hack: 0 },
    bribed: false,
    hearts: RUSH.hearts,
    safeTime: 0,
    laserHit: 0,
    swept: false,
    score: 0,
    caughtBy: null,
  };
}

/** Hunting or patrolling right now, from the wave clock. */
export function hunting(s: RushState) {
  let t = s.clock;
  for (let i = 0; i < RUSH.waves.length; i++) {
    if (t < RUSH.waves[i]!) return i % 2 === 1;
    t -= RUSH.waves[i]!;
  }
  return true;
}

export const laserOn = (s: RushState, i: number) => {
  if (s.fx.hack > 0) return false;
  const period = RUSH.laserOn + RUSH.laserOff;
  return (s.timeLeft + i * 0.9) % period < RUSH.laserOn;
};

/**
 * Moves a body along the corridors: it keeps going the way it's heading, turns into a side opening when you
 * ask near enough to its middle (snapping onto the line), and stops at walls. Corridors are one tile wide,
 * so this is what lets you corner cleanly at speed.
 */
function glide(m: RushMap, b: Mover, want: Dir | -1, dist: number) {
  const tx = Math.floor(b.x);
  const ty = Math.floor(b.y);
  if (want !== -1) {
    const [wx, wy] = DIRS[want];
    // How far you are off the line you'd travel along going that way.
    const off = wx !== 0 ? Math.abs(b.y - centre(b.y)) : Math.abs(b.x - centre(b.x));
    const sameAxis = b.dir !== -1 && (DIRS[b.dir][0] !== 0) === (wx !== 0);
    if (sameAxis || off < 1e-6) b.dir = want;
    else if (off <= (b.dir === -1 ? 0.5 : RUSH.turn) && open(m, tx + wx, ty + wy)) {
      // Turn into the side corridor: snap onto its line.
      if (wx !== 0) b.y = centre(b.y);
      else b.x = centre(b.x);
      b.dir = want;
    }
    // Otherwise keep going the way you were: the turn happens as soon as the opening comes.
  } else b.dir = -1;
  if (b.dir === -1) return;
  const [dx, dy] = DIRS[b.dir];
  if (dx) b.face = dx < 0 ? -1 : 1;
  // Keep to the corridor's line.
  if (dx) b.y = centre(b.y);
  else b.x = centre(b.x);
  let left = dist;
  while (left > 1e-9) {
    const cx = Math.floor(b.x);
    const cy = Math.floor(b.y);
    const toMid = dx
      ? dx > 0
        ? centre(b.x) - b.x
        : b.x - centre(b.x)
      : dy > 0
        ? centre(b.y) - b.y
        : b.y - centre(b.y);
    if (toMid > 1e-9) {
      // Before the middle of this tile: go up to it.
      const step = Math.min(left, toMid);
      b.x += dx * step;
      b.y += dy * step;
      left -= step;
      continue;
    }
    // At or past the middle: carry on only if the next tile is open.
    if (!open(m, cx + dx, cy + dy)) {
      b.x = centre(b.x);
      b.y = centre(b.y);
      return;
    }
    const step = Math.min(left, 1 - Math.max(0, -toMid));
    b.x += dx * step;
    b.y += dy * step;
    left -= step;
  }
}

/** Choose a bot guard's way at the middle of a tile: the open way (not back) that gets closest to its target. */
function steer(m: RushMap, s: RushState, g: RushGuard, target: { x: number; y: number }, away = false) {
  const tx = Math.floor(g.x);
  const ty = Math.floor(g.y);
  const tgt = nearestOpen(m, Math.round(target.x - 0.5), Math.round(target.y - 0.5));
  const dist = away ? null : distanceMap(m, tgt.x, tgt.y);
  let best: Dir | -1 = -1;
  let bestScore = Infinity;
  const ways: Dir[] = [];
  for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
    const [dx, dy] = DIRS[d];
    if (!open(m, tx + dx, ty + dy) || cellAt(m, tx + dx, ty + dy) === Cell.Exit) continue;
    ways.push(d);
  }
  const back = g.dir === -1 ? -1 : (((g.dir + 2) % 4) as Dir);
  const choices = ways.length > 1 ? ways.filter((d) => d !== back) : ways;
  for (const d of choices) {
    const [dx, dy] = DIRS[d];
    const nx = tx + dx;
    const ny = ty + dy;
    let score: number;
    if (away) score = -((nx + 0.5 - s.me.x) ** 2 + (ny + 0.5 - s.me.y) ** 2) + rand(s) * 2;
    else {
      const v = dist![ny * m.w + nx]!;
      score = (v < 0 ? 999 : v) + rand(s) * 0.01;
    }
    if (score < bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

function nearestOpen(m: RushMap, x: number, y: number) {
  x = Math.max(0, Math.min(m.w - 1, x));
  y = Math.max(0, Math.min(m.h - 1, y));
  if (open(m, x, y)) return { x, y };
  for (let r = 1; r < Math.max(m.w, m.h); r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        if (open(m, x + dx, y + dy)) return { x: x + dx, y: y + dy };
      }
  return { x, y };
}

/** Where a hunting bot guard is heading: each kind reads you differently (like Pac-Man's ghosts). */
function huntTarget(m: RushMap, s: RushState, i: number) {
  const g = s.guards[i]!;
  const me = s.me;
  const [fx, fy] = me.dir === -1 ? [0, 0] : DIRS[me.dir];
  if (s.noise) return s.noise;
  if (s.fx.hide > 0) return { x: m.corners[g.home]!.x + 0.5, y: m.corners[g.home]!.y + 0.5 };
  switch (g.kind) {
    case 'bruiser':
      return me;
    case 'cutter':
      return { x: me.x + fx * 3, y: me.y + fy * 3 };
    case 'flanker': {
      const b = s.guards.find((x) => x.kind === 'bruiser') ?? g;
      const px = me.x + fx * 2;
      const py = me.y + fy * 2;
      return { x: px * 2 - b.x, y: py * 2 - b.y };
    }
    case 'drifter': {
      const far = (g.x - me.x) ** 2 + (g.y - me.y) ** 2 > 36;
      return far ? me : { x: m.corners[g.home]!.x + 0.5, y: m.corners[g.home]!.y + 0.5 };
    }
  }
}

const atMiddle = (b: Mover) => Math.abs(b.x - centre(b.x)) < 1e-6 && Math.abs(b.y - centre(b.y)) < 1e-6;

function pickup(s: RushState, value: number, x: number, y: number, kind: 'coin' | 'stack', ev: RushEvent[]) {
  s.chain = s.chainAge <= RUSH.comboGap ? s.chain + 1 : 1;
  s.chainAge = 0;
  const mult = Math.min(RUSH.comboMax, 1 + Math.floor((s.chain - 1) / RUSH.comboStep));
  if (s.chain > 1 && (s.chain - 1) % RUSH.comboStep === 0 && mult <= RUSH.comboMax)
    ev.push({ t: 'combo', mult });
  const v = value * mult;
  s.carried += v;
  ev.push({ t: kind, x, y, value: v, mult });
}

/** What escaping pays: what you carry, +25% for taking most of the cash and the safe. */
export function rushScore(m: RushMap, s: RushState) {
  const all = m.coins.length + m.stacks.length * (RUSH.stack / RUSH.coin);
  const took = s.coins.filter(Boolean).length + s.stacks.filter(Boolean).length * (RUSH.stack / RUSH.coin);
  const swept = (!s.safe || s.safe.open) && took * 100 >= all * RUSH.sweepPercent;
  return { swept, score: Math.floor((s.carried * (swept ? 100 + RUSH.sweepBonus : 100)) / 100) };
}

/**
 * One step. `you` is the robber's input; `defenders` steer the guards they have taken over (by name).
 * Returns what happened, for sounds and effects.
 */
export function stepRush(
  s: RushState,
  m: RushMap,
  rules: RushRules,
  you: RushInput,
  defenders: Record<string, DefenderInput> = {},
): RushEvent[] {
  if (s.phase !== 'play') return [];
  const ev: RushEvent[] = [];
  s.tick++;
  const wasHunting = hunting(s);
  s.clock += DT;
  s.timeLeft = Math.max(0, s.timeLeft - DT);
  s.chainAge += DT;
  for (const k of Object.keys(s.fx) as (keyof RushState['fx'])[]) s.fx[k] = Math.max(0, s.fx[k] - DT);
  if (s.noise && (s.noise.t -= DT) <= 0) s.noise = null;
  const hadFlip = s.flip > 0;
  s.flip = Math.max(0, s.flip - DT);
  if (hadFlip && s.flip === 0) {
    ev.push({ t: 'flipEnd' });
    for (const g of s.guards) if (g.mode === 'panic') g.mode = 'patrol';
  }
  s.alarm = Math.max(0, s.alarm - DT);
  s.safeTime = Math.max(0, s.safeTime - DT);
  s.laserHit = Math.max(0, s.laserHit - DT);
  const nowHunting = hunting(s);
  if (nowHunting !== wasHunting) {
    ev.push({ t: 'wave', hunt: nowHunting });
    // Turning round tells you the guards have changed their minds.
    for (const g of s.guards)
      if (!g.human && g.dir !== -1 && g.mode !== 'out') g.dir = ((g.dir + 2) % 4) as Dir;
  }
  if (s.timeLeft <= RUSH.hurry && s.timeLeft + DT > RUSH.hurry) ev.push({ t: 'hurry' });

  usePower(s, m, you.p ?? -1, ev);

  // You.
  const me = s.me;
  const safe = s.safe;
  if (safe?.dialing) {
    safe.needle = (safe.needle + RUSH.dialSpeed * (s.fx.hack > 0 ? 0.6 : 1) * DT) % 360;
    if (you.d !== -1) safe.dialing = false;
    else if (you.use && s.tick - safe.at > 4) {
      safe.at = s.tick;
      const lock = s.powers.some((p) => p.id === 'lockpick') ? 1.5 : 1;
      const half = (RUSH.dialZones[safe.hits]! * lock) / 2;
      const off = Math.abs(((safe.needle - safe.zone + 540) % 360) - 180);
      if (off <= half) {
        safe.hits++;
        ev.push({ t: 'hit', n: safe.hits });
        if (safe.hits >= RUSH.dialZones.length) {
          safe.open = true;
          safe.dialing = false;
          s.carried += rules.safeValue;
          ev.push({ t: 'safe', value: rules.safeValue });
          for (const g of s.guards)
            if (g.mode !== 'out') {
              g.mode = 'out';
              g.out = RUSH.blast;
            }
        } else safe.zone = Math.floor(rand(s) * 360);
      } else {
        ev.push({ t: 'miss' });
        s.alarm = Math.max(s.alarm, RUSH.noise);
        s.noise = { x: m.safe!.x + 0.5, y: m.safe!.y + 1.5, t: RUSH.noise };
      }
    }
  }
  if (!safe?.dialing) {
    if (you.d !== -1) {
      me.want = you.d;
      me.wantFor = RUSH.buffer;
    } else if ((me.wantFor -= DT) <= 0) me.want = -1;
    // A held key keeps moving; a tap is remembered just long enough to make a turn.
    const want = you.d !== -1 ? you.d : me.want;
    glide(m, me, want, (s.fx.sprint > 0 ? RUSH.sprint : RUSH.speed) * DT);
    // Start cracking: Use next to the safe.
    if (you.use && safe && !safe.open && m.safe) {
      const d = Math.abs(me.x - (m.safe.x + 0.5)) + Math.abs(me.y - (m.safe.y + 0.5));
      if (d <= 1.15) {
        safe.dialing = true;
        safe.at = s.tick;
        safe.zone = Math.floor(rand(s) * 360);
        me.dir = -1;
        ev.push({ t: 'dial' });
      }
    }
  }

  // Pickups.
  const reach = s.fx.magnet > 0 ? 2.5 : 0.5;
  m.coins.forEach((c, i) => {
    if (s.coins[i] || Math.abs(c.x + 0.5 - me.x) > reach || Math.abs(c.y + 0.5 - me.y) > reach) return;
    s.coins[i] = true;
    pickup(s, RUSH.coin, c.x, c.y, 'coin', ev);
  });
  m.stacks.forEach((c, i) => {
    if (
      s.stacks[i] ||
      Math.abs(c.x + 0.5 - me.x) > Math.max(reach, 0.6) ||
      Math.abs(c.y + 0.5 - me.y) > Math.max(reach, 0.6)
    )
      return;
    s.stacks[i] = true;
    pickup(s, RUSH.stack, c.x, c.y, 'stack', ev);
  });
  m.flips.forEach((f, i) => {
    if (s.flips[i] || Math.abs(f.x + 0.5 - me.x) > 0.6 || Math.abs(f.y + 0.5 - me.y) > 0.6) return;
    s.flips[i] = true;
    s.flip = RUSH.flip;
    s.knocked = 0;
    for (const g of s.guards)
      if (g.mode !== 'out') {
        g.mode = 'panic';
        if (!g.human && g.dir !== -1) g.dir = ((g.dir + 2) % 4) as Dir;
      }
    ev.push({ t: 'flip' });
  });
  // Laser gates.
  if (s.laserHit === 0)
    m.lasers.forEach((l, i) => {
      if (Math.floor(me.x) === l.x && Math.floor(me.y) === l.y && laserOn(s, i) && s.fx.hide === 0) {
        s.alarm = RUSH.alarm;
        s.laserHit = 2;
        ev.push({ t: 'laser' });
      }
    });

  // Out the door.
  const ex = m.exit;
  const canLeave = rules.needSafe ? !!s.safe?.open : s.carried > 0;
  if (canLeave && Math.abs(me.x - (ex.x + 0.5)) < 0.55 && Math.abs(me.y - (ex.y + 0.5)) < 0.55) {
    const out = rushScore(m, s);
    s.score = out.score;
    s.swept = out.swept;
    s.phase = 'escaped';
    ev.push({ t: 'escaped', score: s.score });
    return ev;
  }

  // Guards.
  s.guards.forEach((g, i) => {
    if (g.mode === 'out') {
      g.out -= DT;
      if (g.out <= 0) {
        g.mode = 'patrol';
        g.out = 0;
      }
      return;
    }
    if (g.mode !== 'panic') g.mode = hunting(s) || s.alarm > 0 || s.noise ? 'hunt' : 'patrol';
    const hurry = s.timeLeft <= RUSH.hurry;
    if (g.human) {
      const input = defenders[g.human] ?? { d: -1 };
      g.dashReady = Math.max(0, g.dashReady - DT);
      g.dash = Math.max(0, g.dash - DT);
      if (input.dash && g.dashReady === 0 && g.mode !== 'panic') {
        g.dash = 0.35;
        g.dashReady = 3;
      }
      const v = g.mode === 'panic' ? RUSH.guardPanic : g.dash > 0 ? RUSH.dash : RUSH.defender;
      glide(m, g, input.d, v * DT);
      if (input.d === -1) g.dir = -1;
    } else {
      const v =
        g.mode === 'panic'
          ? RUSH.guardPanic
          : g.mode === 'hunt'
            ? (hurry ? RUSH.guardHurry : RUSH.guardHunt) + rules.hunt + (s.alarm > 0 ? 0.5 : 0)
            : RUSH.guardPatrol;
      let left = v * DT;
      // Decide at every tile middle on the way.
      for (let k = 0; k < 3 && left > 1e-9; k++) {
        if (atMiddle(g) || g.dir === -1) {
          const target =
            g.mode === 'panic'
              ? null
              : g.mode === 'hunt'
                ? huntTarget(m, s, i)
                : { x: m.corners[g.home]!.x + 0.5, y: m.corners[g.home]!.y + 0.5 };
          const d = target ? steer(m, s, g, target) : steer(m, s, g, s.me, true);
          if (d !== -1) g.dir = d;
          // At the patrol corner: pick the next corner round the maze to wander to.
          if (
            g.mode === 'patrol' &&
            target &&
            Math.floor(g.x) === Math.floor(target.x) &&
            Math.floor(g.y) === Math.floor(target.y)
          )
            g.home = (g.home + 1 + Math.floor(rand(s) * 3)) % m.corners.length;
        }
        const before = { x: g.x, y: g.y };
        const step = Math.min(left, distToMiddle(g));
        glide(m, g, g.dir, step > 1e-9 ? step : left);
        const moved = Math.abs(g.x - before.x) + Math.abs(g.y - before.y);
        left -= moved > 1e-9 ? moved : left;
      }
    }
    // Touching you.
    const d2 = (g.x - me.x) ** 2 + (g.y - me.y) ** 2;
    if (d2 > RUSH.catch * RUSH.catch || s.phase !== 'play') return;
    if (g.mode === 'panic' || s.fx.tackle > 0) {
      g.mode = 'out';
      g.out = RUSH.out;
      const bonus = RUSH.knockBonus * 2 ** s.knocked;
      s.knocked++;
      s.carried += bonus;
      ev.push({ t: 'knock', i, bonus });
      return;
    }
    if (s.safeTime > 0) return;
    if (s.powers.some((p) => p.id === 'bribe' && !p.used) && !s.bribed) {
      // Paid off: lose a third of what you carry, and the guard looks the other way.
      const p = s.powers.find((x) => x.id === 'bribe')!;
      p.used = true;
      s.bribed = true;
      const lost = Math.floor(s.carried / 3);
      s.carried -= lost;
      g.mode = 'out';
      g.out = 2.5;
      ev.push({ t: 'paid', lost });
      return;
    }
    if (s.hearts > 1) {
      // Tagged: drop some cash, lose a heart, flash for a moment to get away. The guard stops to gloat.
      s.hearts--;
      const lost = Math.floor(s.carried * RUSH.tagLoss);
      s.carried -= lost;
      s.safeTime = RUSH.safeTime;
      s.chain = 0;
      g.mode = 'out';
      g.out = 1.2;
      if (safe) safe.dialing = false;
      ev.push({ t: 'tag', i, lost, hearts: s.hearts });
      return;
    }
    s.hearts = 0;
    s.phase = 'busted';
    s.caughtBy = i;
    ev.push({ t: 'busted', by: i });
  });
  if (s.phase === 'play' && s.timeLeft <= 0) {
    s.phase = 'busted';
    s.caughtBy = null;
    ev.push({ t: 'busted', by: null });
  }
  return ev;
}

function distToMiddle(b: Mover) {
  if (b.dir === -1) return 0;
  const [dx, dy] = DIRS[b.dir];
  const v = dx
    ? dx > 0
      ? centre(b.x) - b.x
      : b.x - centre(b.x)
    : dy > 0
      ? centre(b.y) - b.y
      : b.y - centre(b.y);
  return v > 1e-9 ? v : 1 + v;
}

/** The powers, reread for Cash Rush (same ids and the same traits give them). */
export const RUSH_POWERS: Record<
  PowerId,
  { name: string; does: string; lasts: number; cooldown: number; once?: boolean; passive?: boolean }
> = {
  hide: { name: 'Hide', does: 'Guards lose track of you for 4 seconds.', lasts: 4, cooldown: 12 },
  zap: { name: 'Laser eyes', does: 'Knocks out the nearest guard for 5 seconds.', lasts: 5, cooldown: 12 },
  sprint: { name: 'Sprint', does: 'Run much faster for 3 seconds.', lasts: 3, cooldown: 9 },
  distract: { name: 'Distract', does: 'A noise ahead of you pulls the guards away.', lasts: 3, cooldown: 10 },
  hack: { name: 'Hack', does: 'Lasers off and a slower safe dial for 8 seconds.', lasts: 8, cooldown: 16 },
  tackle: {
    name: 'Tackle',
    does: 'For 5 seconds, run into guards to knock them out.',
    lasts: 5,
    cooldown: 14,
  },
  bribe: {
    name: 'Bribe',
    does: 'Caught once? Pay a third of your cash and walk on.',
    lasts: 0,
    cooldown: 0,
    passive: true,
  },
  magnet: { name: 'Magnet', does: 'Pulls in cash from 2 tiles away for 5 seconds.', lasts: 5, cooldown: 12 },
  blink: { name: 'Blink', does: 'Jumps you 3 tiles ahead.', lasts: 0, cooldown: 8 },
  scare: { name: 'Scare', does: 'Guards near you run away for 4 seconds.', lasts: 4, cooldown: 12 },
  lockpick: {
    name: 'Lockpick',
    does: 'A wider green on the safe dial.',
    lasts: 0,
    cooldown: 0,
    passive: true,
  },
};

function usePower(s: RushState, m: RushMap, slot: number, ev: RushEvent[]) {
  const pw = s.powers[slot];
  if (!pw) return;
  const def = RUSH_POWERS[pw.id];
  if (def.passive || pw.used || s.clock < pw.ready) return;
  const me = s.me;
  switch (pw.id) {
    case 'hide':
    case 'sprint':
    case 'tackle':
    case 'magnet':
    case 'hack':
      s.fx[pw.id] = def.lasts;
      break;
    case 'zap': {
      let best = -1;
      let bd = 36;
      s.guards.forEach((g, i) => {
        const d = (g.x - me.x) ** 2 + (g.y - me.y) ** 2;
        if (g.mode !== 'out' && d < bd) {
          best = i;
          bd = d;
        }
      });
      if (best < 0) return;
      const g = s.guards[best]!;
      g.mode = 'out';
      g.out = def.lasts;
      ev.push({ t: 'knock', i: best, bonus: 0 });
      break;
    }
    case 'distract': {
      let x = Math.floor(me.x);
      let y = Math.floor(me.y);
      const [dx, dy] = DIRS[me.dir === -1 ? 0 : me.dir];
      for (let k = 0; k < 5 && open(m, x + dx, y + dy); k++) {
        x += dx;
        y += dy;
      }
      s.noise = { x: x + 0.5, y: y + 0.5, t: def.lasts };
      break;
    }
    case 'blink': {
      if (me.dir === -1) return;
      const [dx, dy] = DIRS[me.dir];
      for (let k = 3; k >= 1; k--) {
        const x = Math.floor(me.x) + dx * k;
        const y = Math.floor(me.y) + dy * k;
        if (!open(m, x, y) || cellAt(m, x, y) === Cell.Exit) continue;
        me.x = x + 0.5;
        me.y = y + 0.5;
        break;
      }
      break;
    }
    case 'scare':
      for (const g of s.guards)
        if (g.mode !== 'out' && (g.x - me.x) ** 2 + (g.y - me.y) ** 2 < 25) {
          g.mode = 'panic';
          if (s.flip < def.lasts) s.flip = def.lasts;
        }
      break;
    default:
      return;
  }
  pw.used = !!def.once;
  pw.ready = s.clock + def.cooldown;
  ev.push({ t: 'power', id: pw.id });
}
