import {
  ANGLES,
  DIR_ANGLE,
  DX,
  DY,
  LOOT_VALUE,
  TPS,
  Tile,
  UNIT,
  bfsPath,
  blocksLight,
  distances,
  tileAt,
  walkable,
  type Dir,
  type Level,
  type LootKind,
} from './level.ts';
import { POWERS, type PowerId } from './powers.ts';

// One heist, one tick at a time. Integer maths only, no clocks, no Math.random: the same inputs always give
// the same run, so the server can replay a run from its inputs and check the score.

/** Units per tick. Chasing guards alternate 2 and 3: a bit slower than you, so a clean run for the exit works. */
export const SPEED = { walk: 3, sprint: 6, guard: 2 } as const;
export const SEE_RANGE = (9 * UNIT) / 2;
export const CHASE_RANGE = 6 * UNIT;
export const CAMERA_RANGE = 4 * UNIT;
/** Flashlight half-width: tan of the half-angle, in tenths (5.5 -> about 29 degrees each side). */
export const CONE_TAN = 0.55;
/** Ticks a light has to stay on you before it counts as being seen. */
export const SPOT = 15;
export const CRACK = 45;
export const ALARM = 10 * TPS;
const TOUCH = 18;

export interface Input {
  d: Dir | -1;
  /** Power slot pressed this tick, or -1. */
  p: number;
}
export const IDLE: Input = { d: -1, p: -1 };

export type Phase = 'play' | 'alarm' | 'escaped' | 'busted';
type Mode = 'patrol' | 'look' | 'chase' | 'back';

export interface Guard {
  x: number;
  y: number;
  dir: Dir | -1;
  a: number;
  want: number;
  step: number;
  wait: number;
  look: number;
  base: number;
  mode: Mode;
  goal: [number, number] | null;
  stun: number;
  sus: number;
}

export interface Camera {
  r: number;
  sweep: 1 | -1;
  stun: number;
  sus: number;
}

export interface HeistState {
  tick: number;
  phase: Phase;
  timeLeft: number;
  alarmLeft: number;
  alarmBy: 'guard' | 'camera' | 'laser' | 'time' | null;
  player: {
    x: number;
    y: number;
    dir: Dir | -1;
    face: Dir;
    hide: number;
    sprint: number;
    tackle: number;
    magnet: number;
    /** Index of the safe being cracked this tick, or -1. */
    crack: number;
  };
  taken: boolean[];
  safes: { progress: number; open: boolean }[];
  guards: Guard[];
  cameras: Camera[];
  hacked: number;
  noise: { x: number; y: number; t: number } | null;
  powers: { id: PowerId; used: boolean }[];
  freePass: boolean;
  carried: number;
  spotted: boolean;
  score: number;
  caughtBy: number | null;
}

export type HeistEvent =
  | { t: 'loot'; kind: LootKind; value: number; x: number; y: number }
  | { t: 'safe'; value: number; x: number; y: number }
  | { t: 'alarm'; by: 'guard' | 'camera' | 'laser' | 'time'; i: number }
  | { t: 'calm' }
  | { t: 'pass'; i: number }
  | { t: 'power'; id: PowerId }
  | { t: 'zap'; x: number; y: number; tx: number; ty: number; hit: 'guard' | 'camera' | null }
  | { t: 'blink'; fx: number; fy: number; tx: number; ty: number }
  | { t: 'noise'; x: number; y: number }
  | { t: 'stun'; who: 'guard' | 'camera'; i: number }
  | { t: 'escaped'; score: number }
  | { t: 'busted'; by: number | null };

const tileOf = (u: number) => Math.floor((u + UNIT / 2) / UNIT);
const atCenter = (b: { x: number; y: number }) => b.x % UNIT === 0 && b.y % UNIT === 0;

