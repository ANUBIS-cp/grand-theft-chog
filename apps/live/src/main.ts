import { displayName, getChog } from '@chog-city/data';
import { dayOf } from '@chog-city/game';
import {
  CITY,
  WALK_SPEED,
  inPen,
  isEmote,
  newWalker,
  placeOf,
  rng,
  slide,
  standable,
  stepWalker,
  strollers,
  type Walker,
} from '@chog-city/game/city';
import { readTicket } from '@chog-city/server/ticket';
import { chatHistory, say } from './chat.ts';
import { chasesNow, copPositions, startChase, stepChases } from './getaway.ts';
import { raidCount, raidHello, type RaidHandler } from './raids.ts';
import { createServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';

// The live city: everyone's position, ten times a second. Players say where they are; the server checks the
// move is possible (walls, speed, the jail yard) and tells everyone. It also walks the day's strollers, so all
// players see the same ones. Nothing here touches the database: who you are comes in a signed ticket.

const PORT = Number(process.env.LIVE_PORT ?? 3001);
const HOST = process.env.LIVE_HOST ?? '127.0.0.1';
const ORIGIN = process.env.PUBLIC_HOST ? `https://${process.env.PUBLIC_HOST}` : null;
const TICK_MS = 100;
const MAX_PLAYERS = 600;
const MAX_PER_IP = 8;

interface Player {
  id: number;
  ws: WebSocket;
  ip: string;
  chog: number | null;
  name: string;
  gang: string | null;
  jail: number | null;
  x: number;
  y: number;
  face: -1 | 1;
  moving: boolean;
  lastMove: number;
  lastEmote: number;
  /** Messages in the current second, to cut off floods. */
  burst: number;
  alive: boolean;
}

interface Stroller {
  id: number;
  chog: number;
  name: string;
  gang: string;
  w: Walker;
}

const players = new Map<number, Player>();
let nextId = 1;
const rand = rng(Date.now() & 0xffffffff);
let strollDay = -1;
let strolling: Stroller[] = [];

function refreshStrollers(now: number) {
  const day = dayOf(now);
  if (day === strollDay) return;
  strollDay = day;
  strolling = strollers(now).map((s) => ({
    id: -s.id,
    chog: s.id,
    name: displayName(getChog(s.id)!),
    gang: s.gang,
    w: newWalker(rand),
  }));
  broadcast({ t: 'all', people: everyone() });
}

const info = (p: Player | Stroller) => ({
  id: p.id,
  chog: p.chog,
  name: p.name,
  gang: p.gang,
  npc: p.id < 0,
  jail: 'jail' in p ? p.jail : null,
});
const playing = () => new Set([...players.values()].map((p) => p.chog).filter((c) => c !== null));
// Visitors without a wallet (guests) walk around but nobody else sees them: they have no Chog to show.
const seen = () => [...players.values()].filter((p) => p.chog !== null);
function everyone() {
  const busy = playing();
  return seen()
    .map(info)
    .concat(strolling.filter((s) => !busy.has(s.chog)).map(info));
}

function send(ws: WebSocket, msg: unknown) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}
function broadcast(msg: unknown, except?: number) {
  const text = JSON.stringify(msg);
  for (const p of players.values()) if (p.id !== except && p.ws.readyState === p.ws.OPEN) p.ws.send(text);
}

const jailed = (p: Player, now: number) => p.jail !== null && p.jail > now;
const allowed = (p: Player, x: number, y: number, now: number) =>
  jailed(p, now) ? inPen(x, y) : standable(x, y);

function spawnFor(p: Player, x: unknown, y: unknown, now: number) {
  if (
    typeof x === 'number' &&
    typeof y === 'number' &&
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    allowed(p, x, y, now)
  )
    return { x, y };
  if (jailed(p, now)) {
    const j = placeOf('jail')!;
    return { x: j.x + 1.5 + rand() * 7, y: j.y + j.h + 1.5 };
  }
  return { ...CITY.spawn };
}

const http = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, players: players.size, raids: raidCount() }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server: http, maxPayload: 2048 });

