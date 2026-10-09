// Plays Cash Rush many times with a simple bot, to tune it: how often a decent player gets out, and with how
// much. The bot grabs the nearest cash it can reach safely, runs from hunting guards, chases guards during a
// flip, cracks the safe when the coast is clear (it times the dial well, but not perfectly), and leaves in
// time.   npx tsx tools/sim/rush-bot.ts [runs=200] [map=rush-bank] [tier=1] [greed=1]
import {
  DIRS,
  DT,
  RUSH,
  distanceMap,
  open,
  rushMap,
  rushRules,
  startRush,
  stepRush,
  type Dir,
  type RushInput,
  type RushMap,
  type RushState,
} from '@chog-city/game/rush';

const runs = Number(process.argv[2] ?? 200);
const map = rushMap(process.argv[3] ?? 'rush-bank')!;
const tier = Number(process.argv[4] ?? 1);
const greed = Number(process.argv[5] ?? 1);
const rules = rushRules(tier);

const tile = (v: number) => Math.floor(v);

function nextStep(m: RushMap, s: RushState, tx: number, ty: number, avoid: Set<number>): Dir | -1 {
  // Walk back from the target over a distance map that treats tiles near danger as walls.
  const fx = tile(s.me.x);
  const fy = tile(s.me.y);
  const dist = new Int16Array(m.w * m.h).fill(-1);
  const q = [ty * m.w + tx];
  dist[q[0]!] = 0;
  for (let i = 0; i < q.length; i++) {
    const c = q[i]!;
    const cx = c % m.w;
    const cy = (c - cx) / m.w;
    for (const [dx, dy] of DIRS) {
      const n = (cy + dy) * m.w + cx + dx;
      if (!open(m, cx + dx, cy + dy) || dist[n] !== -1 || (avoid.has(n) && n !== fy * m.w + fx)) continue;
      dist[n] = dist[c]! + 1;
      q.push(n);
    }
  }
  let best: Dir | -1 = -1;
  let bd = dist[fy * m.w + fx]!;
  if (bd < 0) return -1;
  for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
    const [dx, dy] = DIRS[d];
    const v = dist[(fy + dy) * m.w + fx + dx];
    if (v !== undefined && v >= 0 && v < bd) {
      bd = v;
      best = d;
    }
  }
  return best;
}

function decide(m: RushMap, s: RushState): RushInput {
  const me = s.me;
  const fx = tile(me.x);
  const fy = tile(me.y);
  const safe = s.safe;
  if (safe?.dialing) {
    const off = Math.abs(((safe.needle - safe.zone + 540) % 360) - 180);
    const half = RUSH.dialZones[safe.hits]! / 2;
    // Presses a bit late now and then, like a person.
    const danger = s.guards.some((g) => g.mode === 'hunt' && Math.abs(g.x - me.x) + Math.abs(g.y - me.y) < 3);
    if (danger) return { d: 2 };
    return { d: -1, use: off < half * 0.7 && Math.random() < 0.6 };
  }
  const threats = s.guards.filter((g) => g.mode === 'hunt' || (g.mode === 'patrol' && s.flip === 0));
  const avoid = new Set<number>();
  for (const g of threats)
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++)
        if (Math.abs(dx) + Math.abs(dy) <= 2) avoid.add((tile(g.y) + dy) * m.w + tile(g.x) + dx);
  const toExit = distanceMap(m, m.exit.x, m.exit.y)[fy * m.w + fx]!;
  const leave = s.timeLeft < (toExit / RUSH.speed) * 1.6 + 5 || (s.carried > 0 && s.carried >= 3000 * greed);
  if (leave && s.carried > 0) return { d: nextStep(m, s, m.exit.x, m.exit.y, avoid) };
  // In a flip: go for the nearest panicking guard.
  if (s.flip > 1) {
    const g = s.guards.find((x) => x.mode === 'panic');
    if (g) return { d: nextStep(m, s, tile(g.x), tile(g.y), new Set()) };
  }
  // The safe, when no hunter is near it.
  if (safe && !safe.open && m.safe) {
    const near = Math.abs(me.x - (m.safe.x + 0.5)) + Math.abs(me.y - (m.safe.y + 0.5)) <= 1.1;
    const clear = !threats.some(
      (g) => Math.abs(g.x - (m.safe!.x + 0.5)) + Math.abs(g.y - (m.safe!.y + 0.5)) < 6,
    );
    if (near && clear) return { d: -1, use: true };
    if (clear && s.coins.filter(Boolean).length > m.coins.length * 0.3) {
      for (const [dx, dy] of DIRS) {
        const x = m.safe.x + dx;
        const y = m.safe.y + dy;
        if (open(m, x, y)) return { d: nextStep(m, s, x, y, avoid) };
      }
    }
  }
  // Nearest cash.
  const dist = distanceMap(m, fx, fy);
  let best: { x: number; y: number } | null = null;
  let bd = Infinity;
  const look = (c: { x: number; y: number }, w: number) => {
    const d = dist[c.y * m.w + c.x]!;
    if (d >= 0 && d / w < bd && !avoid.has(c.y * m.w + c.x)) {
      bd = d / w;
      best = c;
    }
  };
  m.coins.forEach((c, i) => !s.coins[i] && look(c, 1));
  m.stacks.forEach((c, i) => !s.stacks[i] && look(c, 3));
  m.flips.forEach((c, i) => !s.flips[i] && threats.length && look(c, 1.5));
  if (best) return { d: nextStep(m, s, (best as { x: number }).x, (best as { y: number }).y, avoid) };
  return { d: s.carried > 0 ? nextStep(m, s, m.exit.x, m.exit.y, avoid) : -1 };
}

let out = 0;
let taken = 0;
let safes = 0;
let time = 0;
const why: Record<string, number> = {};
for (let r = 0; r < runs; r++) {
  const s = startRush(map, rules, [], 1000 + r);
  let lastDir: Dir | -1 = -1;
  while (s.phase === 'play') {
    // A person reacts about every tenth of a second.
    if (s.tick % 3 === 0) lastDir = decide(map, s).d;
    const inp = s.tick % 3 === 0 ? decide(map, s) : { d: lastDir };
    stepRush(s, map, rules, inp.d === -1 && !inp.use ? { d: lastDir === -1 ? -1 : lastDir, ...inp } : inp);
  }
  time += s.tick * DT;
  if (s.safe?.open) safes++;
  if (s.phase === 'escaped') {
    out++;
    taken += s.score;
  } else
    why[s.caughtBy === null ? 'time' : 'caught'] = (why[s.caughtBy === null ? 'time' : 'caught'] ?? 0) + 1;
}
console.log(
  `${map.id} tier ${tier}: escaped ${((out / runs) * 100).toFixed(0)}% of ${runs}, average take when out $${Math.round(taken / Math.max(1, out))}, ` +
    `safe opened ${((safes / runs) * 100).toFixed(0)}%, average run ${(time / runs).toFixed(1)} s, busted by ${JSON.stringify(why)}`,
);
