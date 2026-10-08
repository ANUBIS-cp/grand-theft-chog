// Plays one real heist as a test wallet against a running server (local dev or staging):
//   npx tsx tools/smoke/war.ts <base> <keyfile> <target-gang> [inputs]
// Logs in, picks a gang for the first Chog if it has none, starts a run on the target vault and finishes it
// with the given inputs (default: grab the lobby cash and leave). The key file holds a throwaway test key.
import { readFileSync } from 'node:fs';
import { privateKeyToAccount } from 'viem/accounts';
import { createSiweMessage } from 'viem/siwe';

const [base, keyFile, target, inputs = '1'.repeat(16) + '3'.repeat(24)] = process.argv.slice(2);
if (!base || !keyFile || !target) throw new Error('usage: war.ts <base> <keyfile> <target-gang> [inputs]');
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
if (!(await call('/api/auth/verify', { message, signature: await account.signMessage({ message }) })).ok) throw new Error('login failed');
let me = await call('/api/war/me');
const chog = me.chogs[0];
if (!chog) throw new Error('this wallet has no Chogs here');
if (!chog.gang) {
  const gang = chog.gangChoices.find((g: string) => g !== target) ?? chog.gangChoices[0];
  console.log('gang', gang, await call('/api/war/gang', { chogId: chog.id, gang }));
  me = await call('/api/war/me');
}
console.log('playing', chog.name, 'for', me.chogs[0].gang, 'powers', chog.powers.join(','));
const start = await call('/api/heist/start', { chogId: chog.id, target });
console.log('start', start.ok ? { vault: start.run.vault, tier: start.run.tier, revenge: start.run.revenge, guards: start.run.guards.length } : start);
if (start.ok) console.log('finish', await call('/api/heist/finish', { runId: start.run.id, inputs }));
const board = await call('/api/war');
console.log('top vaults', board.board.slice(0, 4).map((v: { gang: string; cash: number }) => `${v.gang} ${v.cash}`).join(' | '));
console.log('latest hit', board.hits[0]);
