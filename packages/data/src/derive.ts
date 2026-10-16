import { DISTRICTS, DISTRICT_IDS, type DistrictId } from './districts.ts';
import { CHOGS } from './chogs.ts';
import { GANGS, GANG_IDS, GANG_LOOK, type GangId } from './gangs.ts';
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

/** Does this Chog visibly wear its gang's look (see GANG_LOOK)? */
export function looksLike(chog: Chog, gang: GangId): boolean {
  if (gang === 'legends') return isOneOfOne(chog);
  if (isOneOfOne(chog)) return false;
  return (GANG_LOOK[gang] ?? GANGS[gang].from).some((m) => hasTrait(chog.traits, m));
}

const faces = new Map<GangId, Chog[]>();

/**
 * Every Chog that visibly wears a gang's look, the clearest first: those that look like no other gang come
 * before those that also wear another gang's look (a durag and laser eyes). Used for guards, gang cards and the
 * board, so a gang's faces always show what the gang is.
 */
export function gangFaces(gang: GangId): Chog[] {
  let list = faces.get(gang);
  if (!list) {
    list = CHOGS.filter((c) => looksLike(c, gang))
      .map((c) => ({ c, k: clutter(c, gang) }))
      .sort((a, b) => a.k - b.k || a.c.id - b.c.id)
      .map((x) => x.c);
    faces.set(gang, list);
  }
  return list;
}

/**
 * How much else a Chog wears that draws the eye from its gang's look: another gang's look counts most, then
 * (for a gang known by its outfit) anything on its head.
 */
function clutter(c: Chog, gang: GangId): number {
  const others = GANG_IDS.filter((g) => g !== gang && g !== 'naked' && looksLike(c, g)).length;
  const byOutfit = (GANG_LOOK[gang] ?? GANGS[gang].from).every(([type]) => type !== 'Head');
  return others * 2 + (byOutfit && c.traits.Head ? 1 : 0);
}

/** `n` of a gang's clearest faces, spread through the clearest few (not just the lowest token IDs). */
export function pickFaces(gang: GangId, n: number, skip: number[] = []): number[] {
  if (n <= 0) return [];
  const all = gangFaces(gang).filter((c) => !skip.includes(c.id));
  if (!all.length) return [];
  const best = clutter(all[0]!, gang);
  const clean = all.filter((c) => clutter(c, gang) === best).length;
  const pool = all.slice(0, clean >= n ? clean : Math.min(all.length, n * 3));
  const out: number[] = [];
  for (let i = 0; out.length < n && i < pool.length * 2; i++) {
    const c = pool[Math.floor((i * pool.length) / Math.max(n, 1)) % pool.length]!;
    if (!out.includes(c.id)) out.push(c.id);
  }
  return out;
}

/** Home district from the Background trait. 1:1s have no Background: every district is home. */
export function homeDistrict(chog: Chog): DistrictId | 'any' {
  const bg = chog.traits.Background;
  if (!bg) return 'any';
  const id = DISTRICT_IDS.find((d) => DISTRICTS[d].backgrounds.includes(bg));
  if (!id) throw new Error(`Background "${bg}" is not in any district`);
  return id;
}
