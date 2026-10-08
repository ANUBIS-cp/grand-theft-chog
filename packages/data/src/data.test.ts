import { describe, expect, it } from 'vitest';
import {
  CHOGS,
  DISTRICT_IDS,
  GANGS,
  GANG_IDS,
  SKILLS,
  SKILL_IDS,
  TRAIT_TYPES,
  displayName,
  gangOptions,
  getChog,
  homeDistrict,
  isOneOfOne,
  metadataIdFor,
  skillsOf,
} from './index.ts';

const valuesInCollection = new Map<string, Set<string>>();
for (const c of CHOGS)
  for (const [t, v] of Object.entries(c.traits)) {
    if (!valuesInCollection.has(t)) valuesInCollection.set(t, new Set());
    valuesInCollection.get(t)!.add(v!);
  }
const count = (pred: (c: (typeof CHOGS)[number]) => boolean) => CHOGS.filter(pred).length;

describe('collection data', () => {
  it('has every token 1..1969 in order', () => {
    expect(CHOGS).toHaveLength(1969);
    CHOGS.forEach((c, i) => expect(c.id).toBe(i + 1));
  });

  it('maps token IDs to metadata like the contract (pairs checked at the reveal)', () => {
    const pairs: [number, number][] = [
      [1061, 553],
      [1062, 554],
      [1513, 1005],
      [1863, 1355],
      [1864, 1356],
    ];
    for (const [token, meta] of pairs) expect(metadataIdFor(token)).toBe(meta);
    expect(getChog(1061)?.traits.Tier).toBe('Common');
    expect(getChog(1062)?.traits.Tier).toBe('Uncommon');
  });

  it('uses only known trait types', () => {
    for (const t of valuesInCollection.keys()) expect(TRAIT_TYPES).toContain(t);
  });

  it('has the tier counts from the reveal', () => {
    const tiers = { Common: 1279, Uncommon: 590, Rare: 60, Epic: 30, Legendary: 10 };
    for (const [tier, n] of Object.entries(tiers)) expect(count((c) => c.traits.Tier === tier)).toBe(n);
  });

  it('names the ten 1:1s', () => {
    const ones = CHOGS.filter(isOneOfOne);
    expect(ones).toHaveLength(10);
    expect(ones.map(displayName)).toContain('Blaze');
    expect(displayName(getChog(1061)!)).toBe('Chog #553');
  });
});

describe('skill and gang tables', () => {
  it('only reference trait values that exist (catches typos)', () => {
    for (const def of [...Object.values(SKILLS), ...Object.values(GANGS)])
      for (const [t, v] of def.from)
        expect(valuesInCollection.get(t)?.has(v), `${def.name}: ${t} ${v}`).toBe(true);
  });

  it('give every normal Chog at least one skill', () => {
    const missing = CHOGS.filter((c) => !isOneOfOne(c) && skillsOf(c).length === 0).map((c) => c.id);
    expect(missing).toEqual([]);
  });

  it('give every Chog a gang it can join', () => {
    for (const c of CHOGS) {
      const o = gangOptions(c);
      expect(o.anyGang || o.born.length > 0).toBe(true);
    }
  });

  it('match the counts in the plan (Appendix A/B)', () => {
    const skillCount = (s: (typeof SKILL_IDS)[number]) => count((c) => skillsOf(c).includes(s));
    expect(skillCount('laser')).toBe(278);
    expect(skillCount('blade')).toBe(18);
    expect(skillCount('guard')).toBe(48);
    const gangCount = (g: (typeof GANG_IDS)[number]) => count((c) => gangOptions(c).born.includes(g));
    expect(gangCount('mcga')).toBe(56);
    expect(gangCount('lazoor')).toBe(278);
    expect(gangCount('gangstas')).toBe(115);
    expect(gangCount('robbers')).toBe(44);
    expect(count((c) => !isOneOfOne(c) && gangOptions(c).born.length === 0)).toBe(456);
  });

  it('put every Chog in a home district', () => {
    for (const c of CHOGS) {
      const d = homeDistrict(c);
      expect(d === 'any' ? isOneOfOne(c) : DISTRICT_IDS.includes(d)).toBe(true);
    }
  });
});
