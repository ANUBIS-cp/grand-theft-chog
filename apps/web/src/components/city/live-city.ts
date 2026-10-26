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
  /** The newest position from the server (NaN until the first). */
  nx: number;
  ny: number;
  /** The last second or so of positions, by when each arrived: drawn a moment behind, sliding between them. */
  buf: Snap[];
  face: -1 | 1;
  moving: boolean;
  seen: number;
  emote?: { kind: Emote; at: number };
  /** The last thing they said in the city room, shown in a bubble over them for a few seconds. */
  said?: { text: string; at: number };
  /** Police in a getaway (not a player or a stroller). */
  cop?: boolean;
}

interface Snap {
  t: number;
  x: number;
  y: number;
  face: -1 | 1;
  moving: boolean;
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
  /** When it started, and when time runs out (ms). */
  since: number;
  until: number;
  /** When the police start running (ms); null until the robber's first step. */
  go?: number | null;
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

/** Pumpkin Rush: a pumpkin full of cash on the street, until someone reaches it. */
export interface Pumpkin {
  id: string;
  x: number;
  y: number;
  cash: number;
  gold: boolean;
  until: number;
  /** Its last hop away from someone: where from, and when it took off (this page's clock), for the arc. */
  hop?: { fx: number; fy: number; at: number };
  /** The preview's own pumpkins: when they may hop next (see hopAway). */
  next?: number;
}

export interface PumpkinGot {
  id: string;
  chog: number;
  name: string;
  gang: GangId;
  cash: number;
  gold: boolean;
  x: number;
  y: number;
}

/** Today's Most Wanted: yesterday's best robber, with a bounty on their head. */
export interface Wanted {
  day: number;
  chog: number;
  name: string;
  gang: GangId;
  bounty: number;
  claimed: boolean;
}

export interface WantedGot {
  chog: number;
  name: string;
  gang: GangId;
  by: number;
  byName: string;
  byGang: GangId;
  bounty: number;
}

/** A chat message: the city room, or your gang's. */
export interface ChatMsg {
  id: number;
  room: 'city' | 'gang';
  gang: GangId | null;
  chog: number;
  name: string;
  from: GangId | null;
  /** The words, or a sticker's emoji. */
  text: string;
  /** A Chog sticker's number, if this message is one. */
  sticker?: number;
  at: number;
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
// How far behind others are drawn, so there's always a next position to slide to. Players need more: their
// phone sends on its own beat (every 100-117 ms, with the screen's frames), not the server's, so now and then a
// tick has nothing new, and positions arrive a little uneven over the internet. The police and strollers are
// moved by the server itself, every tick.
const BEHIND_PLAYER = 230;
const BEHIND_SERVER = 130;

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
  chat: ChatMsg[] = [];
  pumpkins: Pumpkin[] = [];
  wanted: Wanted | null = null;
  /** Why today's Most Wanted can't be caught right now (the live server's call), or null. */
  wantedSafe: string | null = null;
  /** Your own getaway pass, sent again after a reconnect so the run carries on. */
  private myRun: string | null = null;
  private ws: WebSocket | null = null;
  private stopped = false;
  private retry = 0;
  private sent = { x: 0, y: 0, f: 1, m: 0, at: 0 };
  private beat = -1e9;

