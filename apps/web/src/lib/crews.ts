import { getChog } from '@chog-city/data';
import { canFill, infoOf, type Crew, type JobTemplate } from '@chog-city/game';
import type { Board } from './api';
import type { ChogView } from './views';

export function offerFor(board: Board, crew: Crew) {
  return board.offers.find((o) => o.key === crew.offerKey) ?? null;
}

/** Slot numbers this Chog could take in a job (all slots, filled or not). */
export function fittingSlots(chog: ChogView, job: JobTemplate): number[] {
  const info = infoOf(getChog(chog.id)!);
  return job.slots.flatMap((s, i) => (canFill(info, s) ? [i] : []));
}

/** Open slots in a crew this Chog could take right now (ignoring moves and jail). */
export function openSlotsFor(chog: ChogView, crew: Crew, job: JobTemplate): number[] {
  if (crew.slots.includes(chog.id) || crew.jailbreakTarget === chog.id) return [];
  return fittingSlots(chog, job).filter((i) => crew.slots[i] === null);
}

export function crewLink(id: string): string {
  return typeof window === 'undefined' ? `/crew/${id}` : `${window.location.origin}/crew/${id}`;
}
