// Test helper: play as a throwaway test wallet against a running server (local dev or staging).
//   npx tsx tools/smoke/act.ts <base> <keyfile> sign <nonce>          -> prints a signed login message for a browser
//   npx tsx tools/smoke/act.ts <base> <keyfile> <move-json> [...]     -> logs in and plays each move, prints results
// The key file holds a test key made for this purpose only. Never use a real wallet's key here.
import { readFileSync } from 'node:fs';
import { privateKeyToAccount } from 'viem/accounts';
import { createSiweMessage } from 'viem/siwe';

const [base, keyFile, ...rest] = process.argv.slice(2);
if (!base || !keyFile || !rest.length)
  throw new Error('usage: act.ts <base> <keyfile> sign <nonce> | <move-json>...');
const account = privateKeyToAccount(readFileSync(keyFile, 'utf8').trim() as `0x${string}`);
const host = new URL(base).host;
const message = (nonce: string) =>
  createSiweMessage({
    address: account.address,
    chainId: 143,
    domain: host,
    nonce,
    uri: base,
    version: '1',
    statement: 'Log in to Chog World. This costs nothing and does not move any tokens.',
  });

if (rest[0] === 'sign') {
  const m = message(rest[1]!);
  console.log(JSON.stringify({ message: m, signature: await account.signMessage({ message: m }) }));
  process.exit(0);
}

let cookie = '';
async function call(path: string, init: RequestInit = {}) {
  const r = await fetch(base + path, { ...init, headers: { 'content-type': 'application/json', cookie } });
  const c = r.headers.get('set-cookie');
  if (c) cookie = c.split(';')[0]!;
  return r.json();
}
const { nonce } = await call('/api/auth/nonce');
const m = message(nonce);
const login = await call('/api/auth/verify', {
  method: 'POST',
  body: JSON.stringify({ message: m, signature: await account.signMessage({ message: m }) }),
});
if (!login.ok) throw new Error('login failed');
for (const raw of rest) {
  const move = JSON.parse(raw);
  const r = await call('/api/move', { method: 'POST', body: JSON.stringify(move) });
  const summary = r.ok
    ? {
        ok: true,
        crew: r.crew ? { id: r.crew.id, slots: r.crew.slots, status: r.crew.status } : null,
        events: r.events.map(
          (e: { event: { type: string; success?: boolean } }) =>
            `${e.event.type}${e.event.success === undefined ? '' : e.event.success ? ':won' : ':lost'}`,
        ),
      }
    : r;
  console.log(move.action, JSON.stringify(summary));
}
