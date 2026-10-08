import { CHOGS, type Chog, type SkillId } from '@chog-city/data';
import { roll } from './dice.ts';
import { infoOf } from './info.ts';
import { newChogState } from './state.ts';
import { dayStart } from './time.ts';
import type { ChogInfo, ChogState, Ctx } from './types.ts';

/** A fixed moment: 2 hours into game day 20,400. */
export const T0 = dayStart(20_400) + 2 * 3_600_000;

export function ctxAt(now = T0, seed = '00'.repeat(32), extra: Partial<Ctx> = {}): Ctx {
  return { now, seed, holders: {}, events: new Set(), ...extra };
}

export function chogWith(skill: SkillId, not: SkillId[] = []): Chog {
  const c = CHOGS.find((x) => {
    const i = infoOf(x);
    return !i.wildcard && i.skills.includes(skill) && not.every((n) => !i.skills.includes(n));
  });
  if (!c) throw new Error(`no Chog with ${skill}`);
  return c;
}

export function chogWithout(skills: SkillId[]): Chog {
  const c = CHOGS.find((x) => {
    const i = infoOf(x);
    return !i.wildcard && skills.every((n) => !i.skills.includes(n));
  });
  if (!c) throw new Error('none');
  return c;
}

export function player(chog: Chog, now = T0): { info: ChogInfo; state: ChogState } {
  return { info: infoOf(chog), state: { ...newChogState(chog.id, now), active: true } };
}

/** Finds a day seed whose roll for `label` satisfies `pred`, so tests can force a win or a loss. */
export function seedWhere(
  label: string,
  pred: (r: number) => boolean,
  extraLabel?: { label: string; pred: (r: number) => boolean },
): string {
  for (let i = 0; i < 100_000; i++) {
    const seed = i.toString(16).padStart(64, '0');
    if (pred(roll(seed, label)) && (!extraLabel || extraLabel.pred(roll(seed, extraLabel.label))))
      return seed;
  }
  throw new Error('no seed found');
}
