import {
  chogsFor,
  finishProof,
  getProof,
  isProofTx,
  monAmount,
  advanceProof,
  startProof,
} from '@chog-city/server';
import { cookies } from 'next/headers';
import { getAddress, isAddress } from 'viem';
import { z } from 'zod';
import { publicClient } from '@/server/chain';
import { db } from '@/server/db';
import { error, json } from '@/server/http';
import { allow, clientIp } from '@/server/rate';
import { createSession, currentAddress } from '@/server/session';

export const dynamic = 'force-dynamic';

// Sign in by a send to yourself (packages/server/src/proofs.ts): POST starts a try for an address and names the
// amount; GET checks Monad for the transfer and signs this browser in when it lands.

const COOKIE = 'cw_proof';
/** At most this many blocks looked through per check (about two minutes of Monad). */
const SCAN_MAX = 300;

const Body = z.object({ address: z.string().max(64) });

export async function POST(req: Request) {
  if (!allow(`proof:${clientIp(req)}`, 6, 0.1)) return error('SLOW_DOWN', 429);
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success || !isAddress(body.data.address.trim())) return error('BAD_ADDRESS');
  const address = body.data.address.trim().toLowerCase();
  const d = await db();
  if (!(await chogsFor(d, address)).length) return error('NO_CHOGS');
  const chain = publicClient();
  const [nonce, block] = await Promise.all([
    chain.getTransactionCount({ address: getAddress(address) }),
    chain.getBlockNumber(),
  ]);
  const p = await startProof(d, { address, nonce, block: Number(block), now: Date.now() });
  (await cookies()).set(COOKIE, p.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 20 * 60,
  });
  return json({
    ok: true,
    address: getAddress(address),
    amount: monAmount(p.amountWei),
    expiresAt: p.expiresAt,
  });
}

export async function GET(req: Request) {
  if (!allow(`proofcheck:${clientIp(req)}`, 30, 1)) return error('SLOW_DOWN', 429);
  const id = (await cookies()).get(COOKIE)?.value;
  if (!id) return json({ state: 'none' });
  const d = await db();
  const p = await getProof(d, id);
  if (!p) return json({ state: 'none' });
  const done = async () => {
    // This browser started the try, so it's this browser that gets signed in.
    if ((await currentAddress()) !== p.address) await createSession(p.address);
    (await cookies()).delete(COOKIE);
    return json({ state: 'done' });
  };
  if (p.tx) return done();
  if (Date.now() > p.expiresAt) return json({ state: 'expired' });
  const chain = publicClient();
  const address = getAddress(p.address);
  const nonce = await chain.getTransactionCount({ address });
  // Nothing sent from the wallet since the last look: nothing to search.
  if (nonce <= p.nonce)
    return json({ state: 'waiting', amount: monAmount(p.amountWei), expiresAt: p.expiresAt });
  const latest = Number(await chain.getBlockNumber());
  const from = Math.max(p.lastBlock + 1, latest - SCAN_MAX + 1);
  const blocks: number[] = [];
  for (let b = from; b <= latest; b++) blocks.push(b);
  for (let i = 0; i < blocks.length; i += 10) {
    const got = await Promise.all(
      blocks
        .slice(i, i + 10)
        .map((n) => chain.getBlock({ blockNumber: BigInt(n), includeTransactions: true }).catch(() => null)),
    );
    for (const b of got)
      for (const tx of b?.transactions ?? [])
        if (typeof tx !== 'string' && isProofTx(p, tx)) {
          await finishProof(d, p.id, tx.hash, Date.now());
          return done();
        }
  }
  // They sent something else: remember where we got to.
  await advanceProof(d, p.id, latest, nonce);
  return json({ state: 'waiting', amount: monAmount(p.amountWei), expiresAt: p.expiresAt, sentOther: true });
}
