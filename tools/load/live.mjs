// Load test for the live city: N players join and walk around like people, and we measure how evenly the
// server's position updates (10 a second) reach each of them.
//
// Run it against a TEST copy of the live server, never the real one: test players are holders, so in the real
// city they would grab pumpkins, claim Most Wanted and could push a real holder off their Chog.
//
//   CITY_SECRET=<the test copy's secret> node tools/load/live.mjs ws://127.0.0.1:3011 50 90 [guestShare]
//
// Prints one line every 10 s, and a summary at the end: gaps between updates (p50/p95/max), update size,
// moves the server corrected, and connections that failed or dropped.
import { createHmac } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const WebSocket = require(process.env.WS_PATH ?? 'ws');

const [url = 'ws://127.0.0.1:3011', nArg = '20', secsArg = '60', guestArg = '0'] = process.argv.slice(2);
const N = Number(nArg);
const SECS = Number(secsArg);
const GUEST_SHARE = Number(guestArg);
const SECRET = process.env.CITY_SECRET;
if (!SECRET) throw new Error('CITY_SECRET (the test copy’s) is required');

const GANGS = ['mcga', 'lazoor', 'gangstas', 'skulls', 'radioactive'];
const WALK_SPEED = 4.2;

function ticket(t) {
  const body = Buffer.from(JSON.stringify({ ...t, exp: Date.now() + 60_000 })).toString('base64url');
  return `${body}.${createHmac('sha256', SECRET).update(body).digest('base64url')}`;
}

const gaps = [];
const sizes = [];
let fixes = 0;
let joined = 0;
let failed = 0;
let dropped = 0;
let moves = 0;
const bots = [];

function bot(i) {
  const guest = i < Math.round(N * GUEST_SHARE);
  const t = guest
    ? { chog: null, name: 'Guest', gang: null, jail: null }
    : { chog: 9000 + i, name: `Load ${i}`, gang: GANGS[i % GANGS.length], jail: null };
  // Each test player looks like its own visitor (the server allows 8 windows per address).
  const ws = new WebSocket(url, { headers: { 'x-forwarded-for': `10.77.${i >> 8}.${i & 255}` } });
  const b = { ws, x: 0, y: 0, dir: Math.random() * Math.PI * 2, last: 0, ready: false, closed: false };
  bots.push(b);
  ws.on('open', () => ws.send(JSON.stringify({ t: 'hi', ticket: ticket(t) })));
  ws.on('error', () => failed++);
  ws.on('close', () => {
    if (b.ready && !b.closed) dropped++;
    b.closed = true;
  });
  ws.on('message', (raw) => {
    const m = JSON.parse(String(raw));
    if (m.t === 'you') {
      b.x = m.x;
      b.y = m.y;
      b.ready = true;
      joined++;
    } else if (m.t === 'fix') {
      b.x = m.x;
      b.y = m.y;
      b.dir = Math.random() * Math.PI * 2;
      fixes++;
    } else if (m.t === 's') {
      const now = performance.now();
      if (b.last) gaps.push(now - b.last);
      b.last = now;
      if (sizes.length < 5000) sizes.push(raw.length);
    }
  });
  return b;
}

// Walk like a person: mostly straight, turning now and then, stopping sometimes.
function step(b) {
  if (!b.ready || b.closed || b.ws.readyState !== WebSocket.OPEN) return;
  if (Math.random() < 0.05) b.dir += (Math.random() - 0.5) * 2;
  const still = Math.random() < 0.1;
  const d = still ? 0 : WALK_SPEED * 0.1 * 0.9;
  b.x += Math.cos(b.dir) * d;
  b.y += Math.sin(b.dir) * d;
  b.ws.send(JSON.stringify({ t: 'mv', x: Math.round(b.x * 100) / 100, y: Math.round(b.y * 100) / 100, f: Math.cos(b.dir) < 0 ? -1 : 1, m: still ? 0 : 1 }));
  moves++;
}

const pct = (a, p) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const fmt = (a) =>
  `gap p50 ${pct(a, 50).toFixed(0)} ms, p95 ${pct(a, 95).toFixed(0)} ms, p99 ${pct(a, 99).toFixed(0)} ms, max ${a.reduce((m, v) => Math.max(m, v), 0).toFixed(0)} ms`;

// Join gradually over a few seconds, like people arriving from a tweet.
for (let i = 0; i < N; i++) setTimeout(() => bot(i), (i * 3000) / Math.max(1, N));
const walk = setInterval(() => bots.forEach(step), 100);

let window = [];
const report = setInterval(() => {
  window = gaps.splice(0);
  report.all = (report.all ?? []).concat(window);
  console.log(`[${new Date().toISOString().slice(11, 19)}] joined ${joined}/${N}, ${fmt(window)}, fixes ${fixes}, dropped ${dropped}, failed ${failed}`);
}, 10_000);

setTimeout(() => {
  clearInterval(walk);
  clearInterval(report);
  const all = (report.all ?? []).concat(gaps);
  console.log(
    `SUMMARY players ${N} (guests ${Math.round(N * GUEST_SHARE)}), ${SECS}s: joined ${joined}, failed ${failed}, dropped ${dropped}; ` +
      `${fmt(all)}; update size p50 ${pct(sizes, 50)} B, max ${sizes.reduce((m, v) => Math.max(m, v), 0)} B; ` +
      `moves sent ${moves}, corrected ${fixes} (${((100 * fixes) / Math.max(1, moves)).toFixed(1)}%)`,
  );
  bots.forEach((b) => b.ws.close());
  setTimeout(() => process.exit(0), 500);
}, SECS * 1000);
