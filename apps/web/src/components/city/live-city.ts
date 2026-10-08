import type { GangId } from '@chog-city/data';
import type { Emote } from './city-render';

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

function liveUrl() {
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
  private ws: WebSocket | null = null;
  private stopped = false;
  private retry = 0;
  private sent = { x: 0, y: 0, f: 1, m: 0, at: 0 };

  constructor(
    private chog: number | null,
    private where: () => { x: number; y: number },
    private on: { fix: (x: number, y: number) => void; status: (s: LiveStatus, online: number) => void },
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
        break;
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
        if (p) p.emote = { kind: m.k as Emote, at: now };
        break;
      }
      case 's': {
        this.online = m.n as number;
        const d = m.d as number[];
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
