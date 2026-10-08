import { leaveCrew, refundCancelled, type Ctx } from '@chog-city/game';
import { eq } from 'drizzle-orm';
import { activeEvents } from './config.ts';
import { crews, type Db } from './db/index.ts';
import { lockStates, saveStates } from './states.ts';

/**
 * A Chog changed owner. Its record and used moves stay with it, but it leaves any open crew:
 * the new owner didn't agree to that job. If it led the crew, the crew is cancelled and refunded.
 */
export async function onTransfer(db: Db, tokenId: number, now = Date.now()): Promise<void> {
  await db.transaction(async (tx) => {
    const st = await lockStates(tx, [tokenId], now);
    const s = st.get(tokenId)!;
    if (!s.crewId) return;
    const [row] = await tx.select().from(crews).where(eq(crews.id, s.crewId)).for('update');
    if (!row || row.status !== 'open') {
      await saveStates(tx, [{ ...s, crewId: null }]);
      return;
    }
    const crew = { ...row, createdAt: row.createdAt.getTime() };
    const ctx: Ctx = { now, seed: '', holders: {}, events: activeEvents(now) };
    const r = leaveCrew(ctx, crew, s);
    if (!r.ok) return;
    const others = crew.slots.filter((x): x is number => x !== null && x !== tokenId);
    const ost = await lockStates(tx, others, now);
    const changed = [r.value.state];
    if (r.value.crew.status === 'cancelled')
      for (const id of others) changed.push(refundCancelled(ctx, crew, ost.get(id)!));
    await saveStates(tx, changed);
    await tx
      .update(crews)
      .set({ slots: r.value.crew.slots, status: r.value.crew.status })
      .where(eq(crews.id, crew.id));
  });
}