wss.on('connection', (ws, req) => {
  if (ORIGIN && req.headers.origin !== ORIGIN) return ws.close(1008, 'origin');
  // Behind Caddy the real address is in X-Forwarded-For; trust it only from the local proxy.
  const direct = req.socket.remoteAddress ?? '';
  const fwd = String(req.headers['x-forwarded-for'] ?? '')
    .split(',')[0]!
    .trim();
  const ip = (direct === '127.0.0.1' || direct === '::1') && fwd ? fwd : direct;
  if (players.size >= MAX_PLAYERS) return ws.close(1013, 'full');
  if ([...players.values()].filter((p) => p.ip === ip).length >= MAX_PER_IP)
    return ws.close(1008, 'too-many');

  let me: Player | null = null;
  let raid: RaidHandler | null = null;
  const hello = setTimeout(() => !me && ws.close(1008, 'no-hello'), 5000);

  ws.on('message', (raw) => {
    const now = Date.now();
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (raid) return raid(msg);
    if (!me && (msg.t === 'raid' || msg.t === 'watch')) {
      // A raid socket: it belongs to the raid room from here on, not the street.
      clearTimeout(hello);
      raid = raidHello(ws, msg, now);
      if (!raid) ws.close(1008, 'no-raid');
      return;
    }
    if (!me) {
      if (msg.t !== 'hi' || typeof msg.ticket !== 'string') return ws.close(1008, 'bad-hello');
      const t = readTicket(msg.ticket, now);
      if (!t) return ws.close(1008, 'bad-ticket');
      clearTimeout(hello);
      // One window per Chog: an older one is sent away.
      if (t.chog !== null)
        for (const p of players.values())
          if (p.chog === t.chog) {
            send(p.ws, { t: 'bye', why: 'elsewhere' });
            p.ws.close(4000, 'elsewhere');
            players.delete(p.id);
            broadcast({ t: 'leave', id: p.id });
          }
      const p: Player = {
        id: nextId++,
        ws,
        ip,
        chog: t.chog,
        name: t.name,
        gang: t.gang,
        jail: t.jail,
        x: 0,
        y: 0,
        face: 1,
        moving: false,
        lastMove: now,
        lastEmote: 0,
        burst: 0,
        alive: true,
      };
      Object.assign(p, spawnFor(p, msg.x, msg.y, now));
      me = p;
      players.set(p.id, p);
      send(ws, { t: 'you', id: p.id, x: p.x, y: p.y });
      send(ws, { t: 'all', people: everyone() });
      // Getaways already running, so a newcomer sees the chase too.
      for (const c of chasesNow()) send(ws, { t: 'chase', ...c });
      send(ws, { t: 'chat', msgs: chatHistory(p.gang) });
      if (p.chog !== null) broadcast({ t: 'join', p: info(p) }, p.id);
      // A stroller that is now being played leaves the street.
      if (p.chog !== null && strolling.some((s) => s.chog === p.chog)) broadcast({ t: 'leave', id: -p.chog });
      return;
    }
    if (++me.burst > 40) return;
    if (msg.t === 'mv') {
      if (typeof msg.x !== 'number' || typeof msg.y !== 'number') return;
      let { x, y } = msg as { x: number; y: number };
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      // Positions come rounded to 0.01, which can put you a hair inside a tree or wall you're pressed
      // against: push it back out instead of refusing the move (refusing yanked you back, so you stuck).
      if (!jailed(me, now) && !standable(x, y)) ({ x, y } = slide(x, y, 0, 0));
      const dt = Math.max(60, Math.min(1000, now - me.lastMove));
      const reach = (WALK_SPEED * dt * 1.5) / 1000 + 0.3;
      if (Math.hypot(x - me.x, y - me.y) > reach || !allowed(me, x, y, now)) {
        send(ws, { t: 'fix', x: me.x, y: me.y });
        return;
      }
      me.x = x;
      me.y = y;
      me.face = msg.f === -1 ? -1 : 1;
      me.moving = msg.m === 1;
      me.lastMove = now;
    } else if (msg.t === 'run') {
      // Out of a vault with a bag: the getaway starts at the robbed gang's door.
      const at = startChase(me, msg.pass, now, broadcast);
      if (at) {
        me.x = at.x;
        me.y = at.y;
        send(ws, { t: 'fix', x: me.x, y: me.y });
      }
    } else if (msg.t === 'say') {
      // Chat: the city room goes to everyone, a gang room only to that gang.
      const m = say(me, msg.room, msg.text, now);
      if (typeof m === 'string') send(ws, { t: 'say-no', why: m });
      else {
        const out = JSON.stringify({ t: 'msg', m, by: me.id });
        for (const p of players.values())
          if ((m.room === 'city' || p.gang === m.gang) && p.ws.readyState === p.ws.OPEN) p.ws.send(out);
      }
    } else if (msg.t === 'em' && isEmote(msg.k) && now - me.lastEmote > 900) {
      me.lastEmote = now;
      if (me.chog !== null) broadcast({ t: 'em', id: me.id, k: msg.k });
    }
  });

  ws.on('pong', () => {
    if (me) me.alive = true;
  });
  ws.on('close', () => {
    clearTimeout(hello);
    if (!me || players.get(me.id) !== me) return;
    players.delete(me.id);
    broadcast({ t: 'leave', id: me.id });
    if (me.chog !== null && strolling.some((s) => s.chog === me!.chog)) {
      const s = strolling.find((x) => x.chog === me!.chog)!;
      broadcast({ t: 'join', p: info(s) });
    }
  });
});

// Ten times a second: walk the strollers, then send everyone's position as one flat list of numbers.
setInterval(() => {
  const now = Date.now();
  refreshStrollers(now);
  const busy = playing();
  const d: number[] = [];
  for (const s of strolling) {
    stepWalker(s.w, TICK_MS / 1000, rand);
    if (busy.has(s.chog)) continue;
    d.push(
      s.id,
      Math.round(s.w.x * 100),
      Math.round(s.w.y * 100),
      (s.w.face < 0 ? 1 : 0) | (s.w.moving ? 2 : 0),
    );
  }
  for (const p of players.values()) {
    p.burst = 0;
    if (p.chog === null) continue;
    d.push(p.id, Math.round(p.x * 100), Math.round(p.y * 100), (p.face < 0 ? 1 : 0) | (p.moving ? 2 : 0));
  }
  stepChases(TICK_MS / 1000, now, players, broadcast);
  if (players.size) broadcast({ t: 's', n: seen().length, d, c: copPositions() });
}, TICK_MS);

// Drop connections that stopped answering.
setInterval(() => {
  for (const p of players.values()) {
    if (!p.alive) {
      p.ws.terminate();
      continue;
    }
    p.alive = false;
    p.ws.ping();
  }
}, 30_000);

http.listen(PORT, HOST, () => console.log(`live city on ${HOST}:${PORT}`));