export function startHeist(level: Level, powers: readonly PowerId[]): HeistState {
  return {
    tick: 0,
    phase: 'play',
    timeLeft: level.ticks,
    alarmLeft: 0,
    alarmBy: null,
    player: {
      x: level.start[0] * UNIT,
      y: level.start[1] * UNIT,
      dir: -1,
      face: 0,
      hide: 0,
      sprint: 0,
      tackle: 0,
      magnet: 0,
      crack: -1,
    },
    taken: level.loot.map(() => false),
    safes: level.safes.map(() => ({ progress: 0, open: false })),
    guards: level.guards.map((g) => {
      const [x, y] = g.path[0]!;
      const next = g.path[1 % g.path.length]!;
      const d = dirBetween([x, y], next);
      const a = d === -1 ? 16 : DIR_ANGLE[d];
      return {
        x: x * UNIT,
        y: y * UNIT,
        dir: -1,
        a,
        want: a,
        step: 0,
        wait: g.stops.get(0) ?? 0,
        look: 0,
        base: a,
        mode: 'patrol',
        goal: null,
        stun: 0,
        sus: 0,
      };
    }),
    cameras: level.cameras.map(() => ({ r: 0, sweep: 1, stun: 0, sus: 0 })),
    hacked: 0,
    noise: null,
    powers: powers.map((id) => ({ id, used: false })),
    freePass: false,
    carried: 0,
    spotted: false,
    score: 0,
    caughtBy: null,
  };
}

function dirBetween(a: [number, number], b: [number, number]): Dir | -1 {
  for (let d = 0 as Dir; d < 4; d++) if (a[0] + DX[d] === b[0] && a[1] + DY[d] === b[1]) return d as Dir;
  return -1;
}

/** Advance a body up to `speed` units along its direction, stopping at tile centres to let `choose` turn it. */
function travel(
  b: { x: number; y: number; dir: Dir | -1 },
  speed: number,
  choose: () => void,
) {
  let left = speed;
  let guard = 8;
  while (left > 0 && guard-- > 0) {
    if (atCenter(b)) {
      choose();
      if (b.dir === -1) return;
    }
    const d = b.dir as Dir;
    const off = DX[d] !== 0 ? b.x % UNIT : b.y % UNIT;
    const sign = DX[d] + DY[d];
    const toCenter = off === 0 ? UNIT : sign > 0 ? UNIT - off : off;
    const stepBy = Math.min(left, toCenter);
    b.x += DX[d] * stepBy;
    b.y += DY[d] * stepBy;
    left -= stepBy;
  }
}

/** Is the point (px, py) inside a light at (ox, oy) facing angle a, and not behind a wall? */
export function inLight(level: Level, ox: number, oy: number, a: number, px: number, py: number, range: number) {
  const vx = px - ox;
  const vy = py - oy;
  if (vx * vx + vy * vy > range * range) return false;
  const [cx, cy] = ANGLES[a]!;
  const fwd = Math.trunc((vx * cx + vy * cy) / 1024);
  const side = Math.abs(Math.trunc((vx * cy - vy * cx) / 1024));
  if (fwd <= 0 || side * 20 > fwd * 11 + 120) return false;
  return clearLine(level, ox, oy, px, py);
}

/** No light-blocking tile between the two points (their own tiles don't count). */
export function clearLine(level: Level, ox: number, oy: number, px: number, py: number) {
  const vx = px - ox;
  const vy = py - oy;
  const steps = Math.trunc(Math.max(Math.abs(vx), Math.abs(vy)) / 6) + 1;
  const ot = [tileOf(ox), tileOf(oy)];
  const pt = [tileOf(px), tileOf(py)];
  for (let i = 1; i < steps; i++) {
    const tx = tileOf(ox + Math.trunc((vx * i) / steps));
    const ty = tileOf(oy + Math.trunc((vy * i) / steps));
    if ((tx === ot[0] && ty === ot[1]) || (tx === pt[0] && ty === pt[1])) continue;
    if (blocksLight(level, tx, ty)) return false;
  }
  return true;
}

/** Where a camera sits (the edge of its wall tile facing out) and where it points. */
export function cameraView(level: Level, s: HeistState, i: number) {
  const def = level.cameras[i]!;
  const a = (def.from + s.cameras[i]!.r) % 64;
  const span = (def.to - def.from + 64) % 64;
  const mid = (def.from + Math.trunc(span / 2)) % 64;
  const [cx, cy] = ANGLES[mid]!;
  return {
    x: def.x * UNIT + Math.trunc((cx * (UNIT / 2)) / 1024),
    y: def.y * UNIT + Math.trunc((cy * (UNIT / 2)) / 1024),
    a,
  };
}

export const laserOn = (level: Level, s: HeistState, i: number) => {
  const l = level.lasers[i]!;
  return s.hacked === 0 && (s.tick + l.phase) % (l.on + l.off) < l.on;
};