  constructor(
    private chog: number | null,
    private where: () => { x: number; y: number },
    private on: {
      fix: (x: number, y: number) => void;
      status: (s: LiveStatus, online: number) => void;
      chase?: () => void;
      chaseEnd?: (e: ChaseEnd) => void;
      /** The chat changed: a new message (or the history on connecting), or a message was refused. */
      chat?: (fresh: ChatMsg | null, refused?: string) => void;
      /** Your own last city-room message, for the bubble over your head. */
      said?: (text: string) => void;
      /** Someone reached a pumpkin first. */
      pumpkin?: (e: PumpkinGot) => void;
      /** Today's Most Wanted changed, or a rival claimed the bounty. */
      wanted?: (w: Wanted | null, got?: WantedGot) => void;
      /** You reached the Most Wanted but couldn't catch them, and why. */
      wantedNo?: (why: string) => void;
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

  private add(p: Info) {
    const have = this.people.get(p.id);
    if (have) Object.assign(have, { chog: p.chog, name: p.name, gang: p.gang, npc: p.npc });
    else
      this.people.set(p.id, {
        ...p,
        nx: NaN,
        ny: NaN,
        buf: [],
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
          this.add({ id: k.id, chog: k.chog, name: 'Police', gang: null, npc: true });
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
        for (const p of m.people as Info[]) this.add(p);
        break;
      case 'join':
        this.add(m.p as Info);
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
        // The server sends these exactly every 100 ms, but they arrive a little uneven: time them on that
        // steady beat (pulled gently toward when they really arrive), not on the arrival itself.
        const due = this.beat + TICK;
        this.beat = Math.abs(now - due) < 150 ? due + (now - due) * 0.1 : now;
        const at = this.beat;
        const d = (m.d as number[]).concat((m.c as number[] | undefined) ?? []);
        for (let i = 0; i < d.length; i += 4) {
          const p = this.people.get(d[i]!);
          if (!p) continue;
          const x = d[i + 1]! / 100;
          const y = d[i + 2]! / 100;
          const face = d[i + 3]! & 1 ? -1 : 1;
          const moving = (d[i + 3]! & 2) !== 0;
          p.seen = now;
          const last = p.buf[p.buf.length - 1];
          // Walking but no new position: their phone's update missed this tick. Skip it, so they slide on
          // to the next one instead of stopping for a tick and then lurching.
          if (last && moving && last.moving && last.x === x && last.y === y && at - last.t < 400) continue;
          // After standing still for a while, the next step starts from now (not from long ago).
          if (last && at - last.t > 400) p.buf.push({ ...last, t: at - TICK });
          p.buf.push({ t: at, x, y, face, moving });
          while (p.buf.length > 2 && p.buf[1]!.t < at - 1200) p.buf.shift();
          p.nx = x;
          p.ny = y;
          p.face = face;
          p.moving = moving;
        }
        break;
      }
      case 'chat': {
        // History on (re)connecting: keep anything newer we already have.
        const seen = new Set(this.chat.map((c) => c.id));
        this.chat = [...this.chat, ...(m.msgs as ChatMsg[]).filter((c) => !seen.has(c.id))]
          .sort((a, b) => a.at - b.at)
          .slice(-150);
        this.on.chat?.(null);
        break;
      }
      case 'msg': {
        const c = m.m as ChatMsg;
        if (this.chat.some((x) => x.id === c.id)) break;
        this.chat = [...this.chat, c].slice(-150);
        if (c.room === 'city') {
          const p = this.people.get(m.by as number);
          if (p) p.said = { text: c.text, at: now };
          if (m.by === this.you) this.on.said?.(c.text);
        }
        this.on.chat?.(c);
        break;
      }
      case 'pk':
        this.pumpkins = m.list as Pumpkin[];
        break;
      case 'pk-hop': {
        const p = this.pumpkins.find((k) => k.id === m.id);
        if (p) {
          p.hop = { fx: m.fx as number, fy: m.fy as number, at: now };
          p.x = m.x as number;
          p.y = m.y as number;
        }
        break;
      }
      case 'pk-got':
        this.pumpkins = this.pumpkins.filter((p) => p.id !== m.id);
        this.on.pumpkin?.(m as unknown as PumpkinGot);
        break;
      case 'wanted':
        this.wanted = (m.w as Wanted | null) ?? null;
        this.on.wanted?.(this.wanted);
        break;
      case 'wanted-safe':
        this.wantedSafe = (m.why as string | null) ?? null;
        break;
      case 'wanted-no':
        this.on.wantedNo?.(m.why as string);
        break;
      case 'wanted-got':
        if (this.wanted) this.wanted = { ...this.wanted, claimed: true };
        this.on.wanted?.(this.wanted, m as unknown as WantedGot);
        break;
      case 'say-no':
        this.on.chat?.(null, m.why as string);
        break;
      case 'bye':
        this.stopped = true;
        this.setStatus('elsewhere');
        break;
    }
  }

  /** Where someone is drawn right now, a moment behind the newest position, and which way they face then. */
  at(p: Remote, now: number): { x: number; y: number; face: -1 | 1; moving: boolean } {
    const b = p.buf;
    const t = now - (p.npc ? BEHIND_SERVER : BEHIND_PLAYER);
    const first = b[0];
    if (!first) return { x: p.nx, y: p.ny, face: p.face, moving: p.moving };
    if (t <= first.t) return first;
    for (let i = b.length - 1; i > 0; i--) {
      const a = b[i - 1]!;
      if (t < a.t) continue;
      const n = b[i]!;
      if (t >= n.t) return n;
      const k = (t - a.t) / (n.t - a.t);
      return { x: a.x + (n.x - a.x) * k, y: a.y + (n.y - a.y) * k, face: n.face, moving: a.moving || n.moving };
    }
    return b[b.length - 1]!;
  }

  /** Called every frame with your position; sends it at most ten times a second, and only when it changed. */
  move(x: number, y: number, face: -1 | 1, moving: boolean, now: number) {
    const ws = this.ws;
    if (!ws || ws.readyState !== ws.OPEN || this.you === null) return;
    const s = this.sent;
    const m = moving ? 1 : 0;
    const changed = Math.abs(s.x - x) > 0.01 || Math.abs(s.y - y) > 0.01 || s.f !== face || s.m !== m;
    // A few ms early is fine: a 60 Hz screen then sends every 6th frame (100 ms) instead of every 7th.
    if (now - s.at < TICK - 6 || (!changed && now - s.at < 2000)) return;
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

  /** Says something, or sends a sticker, in the city room or your gang's. */
  say(room: 'city' | 'gang', text: string, sticker?: number) {
    if (this.ws?.readyState === WebSocket.OPEN)
      this.ws.send(JSON.stringify({ t: 'say', room, text, sticker }));
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
