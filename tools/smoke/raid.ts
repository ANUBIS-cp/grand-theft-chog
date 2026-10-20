// End-to-end test of a live raid against a running web app + live server (local or staging), with two
// throwaway test wallets: A robs B's gang, B jumps in as a guard and chases A down.
//   npx tsx tools/smoke/raid.ts <base> <ws-url> <robber-keyfile> <defender-keyfile> <target-gang>
// Prints what each side saw and the settled result. The key files hold test keys made for this only.
import { readFileSync } from 'node:fs';
import { DIRS, distanceMap, open, rushMap, type RushState } from '@chog-city/game/rush';
import { privateKeyToAccount } from 'viem/accounts';
import { createSiweMessage } from 'viem/siwe';
import WebSocket from 'ws';

const [base, wsUrl, keyA, keyB, target] = process.argv.slice(2);
if (!base || !wsUrl || !keyA || !keyB || !target)
  throw new Error('usage: raid.ts <base> <ws> <keyA> <keyB> <gang>');

async function player(keyFile: string) {
  const account = privateKeyToAccount(readFileSync(keyFile, 'utf8').trim() as `0x${string}`);
  let cookie = '';
  const call = async (path: string, body?: unknown) => {
    const r = await fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const c = r.headers.get('set-cookie');
    if (c) cookie = c.split(';')[0]!;
    return r.json();
  };
  const { nonce } = await call('/api/auth/nonce');
  const message = createSiweMessage({
    address: account.address,
    chainId: 143,
    domain: new URL(base).host,
    nonce,
    uri: base,
    version: '1',
    statement: 'Log in to Grand Theft Chog. This costs nothing and does not move any tokens.',
  });
  if (!(await call('/api/auth/verify', { message, signature: await account.signMessage({ message }) })).ok)
    throw new Error('login failed');
  return call;
}

const connect = (hello: unknown) =>
  new Promise<{ ws: WebSocket; room: Record<string, unknown>; got: Record<string, unknown>[] }>((ok, bad) => {
    const ws = new WebSocket(wsUrl, { headers: { origin: base } });
    const got: Record<string, unknown>[] = [];
    ws.on('open', () => ws.send(JSON.stringify(hello)));
    ws.on('message', (raw) => {
      const m = JSON.parse(String(raw));
      got.push(m);
      if (m.t === 'room') ok({ ws, room: m, got });
    });
    ws.on('close', (code, why) => bad(new Error(`closed ${code} ${why}`)));
    setTimeout(() => bad(new Error('no room')), 5000);
  });

const A = await player(keyA);
const B = await player(keyB);
// B's Chog joins the target gang; A's first Chog joins any other.
const meB = await B('/api/war/me');
const bChog = meB.chogs.find((c: { gangChoices: string[] }) => c.gangChoices.includes(target));
if (!bChog) throw new Error(`the defender wallet has no Chog that can join ${target}`);
if (!bChog.gang) await B('/api/war/gang', { chogId: bChog.id, gang: target });
const meA = await A('/api/war/me');
const aChog = meA.chogs[0];
if (!aChog.gang)
  await A('/api/war/gang', { chogId: aChog.id, gang: aChog.gangChoices.find((g: string) => g !== target) });

const start = await A('/api/heist/start', { chogId: aChog.id, target });
if (!start.ok) throw new Error(`start: ${JSON.stringify(start)}`);
console.log('robbery', start.run.id, 'map', start.run.vault, 'tier', start.run.tier);
const rob = await connect({ t: 'raid', pass: start.pass });
console.log('robber in the room');
const join = await B('/api/raid/join', { runId: start.run.id, chogId: bChog.id });
if (!join.ok) throw new Error(`join: ${JSON.stringify(join)}`);
const def = await connect({ t: 'raid', pass: join.pass });
console.log('defender in the room as guard', def.room.you);

// The robber stands at the door; the defender walks to them along the maze.
const map = rushMap(start.run.vault)!;
let latest: RushState | null = (def.room.s as RushState) ?? null;
let ended: unknown = null;
def.ws.on('message', (raw) => {
  const m = JSON.parse(String(raw));
  if (m.t === 'st') latest = m.s;
  if (m.t === 'end') ended = m;
});
rob.ws.on('message', (raw) => {
  const m = JSON.parse(String(raw));
  if (m.t === 'end') console.log('robber saw the end:', JSON.stringify(m.result));
});
const you = def.room.you as number;
const steer = setInterval(() => {
  if (!latest) return;
  const g = latest.guards[you]!;
  const dist = distanceMap(map, Math.floor(latest.me.x), Math.floor(latest.me.y));
  let best = -1;
  let bd = dist[Math.floor(g.y) * map.w + Math.floor(g.x)]!;
  DIRS.forEach(([dx, dy], d) => {
    const x = Math.floor(g.x) + dx;
    const y = Math.floor(g.y) + dy;
    const v = dist[y * map.w + x];
    if (open(map, x, y) && v !== undefined && v >= 0 && v < bd) {
      bd = v;
      best = d;
    }
  });
  def.ws.send(JSON.stringify({ t: 'dv', d: best }));
}, 100);
const idle = setInterval(() => rob.ws.send(JSON.stringify({ t: 'in', k: 'AAA' })), 100);
const t0 = Date.now();
while (!ended && Date.now() - t0 < 100_000) await new Promise((r) => setTimeout(r, 200));
clearInterval(steer);
clearInterval(idle);
console.log('defender saw the end:', JSON.stringify(ended));
const board = await A('/api/war');
console.log('latest hit', JSON.stringify(board.hits[0]), 'defender chog', bChog.id);
process.exit(0);
