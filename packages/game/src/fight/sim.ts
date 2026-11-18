import type { PowerId } from '../heist/powers.ts';
import { botInput } from './bot.ts';

// Fight Night: two Chogs in a ring, sumo style. No health bar: every hit adds to your number (0%, 40%,
// 120%...) and the higher it is, the further the next hit sends you. The ropes bounce you back when you walk
// into them; only a hard enough hit sends you through them and out, which loses the fall. Best of three falls.
//
// The same code runs in the browser and on the server, which replays the inputs to check a result. So the
// maths here is only + - * / and Math.sqrt (exact everywhere), never sin/cos/pow, and all randomness comes
// from the seed in the state.

export const FIGHT_TPS = 30;
const DT = 1 / FIGHT_TPS;

export const FIGHT = {
  /** Half the ring's width (tiles), and how far it closes in during the end of a fall. */
  ring: 4.4,
  ringEnd: 2.6,
  /** A fall lasts at most this long (s); the ropes start closing in for the last `shrink` seconds. */
  fallTime: 45,
  shrink: 15,
  falls: 2,
  /** Seconds of "3, 2, 1" before a fall, and of slow motion after someone goes out. */
  countdown: 1.5,
  outPause: 1.4,
  body: 0.42,
  speed: 3.8,
  accel: 32,
  friction: 14,
  /** While flying from a hit, you slow down this much (tiles/s each second): the higher your %, the further. */
  slide: 7.5,
  /** Hit: wind-up, active and recovery (steps), reach in front of you, and the hit circle's size. */
  hitWind: 4,
  hitActive: 3,
  hitRecover: 9,
  hitReach: 0.78,
  hitSize: 0.52,
  hitDamage: 8,
  /** Knock-back speed (tiles/s) = base + % x grow. Hit stun (steps) = base + % x grow. */
  kbBase: 2.6,
  kbGrow: 0.055,
  stunBase: 5,
  stunGrow: 0.06,
  /** Faster than this when you meet the ropes and you go through them: out. */
  ropeBreak: 5.2,
  ropeBounce: 0.6,
  dashSpeed: 9.5,
  dashTime: 6,
  dashCooldown: 1,
  /** Bumping into someone while dashing is a small hit of its own. */
  bumpDamage: 4,
  /** Steps both fighters freeze on a hit (more on a strong one): makes a hit land. */
  hitStop: 3,
  hitStopStrong: 6,
} as const;

/** What each power does in the ring: seconds before it can be used again, and how long it lasts. */
export const FIGHT_POWERS: Record<PowerId, { cooldown: number; lasts?: number; does: string }> = {
  zap: { cooldown: 6, does: 'A laser push from range.' },
  sprint: { cooldown: 8, lasts: 3, does: 'Fast feet for 3 seconds.' },
  tackle: { cooldown: 7, does: 'Charge with your shoulder.' },
  hide: { cooldown: 5, lasts: 0.8, does: 'Slip through the next hit.' },
  scare: { cooldown: 9, lasts: 1.2, does: 'Their controls flip for a second.' },
  blink: { cooldown: 5, does: 'Jump a short way.' },
  magnet: { cooldown: 7, does: 'Pull them to you.' },
  bribe: { cooldown: 9, does: 'The crowd throws a bottle at them.' },
  distract: { cooldown: 8, lasts: 1, does: "They can't hit or dash for a second." },
  hack: { cooldown: 12, does: 'Take 20% off your number.' },
  lockpick: { cooldown: 0, does: 'Shake off hits faster (always on).' },
};

/** One step of a player's controls. The stick is whole numbers (-100 to 100) so a replay is small and exact. */
export interface FightInput {
  mx: number;
  my: number;
  hit?: boolean;
  dash?: boolean;
  /** Power buttons: the Chog's first and second power. */
  p1?: boolean;
  p2?: boolean;
}

export interface FighterSetup {
  chog: number;
  name: string;
  powers: PowerId[];
  /** A computer fighter of this level (1 easiest to 6 the champion); none for a player. */
  bot?: number;
}

