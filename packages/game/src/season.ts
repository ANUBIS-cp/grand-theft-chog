import type { GangId } from '@chog-city/data';

// Halloween's calendar (UTC), shared by the web app, the live server and the vault game, so they all agree on
// what's on. The money side of it (bonuses) is in packages/server/src/events.ts.
//
// - Halloween week, 27-31 Oct: Skulls and Radioactive take more (packages/server/src/events.ts) and the
//   Radioactive Zone opens (packages/server/src/config.ts).
// - Judging (26 Oct-8 Nov): the city turns every 20 minutes, the same for everyone. Ten minutes of the normal
//   city, then ten of Halloween under the Blood Moon: the haunting, pumpkins full of cash all over the streets,
//   every vault haunted and hauls paying more. Anyone who plays for a while sees both, whenever they come.
// - Outside judging, in Halloween week: the city is haunted all day and the Blood Moon rises 18:00-19:00 UTC.

export const HALLOWEEN_WEEK = { from: Date.UTC(2026, 9, 27), to: Date.UTC(2026, 10, 1) };
export const HALLOWEEN_NIGHT = { from: Date.UTC(2026, 9, 31), to: Date.UTC(2026, 10, 1) };
export const JUDGING = { from: Date.UTC(2026, 9, 26), to: Date.UTC(2026, 10, 8) };
/** During judging: one turn of the city, and how long the normal city lasts before the moon rises. */
export const CYCLE_MS = 20 * 60_000;
export const CALM_MS = 10 * 60_000;
export const BLOOD_MOON_HOUR = 18;
export const BLOOD_MOON_MS = 60 * 60_000;
export const SPOOKY_GANGS: readonly GangId[] = ['skulls', 'radioactive'];
/** While the Blood Moon is up, hauls pay this much more (percent). */
export const BLOOD_MOON_BONUS = 50;

const within = (t: number, w: { from: number; to: number }) => t >= w.from && t < w.to;
export const isHalloweenWeek = (t: number) => within(t, HALLOWEEN_WEEK);
export const isJudging = (t: number) => within(t, JUDGING);

type Moon = { from: number; to: number };

/** The judging cycle's moon in the turn of the city that `t` is in, if that turn is in judging. */
function moonOfCycle(t: number): Moon | null {
  const from = Math.floor(t / CYCLE_MS) * CYCLE_MS + CALM_MS;
  return isJudging(from) ? { from, to: from + CYCLE_MS - CALM_MS } : null;
}

/** The Blood Moon on the night of `t`'s UTC day, if that day is in Halloween week and not in judging. */
function moonOfDay(t: number): Moon | null {
  const day = Math.floor(t / 86_400_000) * 86_400_000;
  const from = day + BLOOD_MOON_HOUR * 3_600_000;
  return isHalloweenWeek(from) && !isJudging(from) ? { from, to: from + BLOOD_MOON_MS } : null;
}

/** The Blood Moon that is up at `t`, or null. */
export function bloodMoon(t: number): Moon | null {
  for (const m of [moonOfCycle(t), moonOfDay(t)]) if (m && within(t, m)) return m;
  return null;
}

/** The next Blood Moon that hasn't ended yet (the one up now counts), or null once they're all over. */
export function nextBloodMoon(t: number): Moon | null {
  // During judging the next one is in this turn of the city or the one after.
  for (const m of [moonOfCycle(t), moonOfCycle(t + CYCLE_MS)]) if (m && m.to > t) return m;
  for (let d = 0; d < 8; d++) {
    const m = moonOfDay(t + d * 86_400_000);
    if (m && m.to > t) return m;
  }
  return null;
}

/**
 * The city looks like Halloween (the haunting, pumpkins in the streets): all Halloween week, except during
 * judging, when it comes and goes with the Blood Moon.
 */
export const halloweenCity = (t: number) => (isJudging(t) ? bloodMoon(t) !== null : isHalloweenWeek(t));

/** A vault robbed at `t` is haunted: lights out and a phantom drifting through the walls. */
export const hauntedVault = (target: string, t: number) =>
  bloodMoon(t) !== null || (halloweenCity(t) && (SPOOKY_GANGS as readonly string[]).includes(target));
