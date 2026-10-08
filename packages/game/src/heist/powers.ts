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
  /** One short line, shown on the button's long-press and on the Chog page. */
  does: string;
  /** Works on its own for the whole run (no button). */
  passive?: boolean;
}

export const POWERS: Record<PowerId, PowerDef> = {
  hide: { id: 'hide', name: 'Hide', does: 'Lights can’t see you for 3 seconds.' },
  zap: { id: 'zap', name: 'Laser eyes', does: 'Knocks out the first guard or camera in front of you.' },
  sprint: { id: 'sprint', name: 'Sprint', does: 'Run twice as fast for 3 seconds.' },
  distract: { id: 'distract', name: 'Distract', does: 'Makes a noise ahead of you. Nearby guards go and look.' },
  hack: { id: 'hack', name: 'Hack', does: 'Cameras and lasers switch off for 8 seconds.' },
  tackle: { id: 'tackle', name: 'Tackle', does: 'For 5 seconds, run into a guard to knock them out.' },
  bribe: { id: 'bribe', name: 'Bribe', does: 'Calls off the alarm once. Use it early and the first guard who sees you looks away.' },
  magnet: { id: 'magnet', name: 'Magnet', does: 'Pulls in cash from 2 tiles away for 5 seconds.' },
  blink: { id: 'blink', name: 'Blink', does: 'Jumps up to 3 tiles ahead, through walls.' },
  scare: { id: 'scare', name: 'Scare', does: 'Guards next to you freeze for 3 seconds.' },
  lockpick: { id: 'lockpick', name: 'Lockpick', does: 'Cracks safes four times faster.', passive: true },
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
