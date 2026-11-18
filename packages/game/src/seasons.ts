// Seasons: Season 1 started on 18 Nov 2026 (the owner: "right away") and ends with November; after that a
// season is a calendar month (UTC). At the end of each one the season's titles go onto the winning Chogs for
// good, and the gang vaults start the new season fresh.

export const SEASON_1_START = Date.UTC(2026, 10, 18);

export interface Season {
  n: number;
  from: number;
  to: number;
}

/** The season that `t` falls in (null before Season 1). */
export function seasonOf(t: number): Season | null {
  if (t < SEASON_1_START) return null;
  const d = new Date(t);
  // Months since November 2026: November is Season 1, December Season 2, and so on.
  const n = (d.getUTCFullYear() - 2026) * 12 + d.getUTCMonth() - 10 + 1;
  const from = n === 1 ? SEASON_1_START : Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  const to = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  return { n, from, to };
}
