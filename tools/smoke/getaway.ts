// End-to-end test of a whole robbery against a running web app + live server (local or staging), with a
// throwaway test wallet: break in (a perfect lock), the vault (a quick grab), then the getaway home through the
// live city with the police after you.
//   npx tsx tools/smoke/getaway.ts <base> <ws-url> <keyfile> [target gang]
// The key file holds a test key made for this only. Never use a real wallet's key here.
import { readFileSync } from 'node:fs';
import { GANG_IDS } from '@chog-city/data';
import { WALK_SPEED, placeOf, route } from '@chog-city/game/city';
import { encodeLock, perfectLock } from '@chog-city/game/lock';
import { encodeRushInputs, rushMapFor, rushSeed, type RushInput } from '@chog-city/game/rush';
import { privateKeyToAccount } from 'viem/accounts';
import { createSiweMessage } from 'viem/siwe';
import WebSocket from 'ws';

const [base, wsUrl, keyFile, wanted] = process.argv.slice(2);
if (!base || !wsUrl || !keyFile) throw new Error('usage: getaway.ts <base> <ws> <keyfile>');
const account = privateKeyToAccount(readFileSync(keyFile, 'utf8').trim() as `0x${string}`);

let cookie = '';
async function call(path: string, body?: unknown) {
  const r = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const c = r.headers.get('set-cookie');
  if (c) cookie = c.split(';')[0]!;
  return r.json();
}
const { nonce } = await call('/api/auth/nonce');
const message = createSiweMessage({
  address: account.address,
  chainId: 143,
  domain: new URL(base).host,
  nonce,
  uri: base,
  version: '1',
  statement: 'Log in to Chog City. This costs nothing and does not move any tokens.',
});
if (!(await call('/api/auth/verify', { message, signature: await account.signMessage({ message }) })).ok)
  throw new Error('login failed');

// A Chog in a gang, and a target whose vault is the bank maze (the quick grab below is made for it).
const me = await call('/api/war/me');
type MyChog = {
  id: number;
  gang: string | null;
  gangChoices: string[];
  hitToday: string[];
  jailedUntil: number | null;
};
const free = (c: MyChog) =>
  (!c.jailedUntil || c.jailedUntil < Date.now()) && !(wanted && c.hitToday?.includes(wanted));
const chog: MyChog =
  me.chogs.find((c: MyChog) => c.gang && c.gang !== wanted && free(c)) ??
  me.chogs.find((c: MyChog) => !c.gang && free(c) && c.gangChoices.some((g) => g !== wanted)) ??
  me.chogs[0];
const gang = chog.gang ?? chog.gangChoices.find((g) => g !== wanted) ?? chog.gangChoices[0];
if (!chog.gang) await call('/api/war/gang', { chogId: chog.id, gang });
const target =
  wanted ??
  GANG_IDS.find((g) => g !== gang && rushMapFor(g).id === 'rush-bank' && !chog.hitToday?.includes(g));
if (!target) throw new Error('no bank-maze target left today');

const start = await call('/api/heist/start', { chogId: chog.id, target });
if (!start.ok) throw new Error(`start: ${JSON.stringify(start)}`);
const run = start.run;
console.log('1. robbery', run.id, `${gang} -> ${target}`, 'pass before the lock:', 'pass' in start);
const lock = await call('/api/heist/lock', {
  runId: run.id,
  inputs: encodeLock(perfectLock(target, rushSeed(run.id))),
});
console.log('   break-in:', lock.ok ? (lock.loud ? 'loud' : 'quiet') : JSON.stringify(lock));

const go = (d: 0 | 1 | 2 | 3, n: number): RushInput[] => Array.from({ length: n }, () => ({ d }));
const grab = encodeRushInputs([...go(3, 12), ...go(1, 12), ...go(2, 10)]);
const fin = await call('/api/heist/finish', { runId: run.id, inputs: grab });
if (!fin.ok) throw new Error(`finish: ${JSON.stringify(fin)}`);
console.log(
  '2. vault:',
  fin.result.result,
  'bag',
  fin.result.moved,
  'getaway pass:',
  !!fin.result.getawayPass,
);
if (!fin.result.getawayPass) process.exit(0);

const { ticket } = await call(`/api/city/ticket?chog=${chog.id}`);
const ws = new WebSocket(wsUrl, { headers: { origin: base } });
let you = -1;
let pos = { x: 0, y: 0 };
let ended: Record<string, unknown> | null = null;
let cops = 0;
ws.on('message', (raw) => {
  const m = JSON.parse(String(raw));
  if (m.t === 'you') you = m.id;
  if (m.t === 'fix') pos = { x: m.x, y: m.y };
  if (m.t === 'chase') cops = m.cops.length;
  if (m.t === 'chase-end') ended = m;
});
await new Promise<void>((ok) => ws.on('open', () => ok()));
ws.send(JSON.stringify({ t: 'hi', ticket, x: 39, y: 27 }));
while (you < 0) await new Promise((r) => setTimeout(r, 50));
ws.send(JSON.stringify({ t: 'run', pass: fin.result.getawayPass }));
await new Promise((r) => setTimeout(r, 300));
const from = placeOf(target)!;
console.log('3. getaway: at the robbed door', Math.abs(pos.x - from.door.x) < 0.1, 'police', cops);
// Walk the shortest way home at walking speed, ten steps a second.
const home = placeOf(gang)!.door;
const path = route(pos.x, pos.y, home.x, home.y) ?? [];
path.push({ ...home });
const t0 = Date.now();
while (!ended && Date.now() - t0 < 90_000) {
  let left = WALK_SPEED * 0.1 * 0.95;
  while (left > 0 && path.length) {
    const p = path[0]!;
    const d = Math.hypot(p.x - pos.x, p.y - pos.y);
    if (d <= left) {
      pos = { ...p };
      path.shift();
      left -= d;
    } else {
      pos = { x: pos.x + ((p.x - pos.x) / d) * left, y: pos.y + ((p.y - pos.y) / d) * left };
      left = 0;
    }
  }
  ws.send(
    JSON.stringify({
      t: 'mv',
      x: Math.round(pos.x * 100) / 100,
      y: Math.round(pos.y * 100) / 100,
      f: 1,
      m: 1,
    }),
  );
  await new Promise((r) => setTimeout(r, 100));
}
console.log('   ended:', JSON.stringify(ended), `after ${((Date.now() - t0) / 1000).toFixed(1)} s`);
await new Promise((r) => setTimeout(r, 1500));
const board = await call('/api/war');
console.log('4. latest hit:', JSON.stringify(board.hits?.[0] ?? null));
process.exit(0);
