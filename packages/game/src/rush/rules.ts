import { GANG_IDS, type GangId } from '@chog-city/data';
import { SAFE_BY_TIER } from '../heist/level.ts';
import { RUSH_JAIL, RUSH_MAPS, buildMap, rushMapDef, type RushMap } from './map.ts';
import type { RushRules } from './sim.ts';

/** Which maze a gang's vault is. Fixed per gang. */
export const rushMapFor = (gang: GangId) => RUSH_MAPS[GANG_IDS.indexOf(gang) % RUSH_MAPS.length]!;

/** The rules for a vault at a defence level (0-3): more and faster guards, a fuller safe. */
export function rushRules(tier: number, breakout = false, loud = false): RushRules {
  const t = Math.max(0, Math.min(3, tier));
  return {
    guards: t >= 2 ? 4 : 3,
    safeValue: breakout ? 1 : SAFE_BY_TIER[t]!,
    hunt: [0, 0.15, 0.3, 0.5][t]!,
    needSafe: breakout,
    ...(loud ? { loud: true } : {}),
  };
}

const built = new Map<string, RushMap>();
/** The built maze for a map id (cached: maps never change). */
export function rushMap(id: string): RushMap | null {
  const have = built.get(id);
  if (have) return have;
  const def = rushMapDef(id);
  if (!def) return null;
  const m = buildMap(def);
  built.set(id, m);
  return m;
}

export const RUSH_JAIL_ID = RUSH_JAIL.id;