export interface Fighter extends FighterSetup {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Which way you face (a unit vector). */
  fx: number;
  fy: number;
  pct: number;
  /** Steps left in each state. */
  stun: number;
  dash: number;
  dashCd: number;
  /** The hit you're throwing: steps since it started, or -1. */
  swing: number;
  swingLanded: boolean;
  tackle: number;
  /** Seconds-as-steps left for each power's cooldown and effect. */
  cd: Partial<Record<PowerId, number>>;
  sprint: number;
  hide: number;
  scared: number;
  distracted: number;
  out: boolean;
  /** A computer fighter's held decision and when it next thinks. */
  plan: FightInput;
  think: number;
}

export interface Bottle {
  x: number;
  y: number;
  /** Steps until it lands; who it's aimed at. */
  t: number;
  at: 0 | 1;
}

export type FightPhase = 'count' | 'fight' | 'out' | 'over';

export type FightEvent =
  | { k: 'hit'; who: 0 | 1; pct: number; strong: boolean; x: number; y: number }
  | { k: 'whiff'; who: 0 | 1 }
  | { k: 'dash'; who: 0 | 1 }
  | { k: 'rope'; who: 0 | 1 }
  | { k: 'power'; who: 0 | 1; id: PowerId; x?: number; y?: number; tx?: number; ty?: number }
  | { k: 'out'; who: 0 | 1 }
  | { k: 'fall'; winner: 0 | 1 }
  | { k: 'go' }
  | { k: 'over'; winner: 0 | 1 };

export interface FightState {
  tick: number;
  seed: number;
  phase: FightPhase;
  /** Steps left in the current phase (count / out). */
  wait: number;
  /** When the current fall started (tick). */
  fallStart: number;
  ring: number;
  wins: [number, number];
  f: [Fighter, Fighter];
  bottles: Bottle[];
  /** Steps both fighters are frozen after a hit. */
  freeze: number;
  winner: 0 | 1 | null;
  events: FightEvent[];
}

/** A seeded random number (0-1) from the state, so a replay gets the same ones. */
export function fightRand(s: FightState): number {
  let a = (s.seed = (s.seed + 0x6d2b79f5) >>> 0);
  a = Math.imul(a ^ (a >>> 15), a | 1);
  a ^= a + Math.imul(a ^ (a >>> 7), a | 61);
  return ((a ^ (a >>> 14)) >>> 0) / 4294967296;
}

const steps = (s: number) => Math.round(s * FIGHT_TPS);

function fighter(setup: FighterSetup, side: -1 | 1): Fighter {
  return {
    ...setup,
    x: side * 1.6,
    y: 0,
    vx: 0,
    vy: 0,
    fx: -side,
    fy: 0,
    pct: 0,
    stun: 0,
    dash: 0,
    dashCd: 0,
    swing: -1,
    swingLanded: false,
    tackle: 0,
    cd: {},
    sprint: 0,
    hide: 0,
    scared: 0,
    distracted: 0,
    out: false,
    plan: { mx: 0, my: 0 },
    think: 0,
  };
}

export function startFight(a: FighterSetup, b: FighterSetup, seed: number): FightState {
  return {
    tick: 0,
    seed: seed >>> 0,
    phase: 'count',
    wait: steps(FIGHT.countdown),
    fallStart: 0,
    ring: FIGHT.ring,
    wins: [0, 0],
    f: [fighter(a, -1), fighter(b, 1)],
    bottles: [],
    freeze: 0,
    winner: null,
    events: [],
  };
}

function resetFall(s: FightState) {
  const [a, b] = s.f;
  s.f = [fighter(a, -1), fighter(b, 1)];
  s.ring = FIGHT.ring;
  s.bottles = [];
  s.phase = 'count';
  s.wait = steps(FIGHT.countdown);
}

const len = (x: number, y: number) => Math.sqrt(x * x + y * y);

/** Knock `t` away along (dx, dy) with a hit of this size. */
function knock(s: FightState, who: 0 | 1, dx: number, dy: number, damage: number, kbScale: number) {
  const t = s.f[who];
  if (t.hide > 0 || t.out) return false;
  t.pct += damage;
  const d = len(dx, dy) || 1;
  const kb = (FIGHT.kbBase + t.pct * FIGHT.kbGrow) * kbScale;
  t.vx = (dx / d) * kb;
  t.vy = (dy / d) * kb;
  const lockpick = t.powers.includes('lockpick') ? 0.7 : 1;
  t.stun = Math.round((FIGHT.stunBase + t.pct * FIGHT.stunGrow) * lockpick);
  t.swing = -1;
  t.dash = 0;
  t.tackle = 0;
  const strong = kb > FIGHT.ropeBreak;
  s.freeze = strong ? FIGHT.hitStopStrong : FIGHT.hitStop;
  s.events.push({ k: 'hit', who, pct: t.pct, strong, x: t.x, y: t.y });
  return true;
}

