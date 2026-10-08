import { CHOGS } from '@chog-city/data';
import { newChogState, type ChogState } from '@chog-city/game';
import { inArray, sql } from 'drizzle-orm';
import { chogStates, type Db } from './db/index.ts';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export function isChogId(id: unknown): id is number {
  return Number.isInteger(id) && (id as number) >= 1 && (id as number) <= CHOGS.length;
}

const row = (s: ChogState) => ({
  id: s.id,
  state: s,
  gang: s.gang,
  cash: s.cash,
  xp: s.xp,
  active: s.active,
  updatedAt: new Date(),
});

/** Creates every Chog's starting state if it isn't there yet (season start). */
export async function seedStates(db: Db, now: number): Promise<number> {
  const rows = CHOGS.map((c) => row(newChogState(c.id, now)));
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const r = await db
      .insert(chogStates)
      .values(rows.slice(i, i + 500))
      .onConflictDoNothing()
      .returning({ id: chogStates.id });
    inserted += r.length;
  }
  return inserted;
}

/** Locks the given Chogs' rows (always in ID order, so two moves can't deadlock) and returns their states. */
export async function lockStates(tx: Tx, ids: number[], now: number): Promise<Map<number, ChogState>> {
  const sorted = [...new Set(ids)].sort((a, b) => a - b);
  if (!sorted.length) return new Map();
  await tx
    .insert(chogStates)
    .values(sorted.map((id) => row(newChogState(id, now))))
    .onConflictDoNothing();
  const rows = await tx
    .select()
    .from(chogStates)
    .where(inArray(chogStates.id, sorted))
    .orderBy(chogStates.id)
    .for('update');
  return new Map(rows.map((r) => [r.id, r.state]));
}

export async function saveStates(tx: Tx, states: ChogState[]): Promise<void> {
  for (const s of states)
    await tx
      .insert(chogStates)
      .values(row(s))
      .onConflictDoUpdate({
        target: chogStates.id,
        set: { state: s, gang: s.gang, cash: s.cash, xp: s.xp, active: s.active, updatedAt: sql`now()` },
      });
}

export async function getStates(db: Db, ids: number[]): Promise<Map<number, ChogState>> {
  if (!ids.length) return new Map();
  const rows = await db.select().from(chogStates).where(inArray(chogStates.id, ids));
  return new Map(rows.map((r) => [r.id, r.state]));
}
