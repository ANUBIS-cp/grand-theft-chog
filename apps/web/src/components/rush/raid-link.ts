import {
  decodeDefender,
  encodeRushInputs,
  type DefenderInput,
  type Dir,
  type RushEvent,
  type RushInput,
  type RushState,
} from '@chog-city/game/rush';
import { liveUrl } from '../city/live-city';

// The browser's end of a live raid. Three roles:
//   rob     you are the robber: your screen runs the run itself (so moving feels instant), sends each step's
//           key press up, and is told the exact step every defender's move lands on, so it can rewind
//           and replay those steps and stay identical to the server.
//   defend  you steer one guard: the server's picture comes down 15 times a second.
//   watch   the same picture, nothing to steer.

export interface RaidDefender {
  guard: number;
  name: string;
  chog: number;
  who?: string;
  at: number;
  /** Move changes: from step k on, this letter. */
  changes: { k: number; v: string }[];
}

export interface RaidResult {
  moved?: number;
  jailedUntil?: number | null;
  result?: 'escaped' | 'busted';
  error?: string;
  /** Out with a bag: the pass for carrying it home through the city (stage 3). */
  getawayPass?: string;
}

export class RaidLink {
  status: 'connecting' | 'live' | 'failed' | 'over' = 'connecting';
  role: 'rob' | 'defend' | 'watch' | null = null;
  /** Which guard you steer (defend). */
  you = -1;
  defenders = new Map<string, RaidDefender>();
  result: RaidResult | null = null;
  /** The robber: the earliest step that needs replaying because a defender's move landed there. */
  rewindFrom: number | null = null;
  /** Defend and watch: the newest picture from the server, the one before it, and when it came. */
  snap: { s: RushState; ev: RushEvent[]; at: number } | null = null;
  prevSnap: RushState | null = null;
  /** Emotes floating up from watchers. */
  emotes: { k: string; at: number }[] = [];
  /** The run's setup, from the server: what a defender or watcher needs to draw it. */
  setup: {
    map: string;
    rules: import('@chog-city/game/rush').RushRules;
    powers: string[];
    guards: number[];
    target: string;
    seed: number;
    robber: { chog: number; name: string };
  } | null = null;
  /** The server's state when a robber rejoins mid-run. */
  resync: { s: RushState } | null = null;
  private ws: WebSocket | null = null;
  private out = '';
  private flushAt = 0;
  private lastMove = '';
  private listeners = new Set<() => void>();
  /** Call `cb` whenever something changes; returns a way to stop. */
  listen(cb: () => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
  private onChange() {
    for (const cb of this.listeners) cb();
  }

  constructor(hello: { t: 'raid'; pass: string } | { t: 'watch'; run: string }) {
    try {
      this.ws = new WebSocket(liveUrl());
    } catch {
      this.status = 'failed';
      return;
    }
    const ws = this.ws;
    const fail = setTimeout(() => {
      if (this.status === 'connecting') {
        this.status = 'failed';
        ws.close();
        this.onChange();
      }
    }, 4000);
    ws.onopen = () => ws.send(JSON.stringify(hello));
    ws.onclose = () => {
      clearTimeout(fail);
      // Lost before the end: the robber's screen falls back to saving the run itself.
      if (this.status !== 'over') this.status = 'failed';
      this.onChange();
    };
    ws.onmessage = (e) => {
      let m: Record<string, unknown>;
      try {
        m = JSON.parse(String(e.data));
      } catch {
        return;
      }
      this.handle(m);
      if (m.t === 'room') clearTimeout(fail);
    };
  }

  private handle(m: Record<string, unknown>) {
    switch (m.t) {
      case 'room': {
        this.status = 'live';
        this.role = m.role as RaidLink['role'];
        this.you = typeof m.you === 'number' ? m.you : -1;
        this.setup = (m.setup as RaidLink['setup']) ?? null;
        for (const d of (m.defenders as { guard: number; name: string; chog: number }[]) ?? [])
          if (!this.defenders.has(d.name)) this.defenders.set(d.name, { ...d, at: 0, changes: [] });
        if (m.s && this.role !== 'rob') this.snap = { s: m.s as RushState, ev: [], at: performance.now() };
        if (m.s && this.role === 'rob') this.resync = { s: m.s as RushState };
        break;
      }
      case 'join': {
        const d: RaidDefender = {
          guard: m.guard as number,
          name: m.name as string,
          chog: m.chog as number,
          who: m.who as string,
          at: m.k as number,
          changes: [],
        };
        this.defenders.set(d.name, d);
        this.rewind(d.at);
        break;
      }
      case 'di': {
        const d = this.defenders.get(m.name as string);
        if (!d) break;
        const k = m.k as number;
        d.changes.push({ k, v: m.v as string });
        d.changes.sort((a, b) => a.k - b.k);
        this.rewind(k);
        break;
      }
      case 'st':
        this.prevSnap = this.snap?.s ?? null;
        this.snap = { s: m.s as RushState, ev: (m.ev as RushEvent[]) ?? [], at: performance.now() };
        break;
      case 'em':
        this.emotes.push({ k: m.k as string, at: performance.now() });
        break;
      case 'end':
        this.result = (m.result as RaidResult) ?? { error: 'Could not save the run.' };
        this.status = 'over';
        break;
    }
    this.onChange();
  }

  private rewind(k: number) {
    if (this.role !== 'rob') return;
    this.rewindFrom = this.rewindFrom === null ? k : Math.min(this.rewindFrom, k);
  }

  /** The robber: what every defender pressed at step k, and which guards they had taken over by then. */
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

  /** The robber: this step's key press, sent up a few at a time. */
  push(input: RushInput) {
    this.out += encodeRushInputs([input]);
    const now = performance.now();
    if (this.out.length >= 3 || now - this.flushAt > 66) this.flush();
  }
  flush() {
    if (!this.out || this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ t: 'in', k: this.out }));
    this.out = '';
    this.flushAt = performance.now();
  }

  /** The defender: which way you're steering, and dash. */
  move(d: Dir | -1, dash = false) {
    const key = `${d}${dash ? 'x' : ''}`;
    if (key === this.lastMove || this.ws?.readyState !== WebSocket.OPEN) return;
    this.lastMove = key;
    this.ws.send(JSON.stringify({ t: 'dv', d, dash }));
  }

  emote(k: string) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ t: 'em', k }));
  }

  close() {
    this.ws?.close();
  }
}
