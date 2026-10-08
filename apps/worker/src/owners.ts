import { COLLECTION } from '@chog-city/data';
import { chainCursors, owners, type Db } from '@chog-city/server/db';
import { onTransfer, setOwners } from '@chog-city/server';
import { count, eq } from 'drizzle-orm';
import { parseAbi, parseAbiItem, type PublicClient } from 'viem';
import { errCode, log } from './log.ts';

const NFT = COLLECTION.contract;
const ownerOfAbi = parseAbi(['function ownerOf(uint256) view returns (address)']);
const transferEvent = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
);
const CURSOR = 'chog-transfers';
const MAX_RANGE = 100n; // Monad's eth_getLogs limit

/** Reads every owner at one block (Multicall3) and stores them. Done once, then Transfer logs keep it fresh. */
export async function snapshotOwners(db: Db, client: PublicClient): Promise<void> {
  const n = (await db.select({ n: count() }).from(owners))[0]?.n ?? 0;
  const [cursor] = await db.select().from(chainCursors).where(eq(chainCursors.name, CURSOR));
  if (n === COLLECTION.supply && cursor) return;
  const block = await client.getBlockNumber();
  const ids = Array.from({ length: COLLECTION.supply }, (_, i) => i + 1);
  const rows: { tokenId: number; owner: string; block: number }[] = [];
  for (let i = 0; i < ids.length; i += 250) {
    const chunk = ids.slice(i, i + 250);
    const res = await client.multicall({
      contracts: chunk.map((id) => ({
        address: NFT,
        abi: ownerOfAbi,
        functionName: 'ownerOf' as const,
        args: [BigInt(id)],
      })),
      blockNumber: block,
      allowFailure: true,
    });
    res.forEach((r, j) => {
      if (r.status === 'success') rows.push({ tokenId: chunk[j]!, owner: r.result, block: Number(block) });
    });
  }
  await setOwners(db, rows);
  await db
    .insert(chainCursors)
    .values({ name: CURSOR, block: Number(block) })
    .onConflictDoUpdate({ target: chainCursors.name, set: { block: Number(block) } });
  log('owners snapshot', {
    owners: rows.length,
    wallets: new Set(rows.map((r) => r.owner.toLowerCase())).size,
    block: Number(block),
  });
}

/** Follows Transfer logs from the cursor. Returns how many transfers it applied. */
export async function followTransfers(db: Db, client: PublicClient): Promise<number> {
  const [cursor] = await db.select().from(chainCursors).where(eq(chainCursors.name, CURSOR));
  if (!cursor) return 0;
  const latest = await client.getBlockNumber();
  let from = BigInt(cursor.block) + 1n;
  let applied = 0;
  while (from <= latest) {
    const to = from + MAX_RANGE - 1n < latest ? from + MAX_RANGE - 1n : latest;
    const logs = await client.getLogs({ address: NFT, event: transferEvent, fromBlock: from, toBlock: to });
    for (const l of logs) {
      const tokenId = Number(l.args.tokenId);
      await setOwners(db, [{ tokenId, owner: l.args.to!, block: Number(l.blockNumber) }]);
      await onTransfer(db, tokenId).catch((e) => log('onTransfer failed', { tokenId, err: errCode(e) }));
      applied++;
    }
    await db
      .update(chainCursors)
      .set({ block: Number(to) })
      .where(eq(chainCursors.name, CURSOR));
    from = to + 1n;
  }
  if (applied) log('transfers', { applied, block: Number(latest) });
  return applied;
}
