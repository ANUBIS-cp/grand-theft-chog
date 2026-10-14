import type { GangId } from '@chog-city/data';
import { isEmote, type Emote } from '@chog-city/game/city';

// The browser's side of the live city: one WebSocket, everyone's positions ten times a second, smoothed
// between updates. Reconnects by itself, with a fresh ticket each time.

export interface Remote {
  id: number;
  chog: number | null;
  name: string;
  gang: GangId | null;
  npc: boolean;
  /** Last two positions from the server and when the newer one arrived. */
  px: number;
  py: number;
  nx: number;
  ny: number;
  at: number;
  face: -1 | 1;
  moving: boolean;
  seen: number;
  emote?: { kind: Emote; at: number };
  /** Police in a getaway (not a player or a stroller). */
  cop?: boolean;
}

/** A getaway in the city: someone carrying a bag from a robbed gang's door to their own. */
export interface Chase {
  run: string;
  /** The runner's id in the people list. */
  id: number;
  chog: number;
  name: string;
  bag: number;
  from: GangId;
  home: GangId;
  /** When time runs out (ms). */
  until: number;
  cops: { id: number; chog: number }[];
}

export interface ChaseEnd {
  run: string;
  id: number;
  chog: number;
  outcome: 'home' | 'caught';
  /** The robbed-gang Chog that tagged them, if it wasn't the police. */
  by: number | null;
  who: 'police' | 'gang' | 'time' | null;
  bag: number;
}

interface Info {
  id: number;
  chog: number | null;
  name: string;
  gang: GangId | null;
  npc: boolean;
}

export type LiveStatus = 'connecting' | 'live' | 'offline' | 'elsewhere';

const TICK = 100;

export function liveUrl() {
  const { protocol, hostname, host, port } = window.location;
  // Local development runs the live server on its own port; the real site serves it at /ws.
  if (port === '3000') return `ws://${hostname}:3001`;
  return `${protocol === 'https:' ? 'wss' : 'ws'}://${host}/ws`;
}

export class LiveCity {
  status: LiveStatus = 'connecting';
  online = 0;
  you: number | null = null;
  people = new Map<number, Remote>();
  chases = new Map<string, Chase>();
  /** Your own getaway pass, sent again after a reconnect so the run carries on. */
  private myRun: string | null = null;
  private ws: WebSocket | null = null;
  private stopped = false;
  private retry = 0;
  private sent = { x: 0, y: 0, f: 1, m: 0, at: 0 };

  constructor(
    private chog: number | null,
    private where: () => { x: number; y: number },
    private on: {
      fix: (x: number, y: number) => void;
      status: (s: LiveStatus, online: number) => void;
      chase?: () => void;
      chaseEnd?: (e: ChaseEnd) => void;
    },
  ) {
    queueMicrotask(() => void this.connect());
  }

  private setStatus(s: LiveStatus) {
    this.status = s;
    this.on.status(s, this.online);
  }

