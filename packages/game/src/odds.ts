import { DISTRICTS, SKILLS, type DistrictId } from '@chog-city/data';
import {
  HELD_DISTRICT_BONUS,
  HELPFUL_SKILL_BONUS,
  HELPFUL_SKILL_MAX,
  HOME_DISTRICT_BONUS,
  LEVEL_BONUS_PER_LEVEL,
  ODDS_MAX,
  ODDS_MIN,
  ROB,
  ARREST,
  WANTED_PENALTY_PER_STAR,
} from './constants.ts';
import type { JobTemplate, Slot } from './jobs.ts';
import { currentWanted, levelOf } from './state.ts';
import type { ChogInfo, ChogState, Ctx, Odds, OddsPart } from './types.ts';

export const clampOdds = (n: number) => Math.min(ODDS_MAX, Math.max(ODDS_MIN, n));

function total(parts: OddsPart[]): Odds {
  return { odds: clampOdds(parts.reduce((sum, p) => sum + p.pct, 0)), parts };
}

export function canFill(info: ChogInfo, slot: Slot): boolean {
  return slot === 'any' || info.wildcard || slot.anyOf.some((k) => info.skills.includes(k));
}

export interface Member {
  info: ChogInfo;
  state: ChogState;
}

/**
 * Odds for a job done by these Chogs (one for solo jobs). The first member is the leader.
 * Every part is shown to the player, so labels are plain words.
 */
export function jobOdds(job: JobTemplate, crew: Member[], district: DistrictId, ctx: Ctx): Odds {
  const parts: OddsPart[] = [{ label: 'Base', pct: job.baseOdds }];

  const helpful = job.helps.filter((k) => crew.some((m) => m.info.skills.includes(k)));
  if (helpful.length)
    parts.push({
      label: `Helpful skills: ${helpful.map((k) => SKILLS[k].name).join(', ')}`,
      pct: Math.min(HELPFUL_SKILL_MAX, helpful.length * HELPFUL_SKILL_BONUS),
    });

  const avgLevel = Math.floor(crew.reduce((sum, m) => sum + levelOf(m.state.xp), 0) / crew.length);
  if (avgLevel > 0)
    parts.push({
      label: crew.length > 1 ? `Crew level ${avgLevel}` : `Level ${avgLevel}`,
      pct: avgLevel * LEVEL_BONUS_PER_LEVEL,
    });

  if (crew.some((m) => m.info.home === district || m.info.home === 'any'))
    parts.push({ label: 'Home district', pct: HOME_DISTRICT_BONUS });

  const leaderGang = crew[0]?.state.gang;
  if (leaderGang && ctx.holders[district] === leaderGang)
    parts.push({ label: `Your gang holds ${DISTRICTS[district].name}`, pct: HELD_DISTRICT_BONUS });

  const stars = Math.max(...crew.map((m) => currentWanted(m.state, ctx.now)));
  if (stars > 0) parts.push({ label: `Wanted stars: ${stars}`, pct: -stars * WANTED_PENALTY_PER_STAR });

  return total(parts);
}

export function robOdds(attacker: ChogInfo, target: ChogInfo, revenge: boolean): Odds {
  const parts: OddsPart[] = [{ label: 'Base', pct: ROB.baseOdds }];
  const has = (i: ChogInfo, k: keyof typeof ROB.attack | keyof typeof ROB.defend) =>
    i.wildcard || i.skills.includes(k);
  for (const [k, pct] of Object.entries(ROB.attack) as [keyof typeof ROB.attack, number][])
    if (has(attacker, k)) parts.push({ label: `Your ${SKILLS[k].name}`, pct });
  for (const [k, pct] of Object.entries(ROB.defend) as [keyof typeof ROB.defend, number][])
    if (has(target, k)) parts.push({ label: `Their ${SKILLS[k].name}`, pct: -pct });
  if (revenge) parts.push({ label: 'Revenge', pct: ROB.revengeBonus });
  return total(parts);
}

export function arrestOdds(guard: ChogState): Odds {
  const level = levelOf(guard.xp);
  return total([
    { label: 'Base', pct: ARREST.baseOdds },
    { label: `Level ${level}`, pct: level * LEVEL_BONUS_PER_LEVEL },
  ]);
}
