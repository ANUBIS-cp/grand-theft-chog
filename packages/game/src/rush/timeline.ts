import type { PowerId } from '../heist/powers.ts';
import type { RushMap } from './map.ts';
import {
  startRush,
  stepRush,
  type DefenderInput,
  type RushEvent,
  type RushInput,
  type RushRules,
  type RushState,
} from './sim.ts';
import { decodeDefender } from './war.ts';

// The robber's side of a live raid: the run plays on this screen straight away, and when the server says a
// defender's move landed on a step that's already been played, the run rewinds to that step and plays
// forward again with it. Played this way, the screen ends up exactly where the server is.

export interface TimelineDefender {
  guard: number;
  name: string;
  at: number;
  changes: { k: number; v: string }[];
}

export class RushTimeline {
  s: RushState;
  inputs: RushInput[] = [];
  private hist = new Map<number, RushState>();
  private rewindFrom: number | null = null;
  readonly defenders = new Map<string, TimelineDefender>();

  constructor(
    private map: RushMap,
    private rules: RushRules,
    powers: readonly PowerId[],
    seed: number,
    /** How many past steps to keep for rewinding. */
    private keep = 150,
  ) {
    this.s = startRush(map, rules, powers, seed);
  }

  /** A defender took over a guard at step `at`. */
  join(d: { guard: number; name: string; at: number }) {
    if (!this.defenders.has(d.name)) this.defenders.set(d.name, { ...d, changes: [] });
    this.mark(d.at);
  }

  /** A defender's move changed to `v` from step k on. */
  change(name: string, k: number, v: string) {
    const d = this.defenders.get(name);
    if (!d) return;
    d.changes.push({ k, v });
    d.changes.sort((a, b) => a.k - b.k);
    this.mark(k);
  }

  private mark(k: number) {
    this.rewindFrom = this.rewindFrom === null ? k : Math.min(this.rewindFrom, k);
  }

  movesAt(k: number): Record<string, DefenderInput> {
    const out: Record<string, DefenderInput> = {};
    for (const d of this.defenders.values()) {
      if (k < d.at) continue;
      let v = 'A';
      for (const c of d.changes) if (c.k <= k) v = c.v;
      out[d.name] = decodeDefender(v);
    }
    return out;
  }

  private one(input: RushInput): RushEvent[] {
    const k = this.s.tick;
    this.hist.set(k, structuredClone(this.s));
    this.hist.delete(k - this.keep);
    for (const d of this.defenders.values())
      if (d.at === k && this.s.guards[d.guard]) this.s.guards[d.guard]!.human = d.name;
    return stepRush(this.s, this.map, this.rules, input, this.movesAt(k));
  }

  /** Plays your next step. */
  step(input: RushInput): RushEvent[] {
    this.inputs[this.s.tick] = input;
    return this.one(input);
  }

  /** Replays from the earliest step a defender's move changed. Returns what happened again on the way. */
  catchUp(): RushEvent[] {
    const k0 = this.rewindFrom;
    this.rewindFrom = null;
    if (k0 === null || k0 >= this.s.tick) return [];
    const from = this.hist.get(k0);
    if (!from) return [];
    const until = this.s.tick;
    this.s = structuredClone(from);
    const ev: RushEvent[] = [];
    while (this.s.tick < until && this.s.phase === 'play')
      ev.push(...this.one(this.inputs[this.s.tick] ?? { d: -1 }));
    return ev;
  }

  /** The server's state replaces ours (a rejoin mid-run). */
  adopt(s: RushState) {
    this.s = structuredClone(s);
    this.inputs.length = s.tick;
    this.hist.clear();
  }
}