  private async connect() {
    if (this.stopped) return;
    this.setStatus('connecting');
    let ticket: string;
    try {
      const r = await fetch(`/api/city/ticket${this.chog ? `?chog=${this.chog}` : ''}`, {
        cache: 'no-store',
      });
      ticket = ((await r.json()) as { ticket: string }).ticket;
      if (!ticket) throw new Error('no ticket');
    } catch {
      return this.later();
    }
    if (this.stopped) return;
    const ws = new WebSocket(liveUrl());
    this.ws = ws;
    ws.onopen = () => {
      const { x, y } = this.where();
      ws.send(JSON.stringify({ t: 'hi', ticket, x, y }));
    };
    ws.onmessage = (e) => this.message(JSON.parse(String(e.data)));
    ws.onclose = (e) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.you = null;
      if (e.code === 4000) {
        this.stopped = true;
        this.setStatus('elsewhere');
        return;
      }
      this.later();
    };
  }

  private later() {
    if (this.stopped) return;
    this.setStatus('offline');
    const wait = Math.min(15_000, 1000 * 2 ** this.retry++);
    setTimeout(() => void this.connect(), wait);
  }

  private add(p: Info, now: number) {
    const have = this.people.get(p.id);
    if (have) Object.assign(have, { chog: p.chog, name: p.name, gang: p.gang, npc: p.npc });
    else
      this.people.set(p.id, {
        ...p,
        px: NaN,
        py: NaN,
        nx: NaN,
        ny: NaN,
        at: now,
        face: 1,
        moving: false,
        seen: 0,
      });
  }

  private message(m: { t: string; [k: string]: unknown }) {
    const now = performance.now();
    switch (m.t) {
      case 'you':
        this.you = m.id as number;
        this.retry = 0;
        this.setStatus('live');
        this.on.fix(m.x as number, m.y as number);
        if (this.myRun) this.ws?.send(JSON.stringify({ t: 'run', pass: this.myRun }));
        break;
      case 'chase': {
        const c = m as unknown as Chase;
        this.chases.set(c.run, c);
        for (const k of c.cops)
          this.add({ id: k.id, chog: k.chog, name: 'Police', gang: null, npc: true }, now);
        for (const k of c.cops) this.people.get(k.id)!.cop = true;
        this.on.chase?.();
        break;
      }
      case 'chase-end': {
        const e = m as unknown as ChaseEnd;
        const c = this.chases.get(e.run);
        // The police stay a moment where they are, then go.
        if (c) setTimeout(() => c.cops.forEach((k) => this.people.delete(k.id)), 2500);
        this.chases.delete(e.run);
        if (e.chog === this.chog) this.myRun = null;
        this.on.chaseEnd?.(e);
        this.on.chase?.();
        break;
      }
      case 'all':
        this.people.clear();
        for (const p of m.people as Info[]) this.add(p, now);
        break;
      case 'join':
        this.add(m.p as Info, now);
        break;
      case 'leave':
        this.people.delete(m.id as number);
        break;
      case 'fix':
        this.on.fix(m.x as number, m.y as number);
        break;
      case 'em': {
        const p = this.people.get(m.id as number);
        if (p && isEmote(m.k)) p.emote = { kind: m.k, at: now };
        break;
      }
      case 's': {
        this.online = m.n as number;
        const d = (m.d as number[]).concat((m.c as number[] | undefined) ?? []);
        for (let i = 0; i < d.length; i += 4) {
          const p = this.people.get(d[i]!);
          if (!p) continue;
          const x = d[i + 1]! / 100;
          const y = d[i + 2]! / 100;
          // Start from wherever it's drawn now, so a late update doesn't make it jump back.
          const cur = this.at(p, now);
          p.px = Number.isNaN(cur.x) ? x : cur.x;
          p.py = Number.isNaN(cur.y) ? y : cur.y;
          p.nx = x;
          p.ny = y;
          p.at = now;
          p.face = d[i + 3]! & 1 ? -1 : 1;
          p.moving = (d[i + 3]! & 2) !== 0;
          p.seen = now;
        }
        break;
      }
      case 'bye':
        this.stopped = true;
        this.setStatus('elsewhere');
        break;
    }
  }

  /** Where someone is drawn right now: sliding from the last position to the newest over one tick. */
  at(p: Remote, now: number) {
    const k = Math.min(1, (now - p.at) / TICK);
    return { x: p.px + (p.nx - p.px) * k, y: p.py + (p.ny - p.py) * k };
  }

  /** Called every frame with your position; sends it at most ten times a second, and only when it changed. */
  move(x: number, y: number, face: -1 | 1, moving: boolean, now: number) {
    const ws = this.ws;
    if (!ws || ws.readyState !== ws.OPEN || this.you === null) return;
    const s = this.sent;
    const m = moving ? 1 : 0;
    const changed = Math.abs(s.x - x) > 0.01 || Math.abs(s.y - y) > 0.01 || s.f !== face || s.m !== m;
    if (now - s.at < TICK || (!changed && now - s.at < 2000)) return;
    ws.send(
      JSON.stringify({ t: 'mv', x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, f: face, m }),
    );
    this.sent = { x, y, f: face, m, at: now };
  }

  /** Out of a vault with a bag: start the getaway (the server puts you at the robbed gang's door). */
  run(pass: string) {
    this.myRun = pass;
    if (this.ws?.readyState === WebSocket.OPEN && this.you !== null)
      this.ws.send(JSON.stringify({ t: 'run', pass }));
  }

  emote(kind: Emote) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ t: 'em', k: kind }));
  }

  stop() {
    this.stopped = true;
    const ws = this.ws;
    this.ws = null;
    ws?.close();
  }
}
