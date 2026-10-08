import { SKILLS, type DistrictId, type GangId } from '@chog-city/data';
import { canFill, infoOf, jobOdds, type Ctx, type Odds } from '@chog-city/game';
import { getChog } from '@chog-city/data';
import { formatLeft } from './time';
import type { Board } from './api';
import type { ChogView } from './views';

export type Offer = Board['offers'][number];

export interface JobCheck {
  /** Odds for this Chog, or null if it can't take the job at all. */
  odds: Odds | null;
  /** Why it can't do it right now, in plain words. */
  reason: string | null;
  /** It has the skills (it may still be blocked today: jail, moves, done). */
  fits: boolean;
}

export function ctxFor(board: Pick<Board, 'holders'>, now: number): Ctx {
  return { now, seed: '', holders: board.holders as Partial<Record<DistrictId, GangId>>, events: new Set() };
}

function skillList(names: string[]): string {
  return names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;
}

/** Can this Chog take this job, and at what odds? Uses the same rules as the server. */
export function checkJob(chog: ChogView, offer: Offer, ctx: Ctx): JobCheck {
  const info = infoOf(getChog(chog.id)!);
  const { job } = offer;
  const solo = job.slots.length === 1;
  const fitsSlot = solo ? canFill(info, job.slots[0]!) : job.slots.some((s) => canFill(info, s));
  if (!fitsSlot) {
    const slot = job.slots[0]!;
    const need = slot === 'any' ? 'any Chog' : skillList(slot.anyOf.map((k) => SKILLS[k].name));
    return {
      odds: null,
      reason: solo
        ? `Needs ${need}. Your Chog doesn't have it.`
        : 'Your Chog has none of the skills this crew needs.',
      fits: false,
    };
  }
  const odds = jobOdds(job, [{ info, state: chog.raw }], offer.district, ctx);
  if (chog.level < job.minLevel)
    return { odds, reason: `Needs level ${job.minLevel}. Your Chog is level ${chog.level}.`, fits: true };
  if (chog.jailUntil)
    return { odds, reason: `In jail for ${formatLeft(chog.jailUntil - ctx.now)}.`, fits: true };
  if (chog.doneToday.includes(offer.key))
    return { odds, reason: 'Done today. It comes back after 18:00 UTC.', fits: true };
  if (chog.movesLeft <= 0)
    return { odds, reason: 'No moves left today. They refill at 18:00 UTC.', fits: true };
  return { odds, reason: null, fits: true };
}
