import type { SkillId } from '@chog-city/data';

// What a Chog can do in a heist comes from its traits (via its skills). Each power works once per run.

export const POWER_IDS = [
  'hide',
  'zap',
  'sprint',
  'distract',
  'hack',
  'tackle',
  'bribe',
  'magnet',
  'blink',
  'scare',
  'lockpick',
] as const;
export type PowerId = (typeof POWER_IDS)[number];

export interface PowerDef {
  id: PowerId;
  name: string;
  /** One short line, shown on the button. */
  does: string;
  /** Seconds the effect lasts (0 = instant). */
  lasts: number;
  /** Seconds before it can be used again. */
  cooldown: number;
  /** Works once per run. */
  once?: boolean;
  /** Works on its own for the whole run (no button). */
  passive?: boolean;
}

export const POWERS: Record<PowerId, PowerDef> = {
  hide: { id: 'hide', name: 'Hide', does: 'Lights can’t see you for 5 seconds.', lasts: 5, cooldown: 12 },
  zap: { id: 'zap', name: 'Laser eyes', does: 'Knocks out the nearest guard or camera you can see.', lasts: 6, cooldown: 10 },
  sprint: { id: 'sprint', name: 'Sprint', does: 'Run twice as fast for 4 seconds.', lasts: 4, cooldown: 10 },
  distract: { id: 'distract', name: 'Distract', does: 'Makes a noise ahead of you. Guards go and look.', lasts: 0, cooldown: 10 },
  hack: { id: 'hack', name: 'Hack', does: 'Cameras and lasers off for 10 seconds.', lasts: 10, cooldown: 20 },
  tackle: { id: 'tackle', name: 'Tackle', does: 'For 6 seconds, run into a guard to knock them out.', lasts: 6, cooldown: 12 },
  bribe: { id: 'bribe', name: 'Bribe', does: 'Calls off the alarm. Once a run.', lasts: 0, cooldown: 0, once: true },
  magnet: { id: 'magnet', name: 'Magnet', does: 'Pulls in cash from 2 tiles away for 6 seconds.', lasts: 6, cooldown: 12 },
  blink: { id: 'blink', name: 'Blink', does: 'Jumps up to 3 tiles ahead, through walls.', lasts: 0, cooldown: 8 },
  scare: { id: 'scare', name: 'Scare', does: 'Guards near you freeze for 4 seconds.', lasts: 4, cooldown: 12 },
  lockpick: { id: 'lockpick', name: 'Lockpick', does: 'Cracks safes four times faster.', lasts: 0, cooldown: 0, passive: true },
};

const FROM_SKILL: Record<SkillId, PowerId> = {
  stealth: 'hide',
  laser: 'zap',
  runner: 'sprint',
  clown: 'distract',
  tech: 'hack',
  muscle: 'tackle',
  blade: 'tackle',
  smooth: 'bribe',
  charm: 'bribe',
  royal: 'bribe',
  guard: 'hide',
  money: 'magnet',
  magic: 'blink',
  undead: 'scare',
  toxic: 'scare',
  jailbird: 'lockpick',
  worker: 'lockpick',
};

/** A Chog brings at most two button powers (the first two it has, in POWER_IDS order) plus any passive. */
export function powersFor(skills: readonly SkillId[]): PowerId[] {
  const have = new Set(skills.map((s) => FROM_SKILL[s]));
  const active = POWER_IDS.filter((p) => have.has(p) && !POWERS[p].passive).slice(0, 2);
  const passive = POWER_IDS.filter((p) => have.has(p) && POWERS[p].passive);
  const out = [...active, ...passive];
  return out.length ? out : ['sprint'];
}
