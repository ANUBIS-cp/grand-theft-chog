// End-to-end smoke test against a running server with a throwaway wallet (made in memory, never saved).
// Usage: npx tsx tools/smoke/run.ts https://chogcity.35-212-31-75.sslip.io
import { createSiweMessage } from 'viem/siwe';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import WebSocket from 'ws';

const base = process.argv[2] ?? 'http://localhost:3000';
const host = new URL(base).host;
const account = privateKeyToAccount(generatePrivateKey());
let cookie = '';
const call = async (path: string, init: RequestInit = {}) => {
  const res = await fetch(base + path, {
    ...init,
    headers: { 'content-type': 'application/json', cookie, ...(init.headers ?? {}) },
  });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0]!;
  return { status: res.status, body: await res.json().catch(() => null) };
};
const check = (name: string, ok: boolean, detail = '') =>
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);

const health = await call('/api/health');
check('health', health.status === 200);
const board = await call('/api/war');
check(
  'gang vaults',
  board.status === 200 && board.body.board.length === 16,
  `${board.body?.board?.length} vaults`,
);
const before = await call('/api/war/me');
check('me before login', before.body?.address === null);
const { body: n } = await call('/api/auth/nonce');
const message = createSiweMessage({
  address: account.address,
  chainId: 143,
  domain: host,
  nonce: n.nonce,
  uri: base,
  version: '1',
  statement: 'Log in to Chog World.',
});
const signature = await account.signMessage({ message });
const login = await call('/api/auth/verify', {
  method: 'POST',
  body: JSON.stringify({ message, signature }),
});
check('login', login.status === 200 && login.body.address === account.address.toLowerCase());
const replay = await call('/api/auth/verify', {
  method: 'POST',
  body: JSON.stringify({ message, signature }),
});
check('nonce cannot be reused', replay.status === 400 && replay.body.error === 'NONCE_EXPIRED');
const me = await call('/api/war/me');
check('me after login', me.body?.address === account.address.toLowerCase() && me.body.chogs.length === 0);
const start = await call('/api/heist/start', {
  method: 'POST',
  body: JSON.stringify({ chogId: 1, target: 'mcga' }),
});
check('cannot rob with a Chog you do not own', start.status === 409 && start.body.error === 'not-yours');
const bad = await call('/api/heist/start', {
  method: 'POST',
  body: JSON.stringify({ chogId: 99999, target: 'nope' }),
});
check('rejects bad input', bad.status === 400);
const finish = await call('/api/heist/finish', {
  method: 'POST',
  body: JSON.stringify({ runId: 'not-a-real-run', inputs: '' }),
});
check('cannot finish a run that is not yours', finish.status === 409 && finish.body.error === 'no-run');
for (const page of ['/', '/heist', '/chog/683', '/gangs/mcga', '/chog/683/opengraph-image']) {
  const r = await fetch(base + page);
  check(`page ${page}`, r.status === 200);
}
const ctl = new AbortController();
const live = await fetch(base + '/api/live', { signal: ctl.signal });
check(
  'live feed opens',
  live.status === 200 && (live.headers.get('content-type') ?? '').includes('text/event-stream'),
);
ctl.abort();
const city = await call('/api/city');
check(
  'city: strollers and practice Chog',
  city.status === 200 && city.body.strollers.length > 20 && !!city.body.practice,
);
check(
  'gang card info',
  (await call('/api/gangs/mcga')).status === 200 && (await call('/api/gangs/nope')).status === 404,
);
const guest = await call('/api/city/ticket');
check('guest ticket', guest.status === 200 && typeof guest.body.ticket === 'string');
check('no ticket for a Chog you do not own', (await call('/api/city/ticket?chog=1')).status === 403);
// The live city: say hello with the guest ticket, get your id and everyone's positions, and get pulled back
// when trying to jump across the map.
const wsUrl = host.startsWith('localhost') ? 'ws://localhost:3001' : `wss://${host}/ws`;
const seen = await new Promise<string[]>((resolve) => {
  const got: string[] = [];
  const ws = new WebSocket(wsUrl, { headers: { origin: base } });
  const done = () => {
    ws.close();
    resolve(got);
  };
  setTimeout(done, 4000);
  ws.on('open', () => ws.send(JSON.stringify({ t: 'hi', ticket: guest.body.ticket })));
  ws.on('message', (raw) => {
    const m = JSON.parse(String(raw)) as { t: string };
    if (!got.includes(m.t)) got.push(m.t);
    if (m.t === 'you') ws.send(JSON.stringify({ t: 'mv', x: 2, y: 2, f: 1, m: 1 }));
    if (['you', 'all', 's', 'fix'].every((t) => got.includes(t))) done();
  });
});
check(
  'live city: hello, positions, move check',
  ['you', 'all', 's', 'fix'].every((t) => seen.includes(t)),
  seen.join(','),
);
// Raid rooms: a watch request for a raid that isn't running is turned away (so the route is there).
const raid = await new Promise<string>((resolve) => {
  const ws = new WebSocket(wsUrl, { headers: { origin: base } });
  setTimeout(() => resolve('timeout'), 4000);
  ws.on('open', () => ws.send(JSON.stringify({ t: 'watch', run: 'notarealrun1' })));
  ws.on('close', (code, why) => resolve(`${code} ${String(why)}`));
});
check('raid rooms answer', raid === '1008 no-raid', raid);
check(
  'live finish needs the live server’s signature',
  (
    await call('/api/heist/live-finish', {
      method: 'POST',
      body: JSON.stringify({ run: 'x', inputs: '', defenders: [] }),
    })
  ).status === 403,
);
const out = await call('/api/auth/logout', { method: 'POST' });
check('logout', out.status === 200 && (await call('/api/war/me')).body.address === null);
