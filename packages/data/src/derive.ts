import { DISTRICTS, DISTRICT_IDS, type DistrictId } from './districts.ts';
import { GANGS, GANG_IDS, type GangId } from './gangs.ts';
import { SKILLS, SKILL_IDS, type SkillId } from './skills.ts';
import type { Chog, TraitMatch, Traits } from './traits.ts';

export function hasTrait(traits: Traits, [type, value]: TraitMatch): boolean {
  return traits[type] === value;
}

/** The 10 Legendary 1:1s have no normal traits. Each counts as any one skill per job and can join any gang. */
export function isOneOfOne(chog: Chog): boolean {
  return chog.traits.Base === '1:1';
}

export function skillsOf(chog: Chog): SkillId[] {
  return SKILL_IDS.filter((id) => SKILLS[id].from.some((m) => hasTrait(chog.traits, m)));
}

/** Which traits gave this Chog a skill, for the "why" line on its card. */
export function skillSources(chog: Chog, skill: SkillId): TraitMatch[] {
  return SKILLS[skill].from.filter((m) => hasTrait(chog.traits, m));
}

export interface GangOptions {
  /** Gangs its traits put it in. */
  born: GangId[];
  /** No gang trait (or a 1:1): it can join any gang. */
  anyGang: boolean;
}

export function gangOptions(chog: Chog): GangOptions {
  const born = GANG_IDS.filter((id) => GANGS[id].from.some((m) => hasTrait(chog.traits, m)));
  return { born, anyGang: born.length === 0 || isOneOfOne(chog) };
}

export function canJoinGang(chog: Chog, gang: GangId): boolean {
  const o = gangOptions(chog);
  return o.anyGang || o.born.includes(gang);
}

/** Home district from the Background trait. 1:1s have no Background: every district is home. */
export function homeDistrict(chog: Chog): DistrictId | 'any' {
  const bg = chog.traits.Background;
  if (!bg) return 'any';
  const id = DISTRICT_IDS.find((d) => DISTRICTS[d].backgrounds.includes(bg));
  if (!id) throw new Error(`Background "${bg}" is not in any district`);
  return id;
}
