import { BUST_FINE, REVENGE_PERCENT } from '../heist/war.ts';
import type { PowerId } from '../heist/powers.ts';
import type { RushMap } from './map.ts';
import {
  TPS,
  startRush,
  stepRush,
  type DefenderInput,
  type RushInput,
  type RushRules,
  type RushState,
} from './sim.ts';

// Cash Rush in the gang war: a run's key presses travel as one short string, and the server replays them
// with the run's own seed to see what really happened before any cash moves.

const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** One letter a step: which way (or none), Use, and which power. */
export function encodeRushInputs(inputs: readonly RushInput[]): string {
  let out = '';
  for (const i of inputs) out += ABC[i.d + 1 + (i.use ? 5 : 0) + ((i.p ?? -1) + 1) * 10]!;
  return out;
}

export function decodeRushInputs(text: string): RushInput[] | null {
  const out: RushInput[] = [];
  for (const ch of text) {
    const v = ABC.indexOf(ch);
    if (v < 0 || v >= 30) return null;
    const d = (v % 5) - 1;
    const use = Math.floor(v / 5) % 2 === 1;
    const p = Math.floor(v / 10) - 1;
    out.push({ d: d as RushInput['d'], ...(use ? { use } : {}), ...(p >= 0 ? { p } : {}) });
  }
  return out;
}

/** Every run's dice come from its id, so the browser and the server roll the same. */
export function rushSeed(runId: string): number {
  let h = 2166136261;
  for (let i = 0; i < runId.length; i++) h = Math.imul(h ^ runId.charCodeAt(i), 16777619);
  return h | 0;
}

/** A defender who took over a guard at step `at`, and their moves from then on (one letter a step). */
export interface DefenderLog {
  guard: number;
  name: string;
  chog: number;
  at: number;
  moves: string;
}

/** A defender's step: which way and whether they dash, as one letter. */
export const encodeDefender = (i: DefenderInput) => ABC[i.d + 1 + (i.dash ? 5 : 0)]!;
export function decodeDefender(ch: string | undefined): DefenderInput {
  const v = ch === undefined ? 0 : ABC.indexOf(ch);
  if (v < 0 || v >= 10) return { d: -1 };
  return { d: ((v % 5) - 1) as DefenderInput['d'], ...(v >= 5 ? { dash: true } : {}) };
}

/** The most steps a run can take: the clock, plus a little. */
export const rushMaxSteps = (m: RushMap) => (m.seconds + 2) * TPS;

/** Replays a run to the end (standing still once the inputs run out). */
export function replayRush(
  m: RushMap,
  rules: RushRules,
  powers: readonly PowerId[],
  inputs: readonly RushInput[],
  seed: number,
  defenders: readonly DefenderLog[] = [],
): RushState {
  const s = startRush(m, rules, powers, seed);
  const max = rushMaxSteps(m);
  for (let k = 0; s.phase === 'play' && k < max + 1; k++) {
    // A defender takes over their guard at the step they joined.
    const moves: Record<string, DefenderInput> = {};
    for (const d of defenders) {
      if (k < d.at) continue;
      const g = s.guards[d.guard];
      if (g && k === d.at) g.human = d.name;
      moves[d.name] = decodeDefender(d.moves[k - d.at]);
    }
    stepRush(s, m, rules, inputs[k] ?? { d: -1 }, moves);
  }
  return s;
}

/** What a finished run moves: the take (capped by the vault) on an escape; what you carried plus the fine on a bust. */
export function settleRush(
  m: RushMap,
  rules: RushRules,
  powers: readonly PowerId[],
  inputs: readonly RushInput[],
  seed: number,
  vaultCash: number,
  robberCash: number,
  revenge: boolean,
  defenders: readonly DefenderLog[] = [],
): { state: RushState; moved: number } {
  const state = replayRush(m, rules, powers, inputs, seed, defenders);
  if (state.phase === 'escaped') {
    const worth = Math.floor((state.score * (100 + (revenge ? REVENGE_PERCENT : 0))) / 100);
    return { state, moved: Math.max(0, Math.min(worth, vaultCash)) };
  }
  return { state, moved: Math.max(0, Math.min(state.carried + BUST_FINE, robberCash)) };
}