/** Effects on the other fighter wait in `later` until both sides have acted, so neither side goes first. */
type Later = (() => void)[];

function usePower(s: FightState, i: 0 | 1, id: PowerId, later: Later) {
  const me = s.f[i];
  const them = s.f[i === 0 ? 1 : 0];
  const other = (i === 0 ? 1 : 0) as 0 | 1;
  if ((me.cd[id] ?? 0) > 0 || id === 'lockpick') return;
  me.cd[id] = steps(FIGHT_POWERS[id].cooldown);
  const dx = them.x - me.x;
  const dy = them.y - me.y;
  const dist = len(dx, dy);
  const ev: FightEvent = { k: 'power', who: i, id, x: me.x, y: me.y };
  switch (id) {
    case 'zap': {
      // A beam along where you face: hits if they're within reach and close to the line.
      const along = dx * me.fx + dy * me.fy;
      const off = Math.abs(dx * me.fy - dy * me.fx);
      const reach = 3.6;
      Object.assign(ev, { tx: me.x + me.fx * reach, ty: me.y + me.fy * reach });
      const [zx, zy] = [me.fx, me.fy];
      if (along > 0 && along < reach && off < 0.55) later.push(() => knock(s, other, zx, zy, 6, 0.85));
      break;
    }
    case 'sprint':
      me.sprint = steps(3);
      break;
    case 'tackle':
      me.tackle = 9;
      me.swing = -1;
      break;
    case 'hide':
      me.hide = steps(0.8);
      break;
    case 'scare':
      if (dist < 3.2) later.push(() => (them.scared = steps(1.2)));
      break;
    case 'blink': {
      const lim = s.ring - 0.5;
      me.x = Math.max(-lim, Math.min(lim, me.x + me.fx * 2.4));
      me.y = Math.max(-lim, Math.min(lim, me.y + me.fy * 2.4));
      Object.assign(ev, { tx: me.x, ty: me.y });
      break;
    }
    case 'magnet':
      if (dist < 4.5 && dist > 0.01)
        later.push(() => {
          them.vx -= (dx / dist) * 6;
          them.vy -= (dy / dist) * 6;
          them.stun = Math.max(them.stun, 4);
        });
      break;
    case 'bribe':
      s.bottles.push({ x: them.x, y: them.y, t: steps(0.7), at: other });
      Object.assign(ev, { tx: them.x, ty: them.y });
      break;
    case 'distract':
      if (dist < 4) later.push(() => (them.distracted = steps(1)));
      break;
    case 'hack':
      me.pct = Math.max(0, me.pct - 20);
      break;
  }
  s.events.push(ev);
}

function control(s: FightState, i: 0 | 1, input: FightInput, later: Later) {
  const me = s.f[i];
  if (me.out) return;
  let mx = Math.max(-100, Math.min(100, Math.round(input.mx))) / 100;
  let my = Math.max(-100, Math.min(100, Math.round(input.my))) / 100;
  if (me.scared > 0) {
    mx = -mx;
    my = -my;
  }
  const m = len(mx, my);
  if (m > 1) {
    mx /= m;
    my /= m;
  }
  const busy = me.stun > 0 || me.tackle > 0 || me.dash > 0;
  if (!busy && me.swing < 0 && m > 0.2) {
    const n = len(mx, my);
    me.fx = mx / n;
    me.fy = my / n;
  }
  if (me.stun > 0) return;
  const canAct = me.distracted <= 0;
  if (canAct && input.hit && me.swing < 0 && me.dash <= 0 && me.tackle <= 0) {
    me.swing = 0;
    me.swingLanded = false;
  }
  if (canAct && input.dash && me.dashCd <= 0 && me.swing < 0 && me.tackle <= 0) {
    me.dash = FIGHT.dashTime;
    me.dashCd = steps(FIGHT.dashCooldown);
    s.events.push({ k: 'dash', who: i });
  }
  const active = me.powers.filter((p) => p !== 'lockpick');
  if (input.p1 && active[0]) usePower(s, i, active[0], later);
  if (input.p2 && active[1]) usePower(s, i, active[1], later);
  // Walking: speed toward the stick, slower while throwing a hit.
  if (me.dash <= 0 && me.tackle <= 0) {
    const top = FIGHT.speed * (me.sprint > 0 ? 1.45 : 1) * (me.swing >= 0 ? 0.35 : 1);
    const tx = mx * top;
    const ty = my * top;
    const ax = tx - me.vx;
    const ay = ty - me.vy;
    const a = len(ax, ay);
    const maxA = (m > 0.2 ? FIGHT.accel : FIGHT.friction) * DT;
    if (a <= maxA) {
      me.vx = tx;
      me.vy = ty;
    } else {
      me.vx += (ax / a) * maxA;
      me.vy += (ay / a) * maxA;
    }
  }
}

