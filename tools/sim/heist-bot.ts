// A search bot for vault design: finds sneaky routes (never seen) through a vault and reports the best score.
//   npx tsx tools/sim/heist-bot.ts [beam=150] [powers=]
// It plays without powers unless given some (comma list). It only moves tile to tile, so a human can do
// better; if the bot can't get out clean with decent loot, the vault is too hard.
import { DX, DY, IDLE, LOOT_VALUE, UNIT, buildLevel, distances, startHeist, step, walkable, FIRST_VAULT, type Dir, type HeistState, type Input, type PowerId } from '@chog-city/game/heist';

const beam = Number(process.argv[2] ?? 150);
const powers = (process.argv[3] ?? '').split(',').filter(Boolean) as PowerId[];
const level = buildLevel(FIRST_VAULT);
const toExit = distances(level, level.exit[0], level.exit[1]);
const total = level.loot.reduce((a, l) => a + LOOT_VALUE[l.kind], 0) + level.safes.reduce((a, s) => a + s.value, 0);

interface Node {
  s: HeistState;
  inputs: Input[];
}

const clone = (s: HeistState): HeistState => structuredClone(s);
const tileOf = (u: number) => Math.floor((u + UNIT / 2) / UNIT);

function run(n: Node, input: Input, ticks: number, until?: (s: HeistState) => boolean): Node | null {
  const s = clone(n.s);
  const inputs = n.inputs.slice();
  for (let i = 0; i < ticks; i++) {
    step(s, level, input);
    inputs.push(input);
    if (s.phase !== 'play') break;
    if (until?.(s)) break;
  }
  if (s.phase === 'alarm' || s.phase === 'busted') return null;
  return { s, inputs };
}

function children(n: Node): Node[] {
  const out: Node[] = [];
  const p = n.s.player;
  const tx = p.x / UNIT;
  const ty = p.y / UNIT;
  const startTile = `${tx},${ty}`;
  for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
    const nx = tx + DX[d];
    const ny = ty + DY[d];
    const safe = level.safes.findIndex((v) => v.x === nx && v.y === ny);
    if (safe >= 0 && !n.s.safes[safe]!.open) {
      const c = run(n, { d, p: -1 }, 60, (s) => s.safes[safe]!.open);
      if (c) out.push(c);
      continue;
    }
    if (!walkable(level, nx, ny)) continue;
    const c = run(n, { d, p: -1 }, 16, (s) => s.player.x % UNIT === 0 && s.player.y % UNIT === 0 && `${s.player.x / UNIT},${s.player.y / UNIT}` !== startTile);
    if (c) out.push(c);
  }
  const w = run(n, IDLE, 6);
  if (w) out.push(w);
  return out;
}

function value(n: Node) {
  const s = n.s;
  if (s.phase === 'escaped') return 1e6 + s.score;
  const d = toExit[tileOf(s.player.y) * level.w + tileOf(s.player.x)]!;
  const late = Math.max(0, d * 8 + 45 - s.timeLeft);
  return s.carried - late * 20 + s.safes.reduce((a, x) => a + x.progress, 0);
}

let frontier: Node[] = [{ s: startHeist(level, powers), inputs: [] }];
let best: Node | null = null;
const started = Date.now();
for (let round = 0; frontier.length && round < 400; round++) {
  const next: Node[] = [];
  for (const n of frontier)
    for (const c of children(n)) {
      if (c.s.phase === 'escaped') {
        if (!best || c.s.score > best.s.score) best = c;
        continue;
      }
      if (c.s.phase === 'play' && c.s.timeLeft > 0) next.push(c);
    }
  const seen = new Set<string>();
  frontier = next
    .sort((a, b) => value(b) - value(a))
    .filter((n) => {
      const k = `${n.s.player.x},${n.s.player.y},${n.s.carried},${Math.floor(n.s.tick / 12)}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, beam);
}
console.log(`vault ${level.id}: ${total} on the floor, beam ${beam}, powers [${powers.join(',')}], ${((Date.now() - started) / 1000).toFixed(1)} s`);
if (!best) console.log('no clean escape found');
else {
  const s = best.s;
  const loot = level.loot.filter((_, i) => s.taken[i]);
  console.log(
    `best clean escape: score ${s.score} (carried ${s.carried}), ${(s.tick / 30).toFixed(1)} s, safe ${s.safes.map((x) => (x.open ? 'open' : 'shut')).join(',')}, ` +
      `coins ${loot.filter((l) => l.kind === 'coin').length}, cash ${loot.filter((l) => l.kind === 'cash').length}, bags ${loot.filter((l) => l.kind === 'bag').length}`,
  );
}
