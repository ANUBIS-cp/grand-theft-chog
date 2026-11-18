import type { FightInput, FightState } from './sim.ts';
import { FIGHT, HIT_RANGE, fightButtons, fightRand } from './sim.ts';

// The computer fighters, level 1 (a pushover) to 6 (the champion). A higher level thinks more often, swings
// more, uses its powers at the right moment and lines you up so its hits push you toward the ropes. Lower
// levels wander and miss on purpose, so the first fights of the night feel winnable. Everything here uses the
// fight's own seeded randomness, so the server can replay a fight against them exactly.

/** How each level fights. Exported for the balance checks. */
export const BOT_LEVELS = [
  // think: steps between decisions. swing: chance to throw a punch when in reach. poke: how far it swings
  // from (punches reach about 2). react: chance to dodge your punch or punish your miss. lineUp: chance to get
  // round you so its hit sends you toward the ropes. slip: chance to just wander for a moment.
  { think: 8, swing: 0.4, poke: 1.35, react: 0.1, lineUp: 0.05, slip: 0.16 },
  { think: 6, swing: 0.5, poke: 1.5, react: 0.22, lineUp: 0.15, slip: 0.12 },
  { think: 5, swing: 0.58, poke: 1.6, react: 0.32, lineUp: 0.3, slip: 0.08 },
  { think: 5, swing: 0.66, poke: 1.7, react: 0.45, lineUp: 0.45, slip: 0.05 },
  { think: 4, swing: 0.7, poke: 1.74, react: 0.5, lineUp: 0.55, slip: 0.04 },
  { think: 4, swing: 0.76, poke: 1.78, react: 0.6, lineUp: 0.75, slip: 0.02 },
];

const len = (x: number, y: number) => Math.sqrt(x * x + y * y);

/** A stick push toward (x, y), as the whole numbers a player's stick sends. */
function toward(x: number, y: number, scale = 1): { mx: number; my: number } {
  const d = len(x, y);
  if (d < 1e-6) return { mx: 0, my: 0 };
  return { mx: Math.round((x / d) * 100 * scale), my: Math.round((y / d) * 100 * scale) };
}

export function botInput(s: FightState, i: 0 | 1): FightInput {
  const me = s.f[i];
  const them = s.f[i === 0 ? 1 : 0];
  const L = BOT_LEVELS[Math.max(1, Math.min(6, me.bot ?? 1)) - 1]!;
  // Between decisions, keep walking the way it chose; buttons are pressed only when it decides.
  if (me.think > 0) {
    me.think--;
    return { mx: me.plan.mx, my: me.plan.my };
  }
  me.think = L.think + Math.floor(fightRand(s) * 3);
  const r = () => fightRand(s);
  const dx = them.x - me.x;
  const dy = them.y - me.y;
  const dist = len(dx, dy);
  const R = s.ring;
  const myEdge = R - Math.max(Math.abs(me.x), Math.abs(me.y));
  const out: FightInput = { mx: 0, my: 0 };

  // Reading the other side: a punch winding up is a step back out of reach; a punch that missed is the moment
  // to hit back, while they're stuck finishing it. This is what beats button-mashing.
  const winding = them.swing >= 0 && them.swing <= FIGHT.hitWind + 1;
  const stuck = them.swing > FIGHT.hitWind + FIGHT.hitActive && !them.swingLanded;
  if (winding && dist < HIT_RANGE + 0.2 && r() < L.react) {
    // Dodge it: dash away (the start of a dash can't be hit), or step back if the dash isn't ready.
    Object.assign(out, toward(-dx, -dy));
    if (me.dashCd <= 0) out.dash = true;
    me.plan = { mx: out.mx, my: out.my };
    me.think = 2;
    return out;
  }
  if (stuck && dist < HIT_RANGE + 0.7 && r() < L.react) {
    Object.assign(out, toward(dx, dy));
    if (dist < HIT_RANGE - 0.15) out.hit = true;
    else out.dash = true;
    me.plan = { mx: out.mx, my: out.my };
    return out;
  }

  if (r() < L.slip) {
    // A lapse: wander a little.
    Object.assign(out, toward(r() - 0.5, r() - 0.5, 0.6));
  } else if (me.pct > 60 && myEdge < 1.1) {
    // Hurt and near the ropes: get back to the middle.
    Object.assign(out, toward(-me.x, -me.y));
    if (r() < L.react) out.dash = true;
  } else {
    // Get on the far side of them from their nearest ropes, so a hit sends them out.
    const tc = len(them.x, them.y);
    const lineUp = r() < L.lineUp && tc > 0.6;
    const gx = lineUp ? them.x - (them.x / tc) * 0.85 : them.x;
    const gy = lineUp ? them.y - (them.y / tc) * 0.85 : them.y;
    Object.assign(out, toward(gx - me.x, gy - me.y));
    if (dist < L.poke) {
      // In reach: face them and swing (the better ones swing from further out, near the edge of their reach).
      Object.assign(out, toward(dx, dy, 0.4));
      if (r() < L.swing) out.hit = true;
    } else if (dist < 3 && them.pct > 70 && r() < L.lineUp * 0.35) out.dash = true;
  }

  // Powers, when they fit the moment.
  const [p1, p2] = fightButtons(me.powers);
  for (const [k, p] of [
    ['p1', p1],
    ['p2', p2],
  ] as const) {
    if (!p || (me.cd[p] ?? 0) > 0 || r() > 0.25 + L.react * 0.6) continue;
    const facing = dist > 0 && (dx * me.fx + dy * me.fy) / dist > 0.9;
    const fits =
      (p === 'zap' && facing && dist < 3.4) ||
      (p === 'tackle' && facing && dist < 3 && them.pct > 40) ||
      (p === 'hide' && them.swing >= 0 && them.swing <= FIGHT.hitWind && dist < 1.85) ||
      ((p === 'scare' || p === 'distract') && dist < 2.8) ||
      (p === 'magnet' && dist > 2.4 && myEdge > 1.5) ||
      (p === 'bribe' && dist > 1.8) ||
      (p === 'blink' && me.pct > 70 && myEdge < 1.2) ||
      (p === 'hack' && me.pct > 60) ||
      (p === 'sprint' && dist > 3);
    if (fits) out[k] = true;
  }
  me.plan = { mx: out.mx, my: out.my };
  return out;
}
