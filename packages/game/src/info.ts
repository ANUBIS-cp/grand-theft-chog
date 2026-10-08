import { homeDistrict, isOneOfOne, skillsOf, type Chog } from '@chog-city/data';
import type { ChogInfo } from './types.ts';

export function infoOf(chog: Chog): ChogInfo {
  const side = chog.traits.Side;
  return {
    id: chog.id,
    skills: skillsOf(chog),
    wildcard: isOneOfOne(chog),
    home: homeDistrict(chog),
    side: side === 'Left' || side === 'Right' ? side : null,
  };
}
