import { randomBytes } from 'node:crypto';
import { flipTurf, seedCommitment, turfScores, type GameEvent } from '@chog-city/game';
import { and, desc, eq, lt, sql } from 'drizzle-orm';
import { chogStates, crews, days, events, type Db, type Holders } from './db/index.ts';

const DAYS_LOCK = 0x43_48_4f_47; // "CHOG"

export type DayRow = typeof days.$inferSelect;

/**
 * Returns the row for a game day, creating it exactly once: a fresh secret seed, and the turf flip from the
 * last day that was played. Open crews from earlier days expire here and their members are freed.
 * Safe to call from many requests at once (advisory lock) and from both the web app and the worker.
 */
export async function ensureDay(db: Db, day: number): Promise<DayRow> {
  const [existing] = await db.select().from(days).where(eq(days.day, day));
  if (existing) return existing;
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${DAYS_LOCK})`);
    const [again] = await tx.select().from(days).where(eq(days.day, day));
    if (again) return again;

    const [prev] = await tx.select().from(days).where(lt(days.day, day)).orderBy(desc(days.day)).limit(1);
    let holders: Holders = {};
    let changes: DayRow['changes'] = [];
    if (prev) {
      const rows = await tx
        .select({ data: events.data })
        .from(events)
        .where(and(eq(events.day, prev.day), eq(events.type, 'job')));
      ({ holders, changes } = flipTurf(prev.holders, turfScores(rows.map((r) => r.data as GameEvent))));
    }
    const expired = await tx
      .update(crews)
      .set({ status: 'expired' })
      .where(and(lt(crews.day, day), eq(crews.status, 'open')))
      .returning({ id: crews.id });
    for (const { id } of expired)
      await tx.execute(
        sql`update ${chogStates} set state = jsonb_set(state, '{crewId}', 'null'::jsonb) where state->>'crewId' = ${id}`,
      );

    const seed = randomBytes(32).toString('hex');
    const [row] = await tx
      .insert(days)
      .values({ day, seed, commitment: seedCommitment(seed), holders, changes })
      .returning();
    return row!;
  });
}
