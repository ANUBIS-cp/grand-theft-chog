import { GANG_IDS } from '@chog-city/data';
import {
  chogInfo,
  dayOf,
  involved,
  newChogState,
  playMove,
  type ChogInfo,
  type ChogState,
  type Crew,
  type Ctx,
  type GameError,
  type GameEvent,
  type MoveInput,
} from '@chog-city/game';
import { eq, inArray, sql } from 'drizzle-orm';
import { activeEvents } from './config.ts';
import { ensureDay } from './days.ts';
import { crewSeq, crews, events, owners, rowsOf, type Db } from './db/index.ts';
import { canControl } from './ownership.ts';
import { isChogId, lockStates, saveStates } from './states.ts';

export type { MoveInput } from '@chog-city/game';

export type MoveError = GameError | 'NOT_YOUR_CHOG' | 'UNKNOWN_CHOG' | 'UNKNOWN_CREW';

export interface StoredEvent {
  id: number;
  at: number;
  event: GameEvent;
}

export type MoveResult =
  { ok: true; events: StoredEvent[]; states: ChogState[]; crew?: Crew } | { ok: false; error: MoveError };

/** Kept for callers that used it before the rules moved into the game package. */
export function info(id: number): ChogInfo {
  return chogInfo(id);
}

function targetOf(e: GameEvent): number | null {
  return 'target' in e ? e.target : null;
}

const toCrew = (r: typeof crews.$inferSelect): Crew => ({
  id: r.id,
  day: r.day,
  offerKey: r.offerKey,
  leaderId: r.leaderId,
  slots: r.slots,
  jailbreakTarget: r.jailbreakTarget,
  status: r.status,
  createdAt: r.createdAt.getTime(),
});

class MoveFailed extends Error {
  readonly code: MoveError;
  constructor(code: MoveError) {
    super(code);
    this.code = code;
  }
}

/**
 * Plays one move for a logged-in wallet. The rules are the shared `playMove` (the practice city runs the
 * same function); this wraps it in one transaction with the involved Chogs locked in ID order, then stores
 * the events and announces them on the live feed when it commits.
 */
export async function applyMove(
  db: Db,
  address: string,
  input: MoveInput,
  now = Date.now(),
): Promise<MoveResult> {
  if (!isChogId(input.chogId)) return { ok: false, error: 'UNKNOWN_CHOG' };
  if ('target' in input && !isChogId(input.target)) return { ok: false, error: 'UNKNOWN_CHOG' };
  if (input.action === 'gang' && !GANG_IDS.includes(input.gang))
    return { ok: false, error: 'GANG_NOT_ALLOWED' };
  if (!(await canControl(db, address, input.chogId))) return { ok: false, error: 'NOT_YOUR_CHOG' };

  const day = dayOf(now);
  const dayRow = await ensureDay(db, day);
  const ctx: Ctx = { now, seed: dayRow.seed, holders: dayRow.holders, events: activeEvents(now) };

  try {
    return await db.transaction(async (tx) => {
      let crew: Crew | undefined;
      if (input.action === 'crew.join' || input.action === 'crew.leave') {
        const [row] = await tx.select().from(crews).where(eq(crews.id, input.crewId)).for('update');
        if (!row) throw new MoveFailed('UNKNOWN_CREW');
        crew = toCrew(row);
      }
      const ids = involved(input, crew);
      const states = await lockStates(tx, ids, now);
      const ownerRows = await tx.select().from(owners).where(inArray(owners.tokenId, ids));
      const ownerOf = new Map(ownerRows.map((r) => [r.tokenId, r.owner]));

      let newCrewId: string | null = null;
      if (input.action === 'crew.open') {
        const seq = rowsOf<{ n: number }>(
          await tx.execute(sql`select nextval(${sql.raw(`'${crewSeq.seqName}'`)})::int as n`),
        )[0];
        if (!seq) throw new Error('crew_seq returned no row');
        newCrewId = `${day}-${seq.n}`;
      }

      const played = playMove(
        ctx,
        {
          state: (id) => states.get(id) ?? newChogState(id, now),
          crew: (id) => (crew && crew.id === id ? crew : undefined),
          sameOwner: (a, b) => ownerOf.get(a) !== undefined && ownerOf.get(a) === ownerOf.get(b),
          nextCrewId: () => newCrewId ?? 'no-crew',
        },
        input,
      );
      if (!played.ok) throw new MoveFailed(played.error);
      const out = played.value;

      if (out.crew) {
        if (input.action === 'crew.open')
          await tx.insert(crews).values({ ...out.crew, createdAt: new Date(out.crew.createdAt) });
        else
          await tx
            .update(crews)
            .set({ slots: out.crew.slots, status: out.crew.status })
            .where(eq(crews.id, out.crew.id));
      }
      await saveStates(tx, out.states);
      const stored: StoredEvent[] = [];
      for (const e of out.events) {
        const [r] = await tx
          .insert(events)
          .values({ day, at: new Date(now), type: e.type, chogId: e.chogId, target: targetOf(e), data: e })
          .returning({ id: events.id });
        stored.push({ id: r!.id, at: now, event: e });
      }
      if (stored.length || out.crew) {
        const payload = JSON.stringify({
          e: stored.map((s) => ({ id: s.id, at: s.at, event: s.event })),
          c: out.crew?.id ?? null,
        });
        await tx.execute(
          sql`select pg_notify('city', ${payload.length < 7900 ? payload : JSON.stringify({ e: [], c: null, more: true })})`,
        );
      }
      return {
        ok: true as const,
        events: stored,
        states: out.states,
        ...(out.crew ? { crew: out.crew } : {}),
      };
    });
  } catch (e) {
    if (e instanceof MoveFailed) return { ok: false, error: e.code };
    throw e;
  }
}
