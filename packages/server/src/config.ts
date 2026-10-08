import type { Ctx } from '@chog-city/game';

/** Halloween week: the Radioactive Zone opens and the Halloween jobs go on the board. */
export const HALLOWEEN = { from: Date.UTC(2026, 9, 27, 0, 0, 0), to: Date.UTC(2026, 10, 1, 0, 0, 0) };

export function activeEvents(now: number): Ctx['events'] {
  const s = new Set<'halloween'>();
  if (now >= HALLOWEEN.from && now < HALLOWEEN.to) s.add('halloween');
  return s;
}