function tickDown(f: Fighter) {
  for (const k of Object.keys(f.cd) as PowerId[]) if (f.cd[k]! > 0) f.cd[k]!--;
  if (f.stun > 0) f.stun--;
  if (f.dashCd > 0) f.dashCd--;
  if (f.sprint > 0) f.sprint--;
  if (f.hide > 0) f.hide--;
  if (f.scared > 0) f.scared--;
  if (f.distracted > 0) f.distracted--;
}

function move(s: FightState, i: 0 | 1) {
  const me = s.f[i];
  if (me.out) return;
  if (me.dash > 0) {
    me.vx = me.fx * FIGHT.dashSpeed;
    me.vy = me.fy * FIGHT.dashSpeed;
    me.dash--;
  } else if (me.tackle > 0) {
    me.vx = me.fx * 12;
    me.vy = me.fy * 12;
    me.tackle--;
  } else if (me.stun > 0) {
    // Flying from a hit: slows down steadily, so a big number means a long flight.
    const v = len(me.vx, me.vy);
    const nv = Math.max(0, v - FIGHT.slide * DT);
    if (v > 0) {
      me.vx *= nv / v;
      me.vy *= nv / v;
    }
  }
  me.x += me.vx * DT;
  me.y += me.vy * DT;
  // The ropes: walking into them bounces you back; a hard enough hit takes you through and out.
  const R = s.ring;
  for (const axis of ['x', 'y'] as const) {
    const v = axis === 'x' ? 'vx' : 'vy';
    if (Math.abs(me[axis]) <= R) continue;
    const flying = me.stun > 0 && len(me.vx, me.vy) > FIGHT.ropeBreak;
    if (flying) {
      me.out = true;
      s.events.push({ k: 'out', who: i });
      return;
    }
    me[axis] = Math.sign(me[axis]) * R;
    me[v] = -me[v] * FIGHT.ropeBounce;
    if (Math.abs(me[v]) > 1) s.events.push({ k: 'rope', who: i });
  }
}

function swings(s: FightState, i: 0 | 1, later: Later) {
  const me = s.f[i];
  const other = (i === 0 ? 1 : 0) as 0 | 1;
  const them = s.f[other];
  if (me.swing >= 0) {
    me.swing++;
    const live = me.swing > FIGHT.hitWind && me.swing <= FIGHT.hitWind + FIGHT.hitActive;
    if (live && !me.swingLanded) {
      const hx = me.x + me.fx * FIGHT.hitReach;
      const hy = me.y + me.fy * FIGHT.hitReach;
      if (len(them.x - hx, them.y - hy) < FIGHT.hitSize + FIGHT.body) {
        const dmg = FIGHT.hitDamage + Math.floor(fightRand(s) * 3);
        const [hx2, hy2] = [me.fx, me.fy];
        me.swingLanded = true;
        later.push(() => {
          if (!knock(s, other, hx2, hy2, dmg, 1)) me.swingLanded = false;
        });
      }
    }
    if (me.swing === FIGHT.hitWind + FIGHT.hitActive + 1 && !me.swingLanded) s.events.push({ k: 'whiff', who: i });
    if (me.swing > FIGHT.hitWind + FIGHT.hitActive + FIGHT.hitRecover) me.swing = -1;
  }
  // Charging or dashing into them.
  if ((me.tackle > 0 || me.dash > 0) && len(them.x - me.x, them.y - me.y) < FIGHT.body * 2 + 0.1) {
    const [tx, ty] = [me.fx, me.fy];
    const big = me.tackle > 0;
    later.push(() => {
      knock(s, other, tx, ty, big ? 12 : FIGHT.bumpDamage, big ? 1.25 : 0.7);
      if (big) me.tackle = 0;
      else me.dash = 0;
      me.vx *= 0.2;
      me.vy *= 0.2;
    });
  }
}

