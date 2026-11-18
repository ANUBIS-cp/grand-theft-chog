import type { FightInput, FightState } from './sim.ts';
import { FIGHT, fightButtons, fightRand } from './sim.ts';

// The computer fighters, level 1 (a pushover) to 6 (the champion). A higher level thinks more often, swings
// more, uses its powers at the right moment and lines you up so its hits push you toward the ropes. Lower
// levels wander and miss on purpose, so the first fights of the night feel winnable. Everything here uses the
// fight's own seeded randomness, so the server can replay a fight against them exactly.

const LEVEL = [
  // think (steps between decisions), swing (chance to hit when close), smart (lines you up, dodges), slip (chance to just wander)
  { think: 13, swing: 0.3, smart: 0, slip: 0.25 },
  { think: 10, swing: 0.45, smart: 0.15, slip: 0.15 },
  { think: 8, swing: 0.55, smart: 0.35, slip: 0.1 },
  { think: 6, swing: 0.65, smart: 0.55, slip: 0.06 },
  { think: 5, swing: 0.75, smart: 0.75, slip: 0.03 },
  { think: 3, swing: 0.85, smart: 0.92, slip: 0.01 },
] as const;

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
  const L = LEVEL[Math.max(1, Math.min(6, me.bot ?? 1)) - 1]!;
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

  if (r() < L.slip) {
    // A lapse: wander a little.
    Object.assign(out, toward(r() - 0.5, r() - 0.5, 0.6));
  } else if (me.pct > 60 && myEdge < 1.1) {
    // Hurt and near the ropes: get back to the middle.
    Object.assign(out, toward(-me.x, -me.y));
    if (r() < L.smart) out.dash = true;
  } else {
    // Get on the far side of them from their nearest ropes, so a hit sends them out.
    const tc = len(them.x, them.y);
    const lineUp = r() < L.smart && tc > 0.6;
    const gx = lineUp ? them.x - (them.x / tc) * 0.85 : them.x;
    const gy = lineUp ? them.y - (them.y / tc) * 0.85 : them.y;
    Object.assign(out, toward(gx - me.x, gy - me.y));
    if (dist < 1.25) {
      // Close: face them and swing.
      Object.assign(out, toward(dx, dy, 0.4));
      if (r() < L.swing) out.hit = true;
    } else if (dist < 3 && them.pct > 70 && r() < L.smart * 0.35) out.dash = true;
  }

  // Powers, when they fit the moment.
  const [p1, p2] = fightButtons(me.powers);
  for (const [k, p] of [
    ['p1', p1],
    ['p2', p2],
  ] as const) {
    if (!p || (me.cd[p] ?? 0) > 0 || r() > 0.25 + L.smart * 0.6) continue;
    const facing = dist > 0 && (dx * me.fx + dy * me.fy) / dist > 0.9;
    const fits =
      (p === 'zap' && facing && dist < 3.4) ||
      (p === 'tackle' && facing && dist < 3 && them.pct > 40) ||
      (p === 'hide' && them.swing >= 0 && them.swing <= FIGHT.hitWind && dist < 1.6) ||
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
