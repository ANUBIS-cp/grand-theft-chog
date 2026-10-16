import { randomBytes, randomInt } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { walletProofs, type Db } from './db/index.ts';

// Sign in without connecting a wallet: the game names an amount between 0.0100 and 0.0999 MON, the holder sends
// exactly that from their wallet to the same wallet (it comes straight back; only the network fee is spent),
// and the game spots the transfer on Monad. Only the wallet's owner can send from it, so that proves it.
// The chain is read by the caller (the web app); this keeps the rows.

/** How long a try stays open. */
export const PROOF_MS = 15 * 60_000;
const WEI_PER_TENTH_MILLI = 10n ** 14n; // 0.0001 MON

export interface ProofRow {
  id: string;
  address: string;
  amountWei: bigint;
  nonce: number;
  lastBlock: number;
  expiresAt: number;
  tx: string | null;
  /** When the wallet was first seen sending something, or null. */
  sentAt: number | null;
}

const toRow = (r: typeof walletProofs.$inferSelect): ProofRow => ({
  id: r.id,
  address: r.address,
  amountWei: BigInt(r.amountWei),
  nonce: r.nonce,
  lastBlock: r.lastBlock,
  expiresAt: r.expiresAt.getTime(),
  tx: r.tx,
  sentAt: r.sentAt ? r.sentAt.getTime() : null,
});

/** "0.0347" for an amount in wei. */
export function monAmount(wei: bigint): string {
  const tenthMilli = Number(wei / WEI_PER_TENTH_MILLI);
  return (tenthMilli / 10_000).toFixed(4);
}

/** A new try for `address` (lower case), from where its wallet stands now on chain. */
export async function startProof(
  db: Db,
  a: { address: string; nonce: number; block: number; now: number },
): Promise<ProofRow> {
  // 0.0100 to 0.0999 MON: big enough to type without a slip, small enough not to matter, and different
  // from this wallet's other open tries.
  const open = await db
    .select({ amountWei: walletProofs.amountWei })
    .from(walletProofs)
    .where(
      and(
        eq(walletProofs.address, a.address),
        isNull(walletProofs.doneAt),
        gt(walletProofs.expiresAt, new Date(a.now)),
      ),
    );
  const taken = new Set(open.map((o) => o.amountWei));
  let amount = 0n;
  for (let i = 0; i < 50; i++) {
    amount = BigInt(randomInt(100, 1000)) * WEI_PER_TENTH_MILLI;
    if (!taken.has(amount.toString())) break;
  }
  const [row] = await db
    .insert(walletProofs)
    .values({
      id: randomBytes(16).toString('base64url'),
      address: a.address,
      amountWei: amount.toString(),
      nonce: a.nonce,
      lastBlock: a.block,
      createdAt: new Date(a.now),
      expiresAt: new Date(a.now + PROOF_MS),
    })
    .returning();
  return toRow(row!);
}

export async function getProof(db: Db, id: string): Promise<ProofRow | null> {
  if (!/^[A-Za-z0-9_-]{16,32}$/.test(id)) return null;
  const [r] = await db.select().from(walletProofs).where(eq(walletProofs.id, id));
  return r ? toRow(r) : null;
}

/**
 * Looked through every block up to `block` without finding it. `sentAt` notes when the wallet was first seen
 * sending (its count goes up a moment before its block can be read, so a miss right then means nothing yet).
 */
export async function advanceProof(db: Db, id: string, block: number, sentAt: number | null): Promise<void> {
  await db
    .update(walletProofs)
    .set({ lastBlock: block, ...(sentAt !== null ? { sentAt: new Date(sentAt) } : {}) })
    .where(eq(walletProofs.id, id));
}

/** Found it: the try is done. Returns false if it was already done (by another check at the same time). */
export async function finishProof(db: Db, id: string, tx: string, now: number): Promise<boolean> {
  const done = await db
    .update(walletProofs)
    .set({ tx, doneAt: new Date(now) })
    .where(and(eq(walletProofs.id, id), isNull(walletProofs.doneAt)))
    .returning({ id: walletProofs.id });
  return done.length > 0;
}

/** Is this transaction the proof: from the wallet, to the same wallet, exactly the amount? */
export function isProofTx(
  p: { address: string; amountWei: bigint },
  tx: { from?: string | null; to?: string | null; value?: bigint | null },
): boolean {
  const a = p.address.toLowerCase();
  return tx.from?.toLowerCase() === a && tx.to?.toLowerCase() === a && tx.value === p.amountWei;
}
