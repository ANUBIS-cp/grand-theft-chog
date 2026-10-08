import { GANG_IDS, type GangId } from '@chog-city/data';
import { TPS, buildLevel, tierFor, type Dir, type Level, type VaultDef } from './level.ts';
import { ALARM, replay, type HeistState, type Input } from './sim.ts';
import type { PowerId } from './powers.ts';
import { VAULTS } from './vaults.ts';

// The gang war around the heist: every gang has a vault with real cash in it. Escaping moves what you
// took from their vault to yours; getting caught costs your gang a fine paid to theirs, and jail time.

export const START_CASH = 10_000;
export const JAIL_MS = 30 * 60_000;
/** Hitting a gang that robbed yours in the last day pays this much more. */
export const REVENGE_PERCENT = 25;
export const REVENGE_MS = 24 * 3_600_000;
/** A run must be finished within this long of starting. */
export const RUN_MAX_MS = 15 * 60_000;
/** The jail's defence level for break-outs. */
export const JAIL_TIER = 1;

/** Which layout a gang's vault uses. Fixed per gang so each vault has its own character. */
export function vaultFor(gang: GangId): VaultDef {
  return VAULTS[GANG_IDS.indexOf(gang) % VAULTS.length]!;
}

/** What it costs, out of the gang's own vault, to raise its defence to each level for a day. */
export const GUARD_PRICE = [0, 800, 2000, 4000] as const;
export const GUARD_MS = 24 * 3_600_000;

/** A vault's defence right now: what its cash buys on its own, or what its members paid for, if higher. */
export function tierNow(cash: number, bought: { level: number; until: number | null }, now: number): number {
  return Math.max(tierFor(cash), bought.until !== null && bought.until > now ? bought.level : 0);
}

export function levelFor(gang: GangId, tier: number): { def: VaultDef; tier: number; level: Level } {
  const def = vaultFor(gang);
  return { def, tier, level: buildLevel(def, tier) };
}

/** One character per tick: direction (-1..3) and power slot (-1..1) packed into 0..14, written in base 36. */
export function encodeInputs(inputs: readonly Input[]): string {
  return inputs.map((i) => (i.d + 1 + 5 * (i.p + 1)).toString(36)).join('');
}

export function decodeInputs(text: string): Input[] | null {
  const out: Input[] = [];
  for (const ch of text) {
    const v = parseInt(ch, 36);
    if (!(v >= 0 && v < 15)) return null;
    out.push({ d: ((v % 5) - 1) as Dir | -1, p: Math.floor(v / 5) - 1 });
  }
  return out;
}

export const maxTicks = (level: Level) => level.ticks + ALARM + TPS;

export interface Settlement {
  state: HeistState;
  /** Cash that moves: from the vault to the robber's gang on an escape, from the robber's gang to the vault on a bust. */
  moved: number;
}

/** Replays a finished run and works out what it's worth. */
export function settle(
  level: Level,
  powers: readonly PowerId[],
  inputs: readonly Input[],
  vaultCash: number,
  robberCash: number,
  revenge: boolean,
): Settlement {
  const state = replay(level, powers, inputs.slice(0, maxTicks(level)));
  if (state.phase === 'escaped') {
    const worth = Math.floor((state.score * (100 + (revenge ? REVENGE_PERCENT : 0))) / 100);
    return { state, moved: Math.max(0, Math.min(worth, vaultCash)) };
  }
  return { state, moved: Math.max(0, Math.min(Math.floor(state.carried / 2), robberCash)) };
}
