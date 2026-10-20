// Crowd test for the live city: N guests walk the streets at once while it measures how steadily the server
// sends its ten-a-second updates. Run it ON the server (each bot gets its own made-up address, which the live
// server only trusts from localhost), from the release dir so `ws` is found:
//   cd /opt/chog-city/current && node tools/load/city.mjs 150 60
// Guests aren't shown to real players, and these visits aren't counted (x-smoke).
import WebSocket from 'ws';

const N = Number(process.argv[2] ?? 100);
const SECONDS = Number(process.argv[3] ?? 60);
const WEB = 'http://127.0.0.1:3000';
const LIVE = 'ws://127.0.0.1:3001';

const gaps = [];
let connected = 0;
let refused = 0;
let bytes = 0;
const clients = [];

async function bot(i) {
  const r = await fetch(`${WEB}/api/city/ticket`, { headers: { 'x-smoke': '1' } });
  const { ticket } = await r.json();
  return new Promise((resolve) => {
    const ws = new WebSocket(LIVE, {
      headers: {
        origin: process.env.ORIGIN ?? 'https://grandtheftchog.duckdns.org',
        'x-forwarded-for': `10.9.${i >> 8}.${i & 255}`,
      },
    });
    let me = null;
    let last = 0;
    const c = { ws, timer: null };
    clients.push(c);
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hi', ticket })));
    ws.on('close', () => {
      if (!me) refused++;
      resolve();
    });
    ws.on('error', () => {});
    ws.on('message', (raw) => {
      bytes += raw.length;
      const m = JSON.parse(String(raw));
      if (m.t === 'you') {
        me = { x: m.x, y: m.y };
        connected++;
        // Walk back and forth along the plaza road, a small step every 100 ms like a real player.
        let dir = i % 2 ? 1 : -1;
        c.timer = setInterval(() => {
          me.x += dir * 0.25;
          if (Math.abs(me.x - m.x) > 4) dir = -dir;
          ws.send(JSON.stringify({ t: 'mv', x: me.x, y: me.y, f: dir, m: 1 }));
        }, 100);
      }
      if (m.t === 'fix' && me) {
        me.x = m.x;
        me.y = m.y;
      }
      if (m.t === 's' && i === 0) {
        const now = performance.now();
        if (last) gaps.push(now - last);
        last = now;
      }
    });
  });
}

const t0 = performance.now();
const all = [];
for (let i = 0; i < N; i++) {
  all.push(bot(i));
  await new Promise((r) => setTimeout(r, 20));
}
setTimeout(() => {
  for (const c of clients) {
    clearInterval(c.timer);
    c.ws.close();
  }
}, SECONDS * 1000);
await Promise.all(all);
const s = [...gaps].sort((a, b) => a - b);
const q = (p) => (s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(0) : '-');
console.log(
  JSON.stringify({
    bots: N,
    connected,
    refused,
    seconds: ((performance.now() - t0) / 1000).toFixed(0),
    updateGapMs: { median: q(0.5), p95: q(0.95), worst: q(0.999) },
    kbPerBotPerSec: (bytes / 1024 / Math.max(1, connected) / SECONDS).toFixed(1),
  }),
);
