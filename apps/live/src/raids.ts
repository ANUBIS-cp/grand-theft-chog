import { displayName, getChog } from '@chog-city/data';
import type { PowerId } from '@chog-city/game/heist';
import {
  DT,
  decodeDefender,
  decodeRushInputs,
  encodeDefender,
  rushMap,
  rushRules,
  rushSeed,
  startRush,
  stepRush,
  type DefenderInput,
  type DefenderLog,
  type Dir,
  type RushEvent,
  type RushInput,
  type RushMap,
  type RushRules,
  type RushState,
} from '@chog-city/game/rush';
import { readRaidPass, signInternal } from '@chog-city/server/ticket';
import type { WebSocket } from 'ws';

// Live raids: a Cash Rush run played on the server, so the robbed gang's members can jump in and steer
// guards themselves, and anyone can watch. The robber's key presses drive the clock (one per step); a
// defender's latest move is used at every step and recorded, and the robber's screen is told the exact step
// each change landed on, so it can rewind and stay in step. At the end the whole record goes to the web app,
// which replays it before any cash moves.

const WEB = process.env.WEB_INTERNAL_URL ?? 'http://127.0.0.1:3000';
const MAX_DEFENDERS = 3;
/** Steps the robber's queue may catch up per server tick (it can't fast-forward the run). */
const CATCH_UP = 2;
/** The robber vanished: the run carries on without them. */
const GONE_MS = 4000;
/** Never pressed a key: start without them after this long. */
const WAIT_MS = 25_000;

interface Defender {
  ws: WebSocket;
  name: string;
  chog: number;
  guard: number;
  at: number;
  cur: string;
  moves: string;
}

interface Room {
  id: string;
  map: RushMap;
  rules: RushRules;
  powers: PowerId[];
  guards: number[];
  target: string;
  robber: {
    ws: WebSocket | null;
    chog: number;
    name: string;
    queue: RushInput[];
    lastAt: number;
    started: boolean;
  };
  defenders: Map<string, Defender>;
  watchers: Set<WebSocket>;
  s: RushState;
  inputs: string;
  ev: RushEvent[];
  created: number;
  ending: boolean;
  lastSnap: number;
}

const rooms = new Map<string, Room>();

function send(ws: WebSocket | null, msg: unknown) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}
function viewers(r: Room) {
  return [...r.defenders.values()].map((d) => d.ws).concat([...r.watchers]);
}
const roster = (r: Room) =>
  [...r.defenders.values()].map((d) => ({ guard: d.guard, name: d.name, chog: d.chog }));
const setup = (r: Room) => ({
  map: r.map.id,
  rules: r.rules,
  powers: r.powers,
  guards: r.guards,
  target: r.target,
  seed: rushSeed(r.id),
  robber: { chog: r.robber.chog, name: r.robber.name },
});

/** A message on a socket that's in a raid. */
export type RaidHandler = (msg: Record<string, unknown>) => void;

/**
 * The first message on a socket asked for a raid: `{ t: 'raid', pass }` to rob or defend, or
 * `{ t: 'watch', run }` to watch. Returns the handler for its later messages, or null to close it.
 */
