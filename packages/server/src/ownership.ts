import { and, eq, inArray, lte } from 'drizzle-orm';
import { delegations, owners, type Db } from './db/index.ts';

export const lower = (a: string) => a.toLowerCase();

export async function ownerOf(db: Db, tokenId: number): Promise<string | null> {
  const [r] = await db.select({ owner: owners.owner }).from(owners).where(eq(owners.tokenId, tokenId));
  return r?.owner ?? null;
}

/** Wallets whose Chogs this wallet may play: itself, plus owners who approved it. */
export async function playableOwners(db: Db, address: string): Promise<string[]> {
  const a = lower(address);
  const rows = await db
    .select({ owner: delegations.owner })
    .from(delegations)
    .where(eq(delegations.player, a));
  return [a, ...rows.map((r) => r.owner)];
}

export async function canControl(db: Db, address: string, tokenId: number): Promise<boolean> {
  const owner = await ownerOf(db, tokenId);
  if (!owner) return false;
  if (owner === lower(address)) return true;
  const [d] = await db
    .select({ owner: delegations.owner })
    .from(delegations)
    .where(and(eq(delegations.owner, owner), eq(delegations.player, lower(address))));
  return Boolean(d);
}

/** Every Chog this wallet can play, with who owns it. */
export async function chogsFor(db: Db, address: string): Promise<{ tokenId: number; owner: string }[]> {
  const list = await playableOwners(db, address);
  return db
    .select({ tokenId: owners.tokenId, owner: owners.owner })
    .from(owners)
    .where(inArray(owners.owner, list))
    .orderBy(owners.tokenId);
}

export async function sameOwner(db: Db, a: number, b: number): Promise<boolean> {
  const [x, y] = await Promise.all([ownerOf(db, a), ownerOf(db, b)]);
  return x !== null && x === y;
}

/** Writes owners from a snapshot or a Transfer log. Ignores updates older than what we have. */
export async function setOwners(
  db: Db,
  rows: { tokenId: number; owner: string; block: number }[],
): Promise<void> {
  for (const r of rows)
    await db
      .insert(owners)
      .values({ tokenId: r.tokenId, owner: lower(r.owner), block: r.block })
      .onConflictDoUpdate({
        target: owners.tokenId,
        set: { owner: lower(r.owner), block: r.block },
        setWhere: lte(owners.block, r.block),
      });
}
