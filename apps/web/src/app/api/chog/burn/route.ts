import {
  BURN_KINDS,
  BURN_PRICE,
  CHOG_ABI,
  CHOG_TOKEN,
  HeistRefused,
  applyBurn,
  checkBurn,
  readBurn,
} from '@chog-city/server';
import { z } from 'zod';
import { publicClient } from '@/server/chain';
import { db } from '@/server/db';
import { error, json } from '@/server/http';
import { allow } from '@/server/rate';
import { currentAddress } from '@/server/session';

export const dynamic = 'force-dynamic';

const Body = z.object({
  kind: z.enum(BURN_KINDS),
  chogId: z.number().int().min(1).max(1969),
  line: z.number().int().min(0).max(20).optional(),
  /** Leave out to only check (and see your balance) before burning. */
  tx: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/)
    .optional(),
});

/**
 * $CHOG: bail, a Wanted poster or a gang banner. First call without `tx` to check it would work; the player
 * then burns from their own wallet and sends the transaction here, and it's read off the chain.
 */
export async function POST(req: Request) {
  const address = await currentAddress();
  if (!address) return error('login', 401);
  if (!allow(`burn:${address}`, 20, 0.2)) return error('slow-down', 429);
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return error('bad-request');
  const { kind, chogId, line, tx } = body.data;
  const price = BURN_PRICE[kind];
  const now = Date.now();
  try {
    if (!tx) {
      await checkBurn(await db(), { address, kind, chogId, line }, now);
      const balance = await publicClient()
        .readContract({
          address: CHOG_TOKEN,
          abi: CHOG_ABI,
          functionName: 'balanceOf',
          args: [address as `0x${string}`],
        })
        .then((b) => Number(b / 10n ** 15n) / 1000)
        .catch(() => null);
      return json({ ok: true, price, token: CHOG_TOKEN, balance });
    }
    const amount = await readBurn(publicClient(), { tx: tx as `0x${string}`, address, price, now });
    const done = await applyBurn(await db(), { address, kind, chogId, line, tx, amount }, Date.now());
    return json({ ok: true, ...done });
  } catch (e) {
    if (e instanceof HeistRefused) return error(e.code, 409);
    throw e;
  }
}