export function raidHello(ws: WebSocket, msg: Record<string, unknown>, now: number): RaidHandler | null {
  if (msg.t === 'watch' && typeof msg.run === 'string') {
    const r = rooms.get(msg.run);
    if (!r || r.watchers.size > 200) return null;
    r.watchers.add(ws);
    send(ws, { t: 'room', role: 'watch', setup: setup(r), defenders: roster(r), s: r.s });
    ws.on('close', () => r.watchers.delete(ws));
    return (m) => emote(r, m, 'watcher');
  }
  if (msg.t !== 'raid' || typeof msg.pass !== 'string') return null;
  const pass = readRaidPass(msg.pass, now);
  if (!pass) return null;
  let r = rooms.get(pass.run);
  if (pass.role === 'rob') {
    if (!r) {
      const st = pass.setup;
      const map = st && rushMap(st.map);
      if (!st || !map) return null;
      const rules = rushRules(st.tier, st.breakout, st.loud === true);
      r = {
        id: pass.run,
        map,
        rules,
        powers: st.powers as PowerId[],
        guards: st.guards,
        target: st.target,
        robber: { ws: null, chog: pass.chog, name: pass.name, queue: [], lastAt: now, started: false },
        defenders: new Map(),
        watchers: new Set(),
        s: startRush(map, rules, st.powers as PowerId[], rushSeed(pass.run)),
        inputs: '',
        ev: [],
        created: now,
        ending: false,
        lastSnap: 0,
      };
      rooms.set(r.id, r);
    }
    const room = r;
    // A reconnect replaces the old socket.
    if (room.robber.ws && room.robber.ws !== ws) room.robber.ws.close(4000, 'elsewhere');
    room.robber.ws = ws;
    room.robber.lastAt = now;
    send(ws, { t: 'room', role: 'rob', setup: setup(room), defenders: roster(room), tick: room.s.tick });
    ws.on('close', () => {
      if (room.robber.ws === ws) room.robber.ws = null;
    });
    return (m) => {
      if (m.t !== 'in' || typeof m.k !== 'string' || m.k.length > 12) return;
      const got = decodeRushInputs(m.k);
      if (!got) return;
      // Never more steps than the run can have.
      if (room.inputs.length + room.robber.queue.length + got.length > (room.map.seconds + 2) * 30) return;
      room.robber.queue.push(...got);
      room.robber.lastAt = Date.now();
      room.robber.started = true;
    };
  }
  // A defender.
  if (!r || r.ending || r.s.phase !== 'play') return null;
  const room = r;
  const taken = new Set([...room.defenders.values()].map((d) => d.guard));
  let guard = room.guards.findIndex((id, i) => id === pass.chog && !taken.has(i) && i < room.s.guards.length);
  if (guard < 0) guard = room.s.guards.findIndex((g, i) => !taken.has(i) && g.human === null);
  if (guard < 0 || room.defenders.size >= MAX_DEFENDERS) {
    // Every guard is taken: watch instead.
    room.watchers.add(ws);
    send(ws, { t: 'room', role: 'watch', setup: setup(room), defenders: roster(room), s: room.s });
    ws.on('close', () => room.watchers.delete(ws));
    return (m) => emote(room, m, pass.name);
  }
  const name = `d${pass.chog}`;
  const old = room.defenders.get(name);
  if (old) {
    old.ws.close(4000, 'elsewhere');
    old.ws = ws;
  } else {
    const d: Defender = {
      ws,
      name,
      chog: pass.chog,
      guard,
      at: room.s.tick,
      cur: encodeDefender({ d: -1 }),
      moves: '',
    };
    room.defenders.set(name, d);
    room.s.guards[guard]!.human = name;
    const join = { t: 'join', guard, name, chog: pass.chog, who: displayName(getChog(pass.chog)!), k: d.at };
    send(room.robber.ws, join);
    for (const v of viewers(room)) send(v, join);
  }
  const me = room.defenders.get(name)!;
  ws.on('close', () => {
    if (me.ws !== ws) return;
    // Gone: their guard stands still from here on.
    me.cur = encodeDefender({ d: -1 });
    send(room.robber.ws, { t: 'di', name: me.name, k: room.s.tick, v: me.cur });
  });
  send(ws, {
    t: 'room',
    role: 'defend',
    you: me.guard,
    setup: setup(room),
    defenders: roster(room),
    s: room.s,
  });
  return (m) => {
    if (m.t === 'dv') {
      const d = typeof m.d === 'number' && m.d >= -1 && m.d <= 3 ? (Math.trunc(m.d) as Dir | -1) : -1;
      const input: DefenderInput = { d, ...(m.dash === true ? { dash: true } : {}) };
      const ch = encodeDefender(input);
      if (ch === me.cur) return;
      me.cur = ch;
      // Tell the robber exactly which step this lands on.
      send(room.robber.ws, { t: 'di', name: me.name, k: room.s.tick, v: ch });
    } else emote(room, m, pass.name);
  };
}

