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
const board = await call('/api/board');
check('board', board.status === 200 && board.body.offers.length > 10, `${board.body?.offers?.length} offers`);
const before = await call('/api/me');
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
const me = await call('/api/me');
check('me after login', me.body?.address === account.address.toLowerCase() && me.body.chogs.length === 0);
const move = await call('/api/move', {
  method: 'POST',
  body: JSON.stringify({ action: 'job', chogId: 1, offerKey: 'skim-atm@mon-square' }),
});
check('cannot play a Chog you do not own', move.status === 409 && move.body.error === 'NOT_YOUR_CHOG');
const bad = await call('/api/move', {
  method: 'POST',
  body: JSON.stringify({ action: 'job', chogId: 99999 }),
});
check('rejects bad input', bad.status === 400);
const chog = await call('/api/chog/683');
check(
  'chog page data',
  chog.status === 200 && typeof chog.body.chog.name === 'string',
  chog.body?.chog?.name,
);
const ctl = new AbortController();
const live = await fetch(base + '/api/live', { signal: ctl.signal });
check(
  'live feed opens',
  live.status === 200 && (live.headers.get('content-type') ?? '').includes('text/event-stream'),
);
ctl.abort();
const out = await call('/api/auth/logout', { method: 'POST' });
check('logout', out.status === 200 && (await call('/api/me')).body.address === null);