export function step(s: HeistState, level: Level, input: Input): HeistEvent[] {
  if (s.phase === 'escaped' || s.phase === 'busted') return [];
  const ev: HeistEvent[] = [];
  const p = s.player;
  s.tick++;

  usePower(s, level, input.p, ev);

  if (p.hide > 0) p.hide--;
  if (p.sprint > 0) p.sprint--;
  if (p.tackle > 0) p.tackle--;
  if (p.magnet > 0) p.magnet--;
  if (s.hacked > 0) s.hacked--;
  if (s.noise && --s.noise.t <= 0) s.noise = null;

  // The player.
  const want = input.d;
  if (!atCenter(p) && want !== -1 && p.dir !== -1 && want === (p.dir + 2) % 4) p.dir = want;
  p.crack = -1;
  travel(p, p.sprint > 0 ? SPEED.sprint : SPEED.walk, () => {
    const tx = p.x / UNIT;
    const ty = p.y / UNIT;
    if (want !== -1 && walkable(level, tx + DX[want], ty + DY[want])) p.dir = want;
    else if (!(want !== -1 && p.dir !== -1 && walkable(level, tx + DX[p.dir], ty + DY[p.dir]))) p.dir = -1;
    if (p.dir !== -1) p.face = p.dir;
  });
  if (atCenter(p) && want !== -1) {
    const sx = p.x / UNIT + DX[want];
    const sy = p.y / UNIT + DY[want];
    const si = level.safes.findIndex((v) => v.x === sx && v.y === sy);
    if (si >= 0 && !s.safes[si]!.open) {
      p.face = want;
      p.crack = si;
      const safe = s.safes[si]!;
      safe.progress += s.powers.some((x) => x.id === 'lockpick') ? 4 : 1;
      if (safe.progress >= CRACK) {
        safe.open = true;
        s.carried += level.safes[si]!.value;
        ev.push({ t: 'safe', value: level.safes[si]!.value, x: sx, y: sy });
      }
    }
  }

  // Loot.
  const ptx = tileOf(p.x);
  const pty = tileOf(p.y);
  const reach = p.magnet > 0 ? 2 : 0;
  level.loot.forEach((l, i) => {
    if (s.taken[i] || Math.abs(l.x - ptx) > reach || Math.abs(l.y - pty) > reach) return;
    s.taken[i] = true;
    s.carried += LOOT_VALUE[l.kind];
    ev.push({ t: 'loot', kind: l.kind, value: LOOT_VALUE[l.kind], x: l.x, y: l.y });
  });

  if (s.carried > 0 && ptx === level.exit[0] && pty === level.exit[1]) {
    s.phase = 'escaped';
    s.score = Math.floor((s.carried * (s.spotted ? 2 : 3)) / 2);
    ev.push({ t: 'escaped', score: s.score });
    return ev;
  }

  moveGuards(s, level, ptx, pty);

  // Running into a guard.
  for (let i = 0; i < s.guards.length; i++) {
    const g = s.guards[i]!;
    if (g.stun > 0) continue;
    const dx = g.x - p.x;
    const dy = g.y - p.y;
    if (dx * dx + dy * dy >= TOUCH * TOUCH) continue;
    if (p.tackle > 0) {
      g.stun = 8 * TPS;
      ev.push({ t: 'stun', who: 'guard', i });
      continue;
    }
    s.phase = 'busted';
    s.caughtBy = i;
    ev.push({ t: 'busted', by: i });
    return ev;
  }

  // Lights.
  const hidden = p.hide > 0;
  s.guards.forEach((g, i) => {
    if (g.stun > 0) return;
    const range = g.mode === 'chase' ? CHASE_RANGE : SEE_RANGE;
    const seen = !hidden && inLight(level, g.x, g.y, g.a, p.x, p.y, range);
    if (!seen) {
      g.sus = Math.max(0, g.sus - 1);
      return;
    }
    const dx = g.x - p.x;
    const dy = g.y - p.y;
    g.sus = Math.min(SPOT, g.sus + (dx * dx + dy * dy < 36 * 36 ? 3 : 1));
    if (g.sus < SPOT || s.phase !== 'play') return;
    if (s.freePass) {
      s.freePass = false;
      g.sus = 0;
      g.want = (g.a + 32) % 64;
      g.wait = Math.max(g.wait, TPS);
      ev.push({ t: 'pass', i });
      return;
    }
    raiseAlarm(s, 'guard', i, ev);
  });
  s.cameras.forEach((c, i) => {
    if (c.stun > 0) {
      c.stun--;
      return;
    }
    const def = level.cameras[i]!;
    const span = (def.to - def.from + 64) % 64;
    if (s.tick % 2 === 0) {
      c.r += c.sweep;
      if (c.r >= span || c.r <= 0) c.sweep = c.sweep === 1 ? -1 : 1;
    }
    if (s.hacked > 0 || s.phase !== 'play') {
      c.sus = 0;
      return;
    }
    const v = cameraView(level, s, i);
    const seen = !hidden && inLight(level, v.x, v.y, v.a, p.x, p.y, CAMERA_RANGE);
    c.sus = seen ? Math.min(SPOT, c.sus + 1) : Math.max(0, c.sus - 1);
    if (c.sus >= SPOT) raiseAlarm(s, 'camera', i, ev);
  });
  if (s.phase === 'play' && !hidden)
    level.lasers.forEach((l, i) => {
      if (l.x === ptx && l.y === pty && laserOn(level, s, i)) raiseAlarm(s, 'laser', i, ev);
    });

  if (s.phase === 'play') {
    if (--s.timeLeft <= 0) raiseAlarm(s, 'time', -1, ev);
  } else if (s.phase === 'alarm' && --s.alarmLeft <= 0) {
    s.phase = 'busted';
    ev.push({ t: 'busted', by: null });
  }
  return ev;
}

