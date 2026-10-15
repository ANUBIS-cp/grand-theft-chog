import { getChog, type GangId } from '@chog-city/data';
import { and, desc, eq, gt, sql } from 'drizzle-orm';
import { decodeEventLog, parseAbi, type PublicClient } from 'viem';
import { chogBurns, heistChogs, type Db } from './db/index.ts';
import { HeistRefused, heistRecord } from './heists.ts';
import { canControl } from './ownership.ts';

// $CHOG in Chog World: players burn it from their own wallet with $CHOG's own burn(), and the server reads the
// burn off the chain before it does anything. No contract of ours, no game wallet, and nothing is paid out.

export const CHOG_TOKEN = '0x350035555E10d9AfAF1566AaebfCeD5BA6C27777' as const;
export const BURN_KINDS = ['bail', 'poster', 'banner'] as const;
export type BurnKind = (typeof BURN_KINDS)[number];
/** Whole $CHOG each costs (cents: 10,000 CHOG was about $33 on 8 Oct). */
export const BURN_PRICE: Record<BurnKind, number> = { bail: 30, poster: 60, banner: 150 };
/** How long a poster or banner stays up. A second one adds another day. */
export const BURN_DAY_MS = 24 * 3600_000;
/** A burn older than this can't be used (it was made for something else, or long ago). */
const BURN_FRESH_MS = 60 * 60_000;
/** Lines for a Wanted poster: picked from a list, so there's no free text to watch. */
export const POSTER_LINES = [
  'Wanted',
  'Robbed us',
  'Owes us money',
  'Do not trust',
  'Catch on sight',
  'Last seen running',
] as const;

export const CHOG_ABI = parseAbi([
  'function burn(uint256 value)',
  'function balanceOf(address) view returns (uint256)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
]);
const ZERO = '0x0000000000000000000000000000000000000000';
const WEI = 10n ** 18n;

export interface BurnAsk {
  address: string;
  kind: BurnKind;
  chogId: number;
  line?: number;
}

/** What a burn will do, checked before the player sends it (so nobody burns for nothing). */
export async function checkBurn(db: Db, ask: BurnAsk, now: number) {
  const { address, kind, chogId } = ask;
  if (!getChog(chogId)) throw new HeistRefused('no-chog');
  if (kind === 'bail') {
    if (!(await canControl(db, address, chogId))) throw new HeistRefused('not-yours');
    const me = await heistRecord(db, chogId);
    if (!me?.jailedUntil || me.jailedUntil.getTime() <= now) throw new HeistRefused('not-in-jail');
    return { kind, chogId };
  }
  if (kind === 'poster') {
    if (ask.line === undefined || ask.line < 0 || ask.line >= POSTER_LINES.length)
      throw new HeistRefused('bad-line');
    // A poster goes up on someone else's Chog, and it has to be in a gang to be worth chasing.
    if (await canControl(db, address, chogId)) throw new HeistRefused('own-chog');
    const them = await heistRecord(db, chogId);
    if (!them?.gang) throw new HeistRefused('no-gang');
    return { kind, chogId, line: ask.line };
  }
  if (!(await canControl(db, address, chogId))) throw new HeistRefused('not-yours');
  const me = await heistRecord(db, chogId);
  if (!me?.gang) throw new HeistRefused('no-gang');
  return { kind, chogId, gang: me.gang as GangId };
}

/**
 * Reads a burn transaction off the chain: it must have gone through, burned from `address` on $CHOG at
 * least `price`, and be recent. Returns the whole $CHOG burned.
 */
