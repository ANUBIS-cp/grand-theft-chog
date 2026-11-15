// Load test for the website: N visitors open /play within a couple of seconds (like a tweet going out), each
// fetching the page, every file it references and the city data, the way a browser would on a first visit.
// Read-only: it never asks for a ticket, so it adds no visits to the usage numbers.
//
//   node tools/load/web.mjs https://grandtheftchog.duckdns.org 30
const [base = 'https://grandtheftchog.duckdns.org', nArg = '30'] = process.argv.slice(2);
const N = Number(nArg);

const html = await (await fetch(`${base}/play`)).text();
const assets = [...new Set([...html.matchAll(/(?:src|href)="(\/[^"]+\.(?:js|css|woff2?|png|webp|jpg|svg)[^"]*)"/g)].map((m) => m[1]))];
const urls = ['/play', ...assets, '/api/city', '/api/gangs/mcga'];

const pct = (a, p) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor((p / 100) * a.length))] ?? 0;
const pages = [];
const api = [];
let errors = 0;
const why = {};
const slow = {};
let bytes = 0;

async function visitor() {
  const t0 = performance.now();
  // A browser fetches about six files at a time from one site.
  const queue = [...urls];
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      for (let u = queue.shift(); u; u = queue.shift()) {
        const s = performance.now();
        try {
          const r = await fetch(base + u, { headers: { 'accept-encoding': 'gzip, br' } });
          const b = await r.arrayBuffer();
          bytes += b.byteLength;
          if (!r.ok) {
            errors++;
            why[`${r.status} ${u.split('?')[0].slice(0, 40)}`] = (why[`${r.status} ${u.split('?')[0].slice(0, 40)}`] ?? 0) + 1;
          }
        } catch (e) {
          errors++;
          why[`${e.cause?.code ?? e.name} ${u.split('?')[0].slice(0, 40)}`] = (why[`${e.cause?.code ?? e.name} ${u.split('?')[0].slice(0, 40)}`] ?? 0) + 1;
        }
        const k = u.startsWith('/_next/') ? 'next static' : u.startsWith('/api/') ? 'api' : u === '/play' ? 'page' : 'other files';
        (slow[k] ??= []).push(performance.now() - s);
        if (u.startsWith('/api/')) api.push(performance.now() - s);
      }
    }),
  );
  pages.push(performance.now() - t0);
}

const t = performance.now();
await Promise.all(Array.from({ length: N }, (_, i) => new Promise((r) => setTimeout(r, (i * 2000) / N)).then(visitor)));
console.log(
  `${N} visitors in ${((performance.now() - t) / 1000).toFixed(1)}s: full first load p50 ${(pct(pages, 50) / 1000).toFixed(2)}s, ` +
    `p95 ${(pct(pages, 95) / 1000).toFixed(2)}s, max ${(Math.max(...pages) / 1000).toFixed(2)}s; ` +
    `API p50 ${pct(api, 50).toFixed(0)} ms, p95 ${pct(api, 95).toFixed(0)} ms; ` +
    `${urls.length} requests each, ${(bytes / N / 1024).toFixed(0)} KB each, errors ${errors}`,
);
if (errors) console.log('errors:', JSON.stringify(why));
console.log('time per request by kind (p50/p95 ms):', Object.entries(slow).map(([k, a]) => `${k} ${pct(a, 50).toFixed(0)}/${pct(a, 95).toFixed(0)}`).join(', '));