function raiseAlarm(s: HeistState, by: NonNullable<HeistState['alarmBy']>, i: number, ev: HeistEvent[]) {
  if (s.phase !== 'play') return;
  s.phase = 'alarm';
  s.alarmBy = by;
  s.alarmLeft = ALARM;
  s.spotted = true;
  s.noise = null;
  for (const g of s.guards) {
    g.mode = 'chase';
    g.wait = 0;
    g.goal = null;
  }
  ev.push({ t: 'alarm', by, i });
}

function moveGuards(s: HeistState, level: Level, ptx: number, pty: number) {
  const toPlayer = s.phase === 'alarm' ? distances(level, ptx, pty) : null;
  s.guards.forEach((g, i) => {
    if (g.stun > 0) {
      g.stun--;
      g.sus = 0;
      return;
    }
    const diff = ((g.want - g.a + 96) % 64) - 32;
    g.a = (g.a + Math.max(-4, Math.min(4, diff)) + 64) % 64;
    const route = level.guards[i]!;
    const speed = g.mode === 'chase' ? 2 + (s.tick % 2) : SPEED.guard;
    const wasMoving = g.dir !== -1;
    travel(g, speed, () => {
      const tx = g.x / UNIT;
      const ty = g.y / UNIT;
      const arrived = wasMoving;
      g.dir = -1;
      if (g.mode === 'chase' && toPlayer) {
        let best = toPlayer[ty * level.w + tx]!;
        for (let d = 0 as Dir; d < 4; d++) {
          const n = toPlayer[(ty + DY[d]) * level.w + tx + DX[d]];
          if (n !== undefined && n >= 0 && walkable(level, tx + DX[d], ty + DY[d]) && (best < 0 || n < best)) {
            best = n;
            g.dir = d as Dir;
          }
        }
      } else if (g.mode === 'look' && g.goal) {
        if (tx === g.goal[0] && ty === g.goal[1]) {
          if (arrived) {
            g.wait = 75;
            g.base = g.a;
            g.look = 0;
          }
          if (g.wait > 0) {
            g.wait--;
            lookAround(g);
          } else {
            g.mode = 'back';
            g.goal = null;
          }
        } else g.dir = towards(level, [tx, ty], g.goal);
      } else if (g.mode === 'back') {
        const home = route.path[g.step]!;
        if (tx === home[0] && ty === home[1]) g.mode = 'patrol';
        else g.dir = towards(level, [tx, ty], home);
      }
      if (g.mode === 'patrol') {
        if (arrived && route.stops.has(g.step)) {
          g.wait = route.stops.get(g.step)!;
          g.base = g.a;
          g.look = 0;
        }
        if (route.path.length === 1) {
          if (s.tick % 3 === 0) g.want = (g.a + 1) % 64;
        } else if (g.wait > 0) {
          g.wait--;
          lookAround(g);
        } else {
          const next = (g.step + 1) % route.path.length;
          g.dir = dirBetween([tx, ty], route.path[next]!);
          if (g.dir !== -1) g.step = next;
        }
      }
      if (g.dir !== -1) g.want = DIR_ANGLE[g.dir];
    });
  });
}

function lookAround(g: Guard) {
  g.look++;
  const phase = g.look % 80;
  const off = phase < 20 ? phase : phase < 60 ? 40 - phase : phase - 80;
  g.want = (g.base + Math.trunc((off * 3) / 5) + 64) % 64;
}

