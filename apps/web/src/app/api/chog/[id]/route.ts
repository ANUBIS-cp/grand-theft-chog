import { events } from '@chog-city/server/db';
import { getStates, isChogId, ownerOf } from '@chog-city/server';
import { newChogState } from '@chog-city/game';
import { desc, eq, or } from 'drizzle-orm';
import { db } from '@/server/db';
import { error, json } from '@/server/http';
import { chogView } from '@/lib/views';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!isChogId(id)) return error('UNKNOWN_CHOG', 404);
  const now = Date.now();
  const [states, owner, recent] = await Promise.all([
    getStates(await db(), [id]),
    ownerOf(await db(), id),
    (await db())
      .select()
      .from(events)
      .where(or(eq(events.chogId, id), eq(events.target, id)))
      .orderBy(desc(events.id))
      .limit(30),
  ]);
  return json({
    chog: chogView(states.get(id) ?? newChogState(id, now), now),
    owner,
    events: recent.map((e) => ({ id: e.id, at: e.at.getTime(), event: e.data })),
  });
}
