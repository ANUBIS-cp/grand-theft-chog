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
  const waiting = (sentOther = false) =>
    json({ state: 'waiting', amount: monAmount(p.amountWei), expiresAt: p.expiresAt, sentOther });
  // Nothing sent from the wallet since the try started: nothing to look for yet.
  const nonce = await chain.getTransactionCount({ address });
  if (nonce <= p.nonce) return waiting();
  const sentAt = p.sentAt ?? Date.now();
  // Look through every block since the last look, a batch at a time, never skipping one: a phone that sat in the
  // wallet app for a few minutes catches up over the next checks.
  const latest = Number(await chain.getBlockNumber());
  const to = Math.min(latest, p.lastBlock + SCAN_MAX);
  let reached = p.lastBlock;
  for (let from = p.lastBlock + 1; from <= to; from += 10) {
    const nums: number[] = [];
    for (let n = from; n < from + 10 && n <= to; n++) nums.push(n);
    const got = await Promise.all(
      nums.map((n) =>
        chain.getBlock({ blockNumber: BigInt(n), includeTransactions: true }).catch(() => null),
      ),
    );
    for (const [i, b] of got.entries()) {
      // A block not readable yet: stop here and pick up from it next time.
      if (!b) {
        await advanceProof(d, p.id, reached, sentAt);
        return waiting();
      }
      for (const tx of b.transactions)
        if (typeof tx !== 'string' && isProofTx(p, tx)) {
          await finishProof(d, p.id, tx.hash, Date.now());
          return done();
        }
      reached = nums[i]!;
    }
  }
  await advanceProof(d, p.id, reached, sentAt);
  // Only say it looks wrong once its block has had plenty of time to show up and we've caught up.
  return waiting(reached >= latest && Date.now() - sentAt > 20_000);
}
