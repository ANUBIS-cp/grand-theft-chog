import { DAY, HOUR, RESET_HOUR_UTC } from './constants.ts';

const RESET_OFFSET = RESET_HOUR_UTC * HOUR;

/** Game day number. A game day runs from one 18:00 UTC reset to the next. */
export function dayOf(ms: number): number {
  return Math.floor((ms - RESET_OFFSET) / DAY);
}

export function dayStart(day: number): number {
  return day * DAY + RESET_OFFSET;
}

/** Time of the next reset after `ms`. */
export function nextReset(ms: number): number {
  return dayStart(dayOf(ms) + 1);
}