function towards(level: Level, from: [number, number], to: [number, number]): Dir | -1 {
  const path = bfsPath(level, from, to);
  return path && path.length > 1 ? dirBetween(from, path[1]!) : -1;
}

function usePower(s: HeistState, level: Level, slot: number, ev: HeistEvent[]) {
  const pw = s.powers[slot];
  if (!pw || pw.used || POWERS[pw.id].passive) return;
  const p = s.player;
  const tx = tileOf(p.x);
  const ty = tileOf(p.y);
  switch (pw.id) {
    case 'hide':
      p.hide = 3 * TPS;
      break;
    case 'sprint':
      p.sprint = 3 * TPS;
      break;
    case 'tackle':
      p.tackle = 5 * TPS;
      break;
    case 'magnet':
      p.magnet = 5 * TPS;
      break;
    case 'hack':
      s.hacked = 8 * TPS;
      break;
    case 'scare':
      s.guards.forEach((g, i) => {
        const dx = g.x - p.x;
        const dy = g.y - p.y;
        if (dx * dx + dy * dy <= 9 * UNIT * UNIT) {
          g.stun = Math.max(g.stun, 3 * TPS);
          ev.push({ t: 'stun', who: 'guard', i });
        }
      });
      break;
    case 'bribe':
      if (s.phase === 'alarm' && s.alarmBy !== 'time') {
        s.phase = 'play';
        s.alarmLeft = 0;
        s.alarmBy = null;
        for (const g of s.guards) {
          g.mode = 'back';
          g.sus = 0;
        }
        ev.push({ t: 'calm' });
      } else s.freePass = true;
      break;
    case 'distract': {
      let nx = tx;
      let ny = ty;
      for (let k = 0; k < 4 && walkable(level, nx + DX[p.face], ny + DY[p.face]); k++) {
        nx += DX[p.face];
        ny += DY[p.face];
      }
      s.noise = { x: nx, y: ny, t: 2 * TPS };
      ev.push({ t: 'noise', x: nx, y: ny });
      if (s.phase === 'play') {
        const near = distances(level, nx, ny);
        for (const g of s.guards) {
          const d = near[tileOf(g.y) * level.w + tileOf(g.x)]!;
          if (g.stun > 0 || d < 0 || d > 8) continue;
          g.mode = 'look';
          g.goal = [nx, ny];
          g.wait = 0;
        }
      }
      break;
    }
    case 'zap': {
      let hit: 'guard' | 'camera' | null = null;
      let ex = tx;
      let ey = ty;
      for (let k = 1; k <= 7 && !hit; k++) {
        ex = tx + DX[p.face] * k;
        ey = ty + DY[p.face] * k;
        const gi = s.guards.findIndex((g) => g.stun === 0 && tileOf(g.x) === ex && tileOf(g.y) === ey);
        if (gi >= 0) {
          s.guards[gi]!.stun = 6 * TPS;
          ev.push({ t: 'stun', who: 'guard', i: gi });
          hit = 'guard';
          break;
        }
        if (blocksLight(level, ex, ey)) {
          const ci = level.cameras.findIndex((c) => c.x === ex && c.y === ey);
          if (ci >= 0) {
            s.cameras[ci]!.stun = 6 * TPS;
            ev.push({ t: 'stun', who: 'camera', i: ci });
            hit = 'camera';
          }
          break;
        }
      }
      ev.push({ t: 'zap', x: tx, y: ty, tx: ex, ty: ey, hit });
      break;
    }
    case 'blink': {
      for (let k = 3; k >= 1; k--) {
        const bx = tx + DX[p.face] * k;
        const by = ty + DY[p.face] * k;
        if (!walkable(level, bx, by) || tileAt(level, bx, by) === Tile.Exit) continue;
        ev.push({ t: 'blink', fx: tx, fy: ty, tx: bx, ty: by });
        p.x = bx * UNIT;
        p.y = by * UNIT;
        p.dir = -1;
        break;
      }
      if (ev.at(-1)?.t !== 'blink') return;
      break;
    }
  }
  pw.used = true;
  ev.push({ t: 'power', id: pw.id });
}

/** Replays a run from its input log; the server uses this to check a score. */
export function replay(level: Level, powers: readonly PowerId[], inputs: readonly Input[]): HeistState {
  const s = startHeist(level, powers);
  for (const input of inputs) {
    step(s, level, input);
    if (s.phase === 'escaped' || s.phase === 'busted') break;
  }
  while (s.phase === 'play' || s.phase === 'alarm') step(s, level, IDLE);
  return s;
}
