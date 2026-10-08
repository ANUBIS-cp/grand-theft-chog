import { DISTRICT_IDS, type DistrictId, type GangId } from '@chog-city/data';
import { TURF_TOP_CHOGS_COUNTED } from './constants.ts';
import type { GameEvent } from './types.ts';

export type Scores = Partial<Record<DistrictId, Partial<Record<GangId, number>>>>;

/**
 * Turf scores for one game day. Only each gang's best 15 Chogs in a district count,
 * so a big gang can't win on headcount alone.
 */
export function turfScores(events: readonly GameEvent[]): Scores {
  const perChog = new Map<string, number>(); // "district|gang|chog" -> points
  for (const e of events) {
    if (e.type !== 'job' || !e.gang || e.turf <= 0) continue;
    const k = `${e.district}|${e.gang}|${e.chogId}`;
    perChog.set(k, (perChog.get(k) ?? 0) + e.turf);
  }
  const groups = new Map<string, number[]>(); // "district|gang" -> chog totals
  for (const [k, pts] of perChog) {
    const g = k.slice(0, k.lastIndexOf('|'));
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(pts);
  }
  const scores: Scores = {};
  for (const [g, list] of groups) {
    const [district, gang] = g.split('|') as [DistrictId, GangId];
    const top = list.sort((a, b) => b - a).slice(0, TURF_TOP_CHOGS_COUNTED);
    (scores[district] ??= {})[gang] = top.reduce((a, b) => a + b, 0);
  }
  return scores;
}

export interface TurfChange {
  district: DistrictId;
  from: GangId | null;
  to: GangId | null;
  score: number;
}

/** The nightly flip: each district goes to the top gang. Ties and empty districts stay with the holder. */
export function flipTurf(
  holders: Partial<Record<DistrictId, GangId>>,
  scores: Scores,
): { holders: Partial<Record<DistrictId, GangId>>; changes: TurfChange[] } {
  const next = { ...holders };
  const changes: TurfChange[] = [];
  for (const d of DISTRICT_IDS) {
    const entries = Object.entries(scores[d] ?? {}) as [GangId, number][];
    if (!entries.length) continue;
    entries.sort((a, b) => b[1] - a[1]);
    const [topGang, topScore] = entries[0]!;
    const tied = entries.filter(([, s]) => s === topScore);
    const current = holders[d] ?? null;
    if (tied.length > 1) continue; // a tie changes nothing: the holder (or nobody) keeps it
    if (topGang !== current) {
      next[d] = topGang;
      changes.push({ district: d, from: current, to: topGang, score: topScore });
    }
  }
  return { holders: next, changes };
}
