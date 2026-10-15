import { DISTRICTS, DISTRICT_IDS, type DistrictId } from './districts.ts';
import { GANGS, GANG_IDS, type GangId } from './gangs.ts';
import { SKILLS, SKILL_IDS, type SkillId } from './skills.ts';
import type { Chog, TraitMatch, Traits } from './traits.ts';

export function hasTrait(traits: Traits, [type, value]: TraitMatch): boolean {
  return traits[type] === value;
}

/** The 10 Legendary 1:1s have no normal traits. Each counts as any one skill per job; they're the Legends. */
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
  /** Gangs it visibly belongs to (at least one): the owner picks when there's more than one. */
  born: GangId[];
  /** Kept for old callers: nobody can join just any gang any more. */
  anyGang: false;
}

export function gangOptions(chog: Chog): GangOptions {
  if (isOneOfOne(chog)) return { born: ['legends'], anyGang: false };
  const born = GANG_IDS.filter((id) => GANGS[id].from.some((m) => hasTrait(chog.traits, m)));
  const fallback = GANG_IDS.filter((id) => GANGS[id].fallback);
  return { born: born.length ? born : fallback, anyGang: false };
}

export function canJoinGang(chog: Chog, gang: GangId): boolean {
  const o = gangOptions(chog);
  return o.born.includes(gang);
}

/** Home district from the Background trait. 1:1s have no Background: every district is home. */
export function homeDistrict(chog: Chog): DistrictId | 'any' {
  const bg = chog.traits.Background;
  if (!bg) return 'any';
  const id = DISTRICT_IDS.find((d) => DISTRICTS[d].backgrounds.includes(bg));
  if (!id) throw new Error(`Background "${bg}" is not in any district`);
  return id;
}
