import { CHOGS, GANG_IDS, getChog, type GangId } from '@chog-city/data';
import {
  arrest,
  chooseGang,
  dayOf,
  doSoloJob,
  infoOf,
  joinCrew,
  leaveCrew,
  openCrew,
  payBail,
  refundCancelled,
  resolveCrew,
  rob,
  type ChogInfo,
  type ChogState,
  type Crew,
  type Ctx,
  type GameError,
  type GameEvent,
} from '@chog-city/game';
import { eq, sql } from 'drizzle-orm';
import { activeEvents } from './config.ts';
import { ensureDay } from './days.ts';
import { crewSeq, crews, events, rowsOf, type Db } from './db/index.ts';
import { canControl, sameOwner } from './ownership.ts';
import { isChogId, lockStates, saveStates } from './states.ts';

export type MoveInput =
  | { action: 'job'; chogId: number; offerKey: string }
  | { action: 'rob'; chogId: number; target: number }
  | { action: 'arrest'; chogId: number; target: number }
  | { action: 'bail'; chogId: number; target: number }
  | { action: 'gang'; chogId: number; gang: GangId }
  | { action: 'crew.open'; chogId: number; offerKey: string; slot: number; jailbreakTarget?: number }
  | { action: 'crew.join'; chogId: number; crewId: string; slot: number }
  | { action: 'crew.leave'; chogId: number; crewId: string };

export type MoveError = GameError | 'NOT_YOUR_CHOG' | 'UNKNOWN_CHOG' | 'UNKNOWN_CREW';

export interface StoredEvent {
  id: number;
  at: number;
  event: GameEvent;
}

export type MoveResult =
  { ok: true; events: StoredEvent[]; states: ChogState[]; crew?: Crew } | { ok: false; error: MoveError };

const infoCache = new Map<number, ChogInfo>();
export function info(id: number): ChogInfo {
  let i = infoCache.get(id);
  if (!i) {
    i = infoOf(CHOGS[id - 1]!);
    infoCache.set(id, i);
  }
  return i;
}

class MoveFailed extends Error {
  constructor(readonly code: MoveError) {
    super(code);
  }
}
const need = <T>(r: { ok: true; value: T } | { ok: false; error: GameError }): T => {
  if (!r.ok) throw new MoveFailed(r.error);
  return r.value;
};

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

/**
 * Plays one move for a logged-in wallet. Everything happens in one transaction with the involved Chogs
 * locked, and the resulting events are stored and announced on the live feed when it commits.
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
  const owned = 'target' in input ? await sameOwner(db, input.chogId, input.target) : false;

  try {
    return await db.transaction(async (tx) => {
      const out: { states: ChogState[]; events: GameEvent[]; crew?: Crew } = { states: [], events: [] };

      switch (input.action) {
        case 'job': {
          const st = await lockStates(tx, [input.chogId], now);
          const r = need(doSoloJob(ctx, info(input.chogId), st.get(input.chogId)!, input.offerKey));
          out.states.push(r.state);
          out.events.push(...r.events);
          break;
        }
        case 'rob':
        case 'arrest': {
          const st = await lockStates(tx, [input.chogId, input.target], now);
          const fn = input.action === 'rob' ? rob : arrest;
          const r = need(
            fn(ctx, info(input.chogId), st.get(input.chogId)!, info(input.target), st.get(input.target)!, {
              sameOwner: owned,
            }),
          );
          out.states.push(r.attacker, r.target);
          out.events.push(...r.events);
          break;
        }
        case 'bail': {
          const st = await lockStates(tx, [input.chogId, input.target], now);
          const r = need(payBail(ctx, st.get(input.chogId)!, st.get(input.target)!));
          out.states.push(...(input.chogId === input.target ? [r.target] : [r.payer, r.target]));
          out.events.push(...r.events);
          break;
        }
        case 'gang': {
          const st = await lockStates(tx, [input.chogId], now);
          const r = need(chooseGang(ctx, getChog(input.chogId)!, st.get(input.chogId)!, input.gang));
          out.states.push(r.state);
          out.events.push(...r.events);
          break;
        }
        case 'crew.open': {
          const ids = input.jailbreakTarget ? [input.chogId, input.jailbreakTarget] : [input.chogId];
          if (input.jailbreakTarget !== undefined && !isChogId(input.jailbreakTarget))
            throw new MoveFailed('BAD_TARGET');
          const st = await lockStates(tx, ids, now);
          const [{ n }] = rowsOf<{ n: number }>(
            await tx.execute(sql`select nextval(${sql.raw(`'${crewSeq.seqName}'`)})::int as n`),
          );
          const crewId = `${day}-${n}`;
          const jb = input.jailbreakTarget ? { target: st.get(input.jailbreakTarget)! } : undefined;
          const r = need(
            openCrew(ctx, crewId, info(input.chogId), st.get(input.chogId)!, input.offerKey, input.slot, jb),
          );
          await tx.insert(crews).values({ ...r.crew, createdAt: new Date(r.crew.createdAt) });
          out.states.push(r.state);
          out.crew = r.crew;
          break;
        }
        case 'crew.join':
        case 'crew.leave': {
          const [row] = await tx.select().from(crews).where(eq(crews.id, input.crewId)).for('update');
          if (!row) throw new MoveFailed('UNKNOWN_CREW');
          const crew = toCrew(row);
          const memberIds = crew.slots.filter((x): x is number => x !== null);
          const ids = [...memberIds, input.chogId, ...(crew.jailbreakTarget ? [crew.jailbreakTarget] : [])];
          const st = await lockStates(tx, ids, now);
          if (input.action === 'crew.leave') {
            const r = need(leaveCrew(ctx, crew, st.get(input.chogId)!));
            out.states.push(r.state);
            if (r.crew.status === 'cancelled')
              for (const id of memberIds)
                if (id !== input.chogId) out.states.push(refundCancelled(ctx, crew, st.get(id)!));
            out.crew = r.crew;
          } else {
            const r = need(joinCrew(ctx, crew, info(input.chogId), st.get(input.chogId)!, input.slot));
            st.set(input.chogId, r.state);
            out.crew = r.crew;
            if (r.full) {
              const members = r.crew.slots.map((id) => ({ info: info(id!), state: st.get(id!)! }));
              const jbTarget = crew.jailbreakTarget ? st.get(crew.jailbreakTarget) : undefined;
              const res = need(resolveCrew(ctx, r.crew, members, jbTarget));
              out.states.push(...res.members);
              if (res.freed) out.states.push(res.freed);
              out.events.push(...res.events);
              out.crew = res.crew;
            } else out.states.push(r.state);
          }
          await tx
            .update(crews)
            .set({ slots: out.crew!.slots, status: out.crew!.status })
            .where(eq(crews.id, crew.id));
          break;
        }
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
          e: stored.map((s) => ({ id: s.id, ...s.event, rollLabel: undefined })),
          c: out.crew?.id ?? null,
        });
        if (payload.length < 7900) await tx.execute(sql`select pg_notify('city', ${payload})`);
        else await tx.execute(sql`select pg_notify('city', ${JSON.stringify({ more: true })})`);
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
