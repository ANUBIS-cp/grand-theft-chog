// End-to-end smoke test against a running server with a throwaway wallet (made in memory, never saved).
// Usage: npx tsx tools/smoke/run.ts https://chogcity.35-212-31-75.sslip.io
import { createSiweMessage } from 'viem/siwe';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

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
check('gang vaults', board.status === 200 && board.body.board.length === 16, `${board.body?.board?.length} vaults`);
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
  statement: 'Log in to Chog City.',
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
const start = await call('/api/heist/start', { method: 'POST', body: JSON.stringify({ chogId: 1, target: 'mcga' }) });
check('cannot rob with a Chog you do not own', start.status === 409 && start.body.error === 'not-yours');
const bad = await call('/api/heist/start', { method: 'POST', body: JSON.stringify({ chogId: 99999, target: 'nope' }) });
check('rejects bad input', bad.status === 400);
const finish = await call('/api/heist/finish', { method: 'POST', body: JSON.stringify({ runId: 'not-a-real-run', inputs: '' }) });
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
const out = await call('/api/auth/logout', { method: 'POST' });
check('logout', out.status === 200 && (await call('/api/war/me')).body.address === null);