/** Two bodies can't overlap: push them apart. */
function separate(s: FightState) {
  const [a, b] = s.f;
  if (a.out || b.out) return;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = len(dx, dy);
  const min = FIGHT.body * 2;
  if (d >= min) return;
  const nx = d > 1e-6 ? dx / d : 1;
  const ny = d > 1e-6 ? dy / d : 0;
  const push = (min - d) / 2;
  a.x -= nx * push;
  a.y -= ny * push;
  b.x += nx * push;
  b.y += ny * push;
}

function bottles(s: FightState) {
  for (const bt of s.bottles) bt.t--;
  for (const bt of s.bottles.filter((b) => b.t <= 0)) {
    const t = s.f[bt.at];
    const dx = t.x - bt.x;
    const dy = t.y - bt.y;
    if (len(dx, dy) < 0.75) knock(s, bt.at, dx || t.fx, dy || t.fy, 10, 1);
  }
  s.bottles = s.bottles.filter((b) => b.t > 0);
}

/** One step of the fight. `inputs` are the two sides' controls; a computer fighter's are worked out here. */
export function stepFight(s: FightState, inputs: [FightInput, FightInput]) {
  s.events = [];
  s.tick++;
  if (s.phase === 'over') return;
  if (s.phase === 'count') {
    if (--s.wait <= 0) {
      s.phase = 'fight';
      s.fallStart = s.tick;
      s.events.push({ k: 'go' });
    }
    return;
  }
  if (s.phase === 'out') {
    // Slow motion while the loser flies off; then the next fall, or the end.
    for (const f of s.f) {
      f.x += f.vx * DT * 0.35;
      f.y += f.vy * DT * 0.35;
    }
    if (--s.wait <= 0) {
      if (s.winner !== null) {
        s.phase = 'over';
        s.events.push({ k: 'over', winner: s.winner });
      } else resetFall(s);
    }
    return;
  }
  if (s.freeze > 0) {
    s.freeze--;
    return;
  }
  // The ropes close in for the end of a fall.
  const t = (s.tick - s.fallStart) / FIGHT_TPS;
  const closing = Math.max(0, t - (FIGHT.fallTime - FIGHT.shrink)) / FIGHT.shrink;
  s.ring = FIGHT.ring - (FIGHT.ring - FIGHT.ringEnd) * Math.min(1, closing);
  // Both sides decide on the same moment, then act, then what they did to each other lands together.
  const ins = ([0, 1] as const).map((i) => (s.f[i].bot ? botInput(s, i) : inputs[i])) as [FightInput, FightInput];
  const later: Later = [];
  for (const i of [0, 1] as const) {
    tickDown(s.f[i]);
    control(s, i, ins[i], later);
  }
  for (const fx of later.splice(0)) fx();
  for (const i of [0, 1] as const) move(s, i);
  separate(s);
  for (const i of [0, 1] as const) swings(s, i, later);
  for (const fx of later.splice(0)) fx();
  bottles(s);
  const outIdx = s.f.findIndex((f) => f.out);
  // Time's up on a fall with nobody out: the one hurt less takes it.
  const timeUp = t >= FIGHT.fallTime && outIdx < 0;
  if (outIdx >= 0 || timeUp) {
    const loser = (outIdx >= 0 ? outIdx : s.f[0].pct > s.f[1].pct ? 0 : 1) as 0 | 1;
    const winner = (1 - loser) as 0 | 1;
    s.wins[winner]++;
    s.events.push({ k: 'fall', winner });
    if (s.wins[winner] >= FIGHT.falls) s.winner = winner;
    s.phase = 'out';
    s.wait = steps(FIGHT.outPause);
  }
}

/** Every power a Chog brings into the ring, in button order (passive ones last, with no button). */
export function fightButtons(powers: PowerId[]): PowerId[] {
  return powers.filter((p) => p !== 'lockpick').slice(0, 2);
}