export async function readBurn(
  client: Pick<PublicClient, 'waitForTransactionReceipt' | 'getBlock'>,
  { tx, address, price, now }: { tx: `0x${string}`; address: string; price: number; now: number },
): Promise<number> {
  const receipt = await client
    .waitForTransactionReceipt({ hash: tx, timeout: 45_000, pollingInterval: 1_000 })
    .catch(() => null);
  if (!receipt) throw new HeistRefused('burn-not-found');
  if (receipt.status !== 'success') throw new HeistRefused('burn-failed');
  let burned = 0n;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== CHOG_TOKEN.toLowerCase()) continue;
    try {
      const ev = decodeEventLog({ abi: CHOG_ABI, data: log.data, topics: log.topics });
      if (
        ev.eventName === 'Transfer' &&
        ev.args.from.toLowerCase() === address.toLowerCase() &&
        ev.args.to === ZERO
      )
        burned += ev.args.value;
    } catch {
      /* not a Transfer */
    }
  }
  if (burned < BigInt(price) * WEI) throw new HeistRefused('burn-too-small');
  const block = await client.getBlock({ blockNumber: receipt.blockNumber });
  if (Number(block.timestamp) * 1000 < now - BURN_FRESH_MS) throw new HeistRefused('burn-too-old');
  return Number(burned / WEI);
}

/** Records a checked burn and does what it paid for. A transaction can only ever be used once. */
export async function applyBurn(
  db: Db,
  ask: BurnAsk & { tx: string; amount: number },
  now: number,
): Promise<{ kind: BurnKind; until: number | null }> {
  const what = await checkBurn(db, ask, now);
  return db.transaction(async (tx) => {
    let until: number | null = null;
    if (what.kind !== 'bail') {
      // Another poster on the same Chog (or banner for the same gang) adds a day to the one that's up.
      const [up] = await tx
        .select({ until: chogBurns.until })
        .from(chogBurns)
        .where(
          and(
            eq(chogBurns.kind, what.kind),
            what.kind === 'poster' ? eq(chogBurns.chogId, what.chogId) : eq(chogBurns.gang, what.gang!),
            gt(chogBurns.until, new Date(now)),
          ),
        )
        .orderBy(desc(chogBurns.until))
        .limit(1);
      until = Math.max(now, up?.until?.getTime() ?? 0) + BURN_DAY_MS;
    }
    const [row] = await tx
      .insert(chogBurns)
      .values({
        tx: ask.tx.toLowerCase(),
        address: ask.address.toLowerCase(),
        kind: what.kind,
        chogId: what.chogId,
        gang: 'gang' in what ? what.gang : null,
        line: 'line' in what ? what.line : null,
        amount: ask.amount,
        at: new Date(now),
        until: until === null ? null : new Date(until),
      })
      .onConflictDoNothing()
      .returning({ tx: chogBurns.tx });
    if (!row) throw new HeistRefused('burn-used');
    if (what.kind === 'bail')
      await tx
        .update(heistChogs)
        .set({ jailedUntil: new Date(now) })
        .where(eq(heistChogs.id, what.chogId));
    await tx
      .execute(sql`select pg_notify('city', ${JSON.stringify({ burn: what.kind, chog: what.chogId })})`)
      .catch(() => undefined);
    return { kind: what.kind, until };
  });
}

/** Posters and banners up right now, and the city's total burned. */
export async function burnsNow(db: Db, now: number) {
  const up = await db
    .select()
    .from(chogBurns)
    .where(gt(chogBurns.until, new Date(now)))
    .orderBy(desc(chogBurns.until));
  const posters = new Map<number, { chog: number; line: string; until: number }>();
  const banners = new Map<GangId, { gang: GangId; until: number }>();
  for (const r of up) {
    if (r.kind === 'poster' && r.chogId !== null && !posters.has(r.chogId))
      posters.set(r.chogId, {
        chog: r.chogId,
        line: POSTER_LINES[r.line ?? 0] ?? POSTER_LINES[0],
        until: r.until!.getTime(),
      });
    if (r.kind === 'banner' && r.gang && !banners.has(r.gang))
      banners.set(r.gang, { gang: r.gang, until: r.until!.getTime() });
  }
  const [sum] = await db
    .select({ total: sql<number>`coalesce(sum(${chogBurns.amount}), 0)::int` })
    .from(chogBurns);
  return { posters: [...posters.values()], banners: [...banners.values()], burned: sum?.total ?? 0 };
}
