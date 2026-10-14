// Balance check for the getaway: a robber who just runs the shortest way home, from every gang's door to
// every other's. How often do the police get them, and how long does it take?
//   WEB_INTERNAL_URL=http://127.0.0.1:9 npx tsx tools/sim/getaway-bot.mts
import { GANG_IDS } from '@chog-city/data';
import { WALK_SPEED, placeOf, route, slide } from '@chog-city/game/city';
import { makeGetawayPass } from '@chog-city/server/ticket';
import { startChase, stepChases, type Runner } from '../../apps/live/src/getaway.ts';

const DT = 0.1;
let home = 0;
let caught = 0;
let timeUp = 0;
const times: number[] = [];
const rows: { tiles: number; outcome: string; secs: number }[] = [];
let t = Date.now();
const events: { t: string; outcome?: string; who?: string }[] = [];
const broadcast = (m: unknown) => events.push(m as never);
for (const from of GANG_IDS)
  for (const to of GANG_IDS) {
    if (from === to) continue;
    for (const tier of [0, 2]) {
      const me: Runner = { id: 1, chog: 7, gang: to, x: 0, y: 0, jail: null };
      const pass = makeGetawayPass(
        { run: `r-${from}-${to}-${tier}`, chog: 7, name: 'x', from, home: to, bag: 500, tier },
        t,
      );
      const at = startChase(me, pass, t, broadcast)!;
      me.x = at.x;
      me.y = at.y;
      const door = placeOf(to)!.door;
      let path = route(me.x, me.y, door.x, door.y) ?? [];
      const tiles = path.length;
      path.push({ ...door });
      const start = t;
      events.length = 0;
      for (let k = 0; k < 2000; k++) {
        let left = WALK_SPEED * DT;
        while (left > 0 && path.length) {
          const p = path[0]!;
          const dx = p.x - me.x;
          const dy = p.y - me.y;
          const d = Math.hypot(dx, dy);
          if (d <= left) {
            ({ x: me.x, y: me.y } = slide(me.x, me.y, dx, dy));
            path.shift();
            left -= d;
          } else {
            ({ x: me.x, y: me.y } = slide(me.x, me.y, (dx / d) * left, (dy / d) * left));
            left = 0;
          }
        }
        t += DT * 1000;
        stepChases(DT, t, new Map([[1, me]]), broadcast);
        const end = events.find((e) => e.t === 'chase-end');
        if (end) {
          if (end.outcome === 'home') home++;
          else if (end.who === 'time') timeUp++;
          else caught++;
          times.push((t - start) / 1000);
          rows.push({ tiles, outcome: end.outcome!, secs: (t - start) / 1000 });
          break;
        }
        if (!path.length) path = [{ ...door }];
      }
      t += 60_000;
    }
  }
const n = home + caught + timeUp;
times.sort((a, b) => a - b);
console.log(
  `runs ${n}: home ${((home / n) * 100).toFixed(0)}%, caught by police ${((caught / n) * 100).toFixed(0)}%, out of time ${timeUp}`,
);
console.log(
  `run length median ${times[times.length >> 1]!.toFixed(1)} s, longest ${times[times.length - 1]!.toFixed(1)} s`,
);
for (const [lo, hi] of [
  [0, 20],
  [20, 35],
  [35, 50],
  [50, 200],
] as const) {
  const r = rows.filter((x) => x.tiles >= lo && x.tiles < hi);
  if (!r.length) continue;
  const h = r.filter((x) => x.outcome === 'home');
  const c = r
    .filter((x) => x.outcome !== 'home')
    .map((x) => x.secs)
    .sort((a, b) => a - b);
  console.log(
    `walk ${lo}-${hi} tiles: ${r.length} runs, home ${((h.length / r.length) * 100).toFixed(0)}%, caught after median ${c.length ? c[c.length >> 1]!.toFixed(1) : '-'} s`,
  );
}
process.exit(0);
