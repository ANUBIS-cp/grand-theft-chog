import type { GangId } from '@chog-city/data';

// Halloween's calendar (UTC), shared by the web app, the live server and the vault game, so they all agree on
// what's on. The money side of it (bonuses) is in packages/server/src/events.ts.
//
// - Halloween week, 27-31 Oct: the city is haunted, and Skulls' and Radioactive's vaults are haunted vaults.
// - Blood Moon, 18:00-19:00 every night of that week (the daily reset): every vault is haunted, pumpkins full of
//   cash appear all over the city, and hauls pay more. One hour at a set time, so players are in the city
//   together: that's when live raids and races for pumpkins happen.

export const HALLOWEEN_WEEK = { from: Date.UTC(2026, 9, 27), to: Date.UTC(2026, 10, 1) };
export const HALLOWEEN_NIGHT = { from: Date.UTC(2026, 9, 31), to: Date.UTC(2026, 10, 1) };
export const BLOOD_MOON_HOUR = 18;
export const BLOOD_MOON_MS = 60 * 60_000;
export const SPOOKY_GANGS: readonly GangId[] = ['skulls', 'radioactive'];
/** While the Blood Moon is up, hauls pay this much more (percent). */
export const BLOOD_MOON_BONUS = 50;

const within = (t: number, w: { from: number; to: number }) => t >= w.from && t < w.to;
export const isHalloweenWeek = (t: number) => within(t, HALLOWEEN_WEEK);

/** The Blood Moon on the night of `t`'s UTC day, if that day is in Halloween week. */
function moonOfDay(t: number): { from: number; to: number } | null {
  const day = Math.floor(t / 86_400_000) * 86_400_000;
  const from = day + BLOOD_MOON_HOUR * 3_600_000;
  return isHalloweenWeek(from) ? { from, to: from + BLOOD_MOON_MS } : null;
}

/** The Blood Moon that is up at `t`, or null. */
export function bloodMoon(t: number): { from: number; to: number } | null {
  const m = moonOfDay(t);
  return m && within(t, m) ? m : null;
}

/** The next Blood Moon that hasn't ended yet (the one up now counts), or null once they're all over. */
export function nextBloodMoon(t: number): { from: number; to: number } | null {
  for (let d = 0; d < 8; d++) {
    const m = moonOfDay(t + d * 86_400_000);
    if (m && m.to > t) return m;
  }
  return null;
}

/** A vault robbed at `t` is haunted: lights out and a phantom drifting through the walls. */
export const hauntedVault = (target: string, t: number) =>
  bloodMoon(t) !== null || (isHalloweenWeek(t) && (SPOOKY_GANGS as readonly string[]).includes(target));
