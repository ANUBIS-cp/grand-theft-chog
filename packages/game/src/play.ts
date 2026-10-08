import { CHOGS, GANG_IDS, getChog } from '@chog-city/data';
import { arrest, chooseGang, doSoloJob, payBail, rob } from './actions.ts';
import { joinCrew, leaveCrew, openCrew, refundCancelled, resolveCrew, type Crew } from './crew.ts';
import { infoOf } from './info.ts';
import {
  fail,
  ok,
  type ChogInfo,
  type ChogState,
  type Ctx,
  type GameError,
  type GameEvent,
  type MoveInput,
  type Result,
} from './types.ts';

/**
 * Everything a move needs from the outside world. The server backs this with locked database rows;
 * the practice city backs it with an in-memory copy. Both then run exactly the same rules.
 */
export interface World {
  /** Current state of a Chog (a fresh one if it has never played). */
  state(id: number): ChogState;
  crew(id: string): Crew | undefined;
  sameOwner(a: number, b: number): boolean;
  /** A new public crew ID ("<day>-<n>"). */
  nextCrewId(): string;
}

export interface Played {
  states: ChogState[];
  events: GameEvent[];
  crew?: Crew;
}

const infoCache = new Map<number, ChogInfo>();
export function chogInfo(id: number): ChogInfo {
  let i = infoCache.get(id);
  if (!i) {
    i = infoOf(CHOGS[id - 1]!);
    infoCache.set(id, i);
  }
  return i;
}

const isId = (n: unknown): n is number =>
  Number.isInteger(n) && (n as number) >= 1 && (n as number) <= CHOGS.length;

/** The Chogs a move touches, so a caller can lock them (in ID order) before playing it. */
export function involved(input: MoveInput, crew?: Crew): number[] {
  switch (input.action) {
    case 'job':
    case 'gang':
      return [input.chogId];
    case 'rob':
    case 'arrest':
    case 'bail':
      return [input.chogId, input.target];
    case 'crew.open':
      return input.jailbreakTarget ? [input.chogId, input.jailbreakTarget] : [input.chogId];
    case 'crew.join':
    case 'crew.leave':
      return [
        input.chogId,
        ...(crew?.slots.filter((x): x is number => x !== null) ?? []),
        ...(crew?.jailbreakTarget ? [crew.jailbreakTarget] : []),
      ];
  }
}

/** Plays one move. Ownership ("may this player move this Chog") is checked by the caller. */
export function playMove(ctx: Ctx, world: World, input: MoveInput): Result<Played> {
  if (!isId(input.chogId)) return fail('BAD_TARGET');
  if ('target' in input && !isId(input.target)) return fail('BAD_TARGET');
  const me = world.state(input.chogId);
  const info = chogInfo(input.chogId);
  const unwrap = <T>(r: Result<T>): T | GameError => (r.ok ? r.value : r.error);

  switch (input.action) {
    case 'job': {
      const r = unwrap(doSoloJob(ctx, info, me, input.offerKey));
      return typeof r === 'string' ? fail(r) : ok({ states: [r.state], events: r.events });
    }
    case 'rob':
    case 'arrest': {
      const fn = input.action === 'rob' ? rob : arrest;
      const r = unwrap(
        fn(ctx, info, me, chogInfo(input.target), world.state(input.target), {
          sameOwner: world.sameOwner(input.chogId, input.target),
        }),
      );
      return typeof r === 'string' ? fail(r) : ok({ states: [r.attacker, r.target], events: r.events });
    }
    case 'bail': {
      const r = unwrap(payBail(ctx, me, world.state(input.target)));
      if (typeof r === 'string') return fail(r);
      return ok({
        states: input.chogId === input.target ? [r.target] : [r.payer, r.target],
        events: r.events,
      });
    }
    case 'gang': {
      if (!GANG_IDS.includes(input.gang)) return fail('GANG_NOT_ALLOWED');
      const r = unwrap(chooseGang(ctx, getChog(input.chogId)!, me, input.gang));
      return typeof r === 'string' ? fail(r) : ok({ states: [r.state], events: r.events });
    }
    case 'crew.open': {
      if (input.jailbreakTarget !== undefined && !isId(input.jailbreakTarget)) return fail('BAD_TARGET');
      const jb = input.jailbreakTarget ? { target: world.state(input.jailbreakTarget) } : undefined;
      const r = unwrap(openCrew(ctx, world.nextCrewId(), info, me, input.offerKey, input.slot, jb));
      return typeof r === 'string' ? fail(r) : ok({ states: [r.state], events: [], crew: r.crew });
    }
    case 'crew.leave': {
      const crew = world.crew(input.crewId);
      if (!crew) return fail('CREW_NOT_OPEN');
      const r = unwrap(leaveCrew(ctx, crew, me));
      if (typeof r === 'string') return fail(r);
      const states = [r.state];
      if (r.crew.status === 'cancelled')
        for (const id of crew.slots)
          if (id !== null && id !== input.chogId) states.push(refundCancelled(ctx, crew, world.state(id)));
      return ok({ states, events: [], crew: r.crew });
    }
    case 'crew.join': {
      const crew = world.crew(input.crewId);
      if (!crew) return fail('CREW_NOT_OPEN');
      const r = unwrap(joinCrew(ctx, crew, info, me, input.slot));
      if (typeof r === 'string') return fail(r);
      if (!r.full) return ok({ states: [r.state], events: [], crew: r.crew });
      const members = r.crew.slots.map((id) => ({
        info: chogInfo(id!),
        state: id === input.chogId ? r.state : world.state(id!),
      }));
      const target = crew.jailbreakTarget ? world.state(crew.jailbreakTarget) : undefined;
      const res = unwrap(resolveCrew(ctx, r.crew, members, target));
      if (typeof res === 'string') return fail(res);
      return ok({
        states: [...res.members, ...(res.freed ? [res.freed] : [])],
        events: res.events,
        crew: res.crew,
      });
    }
  }
}