function emote(r: Room, m: Record<string, unknown>, from: string) {
  if (m.t !== 'em' || typeof m.k !== 'string' || m.k.length > 12) return;
  const out = { t: 'em', from, k: m.k };
  send(r.robber.ws, out);
  for (const v of viewers(r)) send(v, out);
}

/** One step of a room, with the robber's next key press (or standing still). */
function stepRoom(r: Room, input: RushInput) {
  const moves: Record<string, DefenderInput> = {};
  for (const d of r.defenders.values()) {
    d.moves += d.cur;
    moves[d.name] = decodeDefender(d.cur);
  }
  r.inputs += encodeOne(input);
  r.ev.push(...stepRush(r.s, r.map, r.rules, input, moves));
}

const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const encodeOne = (i: RushInput) => ABC[i.d + 1 + (i.use ? 5 : 0) + ((i.p ?? -1) + 1) * 10]!;

async function finish(r: Room) {
  r.ending = true;
  const defenders: DefenderLog[] = [...r.defenders.values()].map((d) => ({
    guard: d.guard,
    name: d.name,
    chog: d.chog,
    at: d.at,
    moves: d.moves,
  }));
  const body = JSON.stringify({ run: r.id, inputs: r.inputs, defenders });
  let result: unknown = null;
  for (let tryNo = 0; tryNo < 3 && !result; tryNo++) {
    try {
      const res = await fetch(`${WEB}/api/heist/live-finish`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-city-mac': signInternal(body) },
        body,
      });
      const d = (await res.json()) as { ok?: boolean; result?: unknown; error?: string };
      result = d.ok ? d.result : { error: d.error ?? 'failed' };
    } catch {
      await new Promise((ok) => setTimeout(ok, 500));
    }
  }
  const end = { t: 'end', result: result ?? { error: 'Could not save the run.' }, phase: r.s.phase };
  send(r.robber.ws, end);
  for (const v of viewers(r)) send(v, end);
  setTimeout(() => {
    for (const ws of [r.robber.ws, ...viewers(r)]) ws?.close(1000, 'over');
    rooms.delete(r.id);
  }, 15_000);
}

/** The heartbeat: thirty steps a second for every room, and a picture for defenders and watchers. */
setInterval(
  () => {
    const now = Date.now();
    for (const r of rooms.values()) {
      if (r.ending) continue;
      const q = r.robber.queue;
      if (q.length)
        for (let i = 0; i < CATCH_UP && q.length && r.s.phase === 'play'; i++) stepRoom(r, q.shift()!);
      else if (
        r.s.phase === 'play' &&
        ((r.robber.started && now - r.robber.lastAt > GONE_MS) ||
          (!r.robber.started && now - r.created > WAIT_MS))
      ) {
        // The robber is gone: the clock runs on, and they stand where they are.
        r.robber.started = true;
        stepRoom(r, { d: -1 });
      }
      if (r.s.phase !== 'play') {
        void finish(r);
        continue;
      }
      if (!r.defenders.size && !r.watchers.size) r.ev = [];
      else if (now - r.lastSnap >= 66) {
        r.lastSnap = now;
        const snap = JSON.stringify({ t: 'st', s: r.s, ev: r.ev });
        r.ev = [];
        for (const v of viewers(r)) if (v.readyState === v.OPEN) v.send(snap);
      }
      // A raid can't outlive its pass by much.
      if (now - r.created > 4 * 60_000) void finish(r);
    }
  },
  Math.round(DT * 1000),
);

/** Raids running now, for /health and for watchers. */
export const raidCount = () => rooms.size;
