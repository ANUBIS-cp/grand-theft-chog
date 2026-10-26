import { bloodMoon, halloweenCity } from '@chog-city/game';
import { CITY, HOP, PUMPKIN_GRAB, hopAway, placeOf, pumpkinSpots } from '@chog-city/game/city';
import { signInternal } from '@chog-city/server/ticket';
import { runningFor } from './getaway.ts';

// The city's two live hunts. This server is the referee for both and tells the web app the result, signed.
//
// Pumpkin Rush (Halloween): pumpkins full of cash appear on the streets. The first Chog to reach one carries it
// home for its gang: a few at a time all through the Blood Moon, one now and then the rest of Halloween (during
// judging Halloween comes and goes with the moon, packages/game/src/season.ts, and at moonset the pumpkins go).
// A gold one is rare and worth much more.
//
// Most Wanted (every day): yesterday's best robber has a bounty on their head, paid by their own gang. While
// they're in the city, a Chog of any other gang that reaches them claims it, and they go to jail. Their own
// gang's doorstep is safe.

const WEB = process.env.WEB_INTERNAL_URL ?? 'http://127.0.0.1:3000';
/** PUMPKINS=always: pumpkins all the time, for local testing (never set on the real server). */
const ALWAYS = process.env.PUMPKINS === 'always';
const TAG = 0.8;
/** Most Wanted: safe this close to their own gang's door, and for this long after walking into the city. */
const HOME_SAFE = 4;
const ARRIVE_SAFE_MS = 8000;
const DOOR_SAFE = 2.5;

export interface Hunter {
  id: number;
  chog: number | null;
  name: string;
  gang: string | null;
  x: number;
  y: number;
  jail: number | null;
  joined: number;
}

export interface Pumpkin {
  id: string;
  x: number;
  y: number;
  cash: number;
  gold: boolean;
  until: number;
  /** When it may hop away next (ms; see hopAway). */
  next?: number;
  /** Where it last hopped from, and when: still catchable there for a moment (see reaches). */
  was?: { x: number; y: number; at: number };
}

/**
 * Lag compensation for the grab, the way Valve's servers judge a hit by what the player saw rather than by the
 * server's own later view (developer.valvesoftware.com/wiki/Lag_Compensation). Two gaps between your screen and
 * this server: your position arrives a tick or two late and in steps, so the whole stretch you ran since the last
 * tick counts, not just where you are now; and a pumpkin that has just hopped is still drawn mid-air near where
 * it was, so for a moment after a hop reaching that spot counts too.
 */
const HOP_GRACE_MS = HOP.air + 200;
/** A jump longer than this between ticks is a move across the map (out of a vault), not a run. */
const MAX_STRIDE = 2.5;
const lastAt = new Map<number, { x: number; y: number }>();

/** How close the line from (ax, ay) to (bx, by) comes to (px, py). */
export function segmentGap(ax: number, ay: number, bx: number, by: number, px: number, py: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const k = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  return Math.hypot(ax + dx * k - px, ay + dy * k - py);
}

/** Did this Chog reach the pumpkin this tick (anywhere on its way here, at the pumpkin or where it just hopped from)? */
export function reaches(
  from: { x: number; y: number } | undefined,
  h: { x: number; y: number },
  p: Pumpkin,
  now: number,
): boolean {
  const a = from && Math.hypot(h.x - from.x, h.y - from.y) <= MAX_STRIDE ? from : h;
  if (segmentGap(a.x, a.y, h.x, h.y, p.x, p.y) <= PUMPKIN_GRAB) return true;
  return (
    !!p.was &&
    now - p.was.at < HOP_GRACE_MS &&
    segmentGap(a.x, a.y, h.x, h.y, p.was.x, p.was.y) <= PUMPKIN_GRAB
  );
}

const pumpkins = new Map<string, Pumpkin>();
let nextPumpkin = 0;
/** The pumpkins as players see them (where one hopped from is the referee's business). */
export const pumpkinsNow = () => [...pumpkins.values()].map(({ was: _was, ...p }) => p);

async function post(path: string, body: string): Promise<Response | null> {
  for (let tryNo = 0; tryNo < 3; tryNo++) {
    try {
      const res = await fetch(`${WEB}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-city-mac': signInternal(body) },
        body,
      });
      if (res.ok || res.status === 409 || res.status === 400) return res;
    } catch {
      /* try again */
    }
    await new Promise((ok) => setTimeout(ok, 400));
  }
  return null;
}

const jailedNow = (h: Hunter, now: number) => h.jail !== null && h.jail > now;

/** One tick of Pumpkin Rush: pumpkins appear and go, and the first Chog to reach one takes it. */
export function stepPumpkins(
  now: number,
  hunters: Iterable<Hunter>,
  broadcast: (msg: unknown) => void,
  rand: () => number,
) {
  const moon = bloodMoon(now) !== null || (ALWAYS && Math.floor(now / 600_000) % 2 === 0);
  const on = moon || halloweenCity(now) || ALWAYS;
  let changed = false;
  for (const p of pumpkins.values())
    if (now > p.until || !on) {
      pumpkins.delete(p.id);
      changed = true;
    }
  if (on && now >= nextPumpkin && pumpkins.size < (moon ? 5 : 1)) {
    const all = pumpkinSpots();
    // Somewhere new: not on top of another pumpkin.
    for (let k = 0; k < 12; k++) {
      const s = all[Math.floor(rand() * all.length)]!;
      if ([...pumpkins.values()].some((p) => Math.hypot(p.x - s.x, p.y - s.y) < 8)) continue;
      const gold = rand() < (moon ? 0.12 : 0.05);
      const p: Pumpkin = {
        id: `${now.toString(36)}${Math.floor(rand() * 1e6).toString(36)}`,
        x: s.x,
        y: s.y,
        gold,
        cash: gold ? 1500 : (moon ? 300 : 200) + Math.floor(rand() * 5) * 50,
        until: now + (moon ? 150_000 : 600_000),
      };
      pumpkins.set(p.id, p);
      changed = true;
      break;
    }
    nextPumpkin = now + (moon ? 30_000 + rand() * 25_000 : 5 * 60_000 + rand() * 5 * 60_000);
  }
  // Pumpkins hop away from any Chog that comes near: everyone sees the same hop.
  const chasers = [...hunters].filter((h) => h.chog !== null && h.gang !== null && !jailedNow(h, now));
  for (const p of pumpkins.values()) {
    const to = hopAway(p, chasers, now, rand);
    if (!to) continue;
    broadcast({ t: 'pk-hop', id: p.id, fx: p.x, fy: p.y, x: to.x, y: to.y });
    p.was = { x: p.x, y: p.y, at: now };
    p.x = to.x;
    p.y = to.y;
  }
  for (const p of pumpkins.values())
    for (const h of hunters) {
      if (h.chog === null || h.gang === null || jailedNow(h, now)) continue;
      if (!reaches(lastAt.get(h.id), h, p, now)) continue;
      pumpkins.delete(p.id);
      changed = true;
      broadcast({
        t: 'pk-got',
        id: p.id,
        chog: h.chog,
        name: h.name,
        gang: h.gang,
        cash: p.cash,
        gold: p.gold,
        x: p.x,
        y: p.y,
      });
      void post(
        '/api/city/pumpkin',
        JSON.stringify({ id: p.id, chog: h.chog, gang: h.gang, cash: p.cash, gold: p.gold, at: now }),
      );
      break;
    }
  if (changed) broadcast({ t: 'pk', list: pumpkinsNow() });
  // Where everyone was this tick, for next tick's stretch (players who left are forgotten).
  const here = new Set<number>();
  for (const h of hunters) {
    lastAt.set(h.id, { x: h.x, y: h.y });
    here.add(h.id);
  }
  for (const id of lastAt.keys()) if (!here.has(id)) lastAt.delete(id);
}

export interface Wanted {
  day: number;
  chog: number;
  name: string;
  gang: string;
  bounty: number;
  claimed: boolean;
}

let wanted: Wanted | null = null;
let wantedKey = '';
let tagging = false;

export const wantedNow = () => wanted;

/** Asks the web app who's Most Wanted today (every 20 s). */
export async function pollWanted(broadcast: (msg: unknown) => void) {
  try {
    const res = await fetch(`${WEB}/api/city/wanted`, { cache: 'no-store' });
    if (!res.ok) return;
    const d = (await res.json()) as { wanted: Wanted | null };
    const w = d.wanted;
    if (tagging) return;
    const key = JSON.stringify(w);
    if (key === wantedKey) return;
    wantedKey = key;
    wanted = w;
    broadcast({ t: 'wanted', w });
  } catch {
    /* next time */
  }
}

/** Why today's Most Wanted can't be caught right now, or null when they can. */
export type WantedSafe = 'away' | 'jail' | 'arriving' | 'running' | 'home' | 'door';
let safeNow: WantedSafe | null = null;
export const wantedSafeNow = () => safeNow;
/** Hunters told recently why they can't catch them (by player id: until when), so it's said once, not every tick. */
const told = new Map<number, number>();
const TELL_MS = 6000;

/**
 * One tick of Most Wanted: a Chog of another gang that reaches today's Most Wanted claims the bounty. The web
 * app moves the cash and jails them; then `jail` moves them to the jail yard here. Everyone is told when they're
 * safe and why (their name tag shows it), and a hunter who reaches them while they're safe, or whose catch is
 * refused, is told why once (`tell`), instead of nothing happening.
 */
export function stepWanted(
  now: number,
  hunters: Iterable<Hunter>,
  broadcast: (msg: unknown) => void,
  jail: (h: Hunter, until: number) => void,
  tell: (h: Hunter, msg: unknown) => void,
) {
  const w = wanted;
  if (!w || w.claimed) {
    setSafe(null, broadcast);
    return;
  }
  if (tagging) return;
  const list = [...hunters];
  const prey = list.find((h) => h.chog === w.chog);
  const home = placeOf(w.gang);
  const safe: WantedSafe | null = !prey
    ? 'away'
    : jailedNow(prey, now)
      ? 'jail'
      : now - prey.joined < ARRIVE_SAFE_MS
        ? 'arriving'
        : runningFor(w.chog)
          ? 'running'
          : home && Math.hypot(prey.x - home.door.x, prey.y - home.door.y) < HOME_SAFE
            ? 'home'
            : // Every doorstep is safe too: a robber breaking in, or inside a vault, stands at that gang's door.
              CITY.places.some((p) => Math.hypot(prey.x - p.door.x, prey.y - p.door.y) < DOOR_SAFE)
              ? 'door'
              : null;
  setSafe(safe, broadcast);
  if (!prey) return;
  for (const [id, until] of told) if (until < now) told.delete(id);
  const near = list.filter(
    (h) => h.id !== prey.id && h.chog !== null && Math.hypot(h.x - prey.x, h.y - prey.y) < TAG,
  );
  const say = (h: Hunter, why: string) => {
    if (told.has(h.id)) return;
    told.set(h.id, now + TELL_MS);
    tell(h, { t: 'wanted-no', why });
  };
  for (const h of near) {
    if (safe) say(h, safe);
    else if (h.gang === null) say(h, 'no-gang');
    else if (h.gang === w.gang) say(h, 'own-gang');
    else if (jailedNow(h, now)) say(h, 'you-jailed');
  }
  if (safe) return;
  const by = near.find((h) => h.gang !== null && h.gang !== w.gang && !jailedNow(h, now) && !told.has(h.id));
  if (!by) return;
  tagging = true;
  void post('/api/city/wanted-tag', JSON.stringify({ day: w.day, chog: w.chog, by: by.chog, at: now }))
    .then(async (res) => {
      if (!res?.ok) {
        // Refused (their own other Chog, a new day...): say why, and don't ask again for a few seconds.
        const why = ((await res?.json().catch(() => null)) as { error?: string } | null)?.error ?? 'refused';
        say(by, why);
        return;
      }
      const r = (await res.json()) as { bounty: number; jailedUntil: number };
      w.claimed = true;
      wantedKey = JSON.stringify(w);
      broadcast({
        t: 'wanted-got',
        chog: w.chog,
        name: w.name,
        gang: w.gang,
        by: by.chog,
        byName: by.name,
        byGang: by.gang,
        bounty: r.bounty,
      });
      broadcast({ t: 'wanted', w });
      setSafe(null, broadcast);
      jail(prey!, r.jailedUntil);
    })
    .finally(() => {
      tagging = false;
    });
}

function setSafe(next: WantedSafe | null, broadcast: (msg: unknown) => void) {
  if (next === safeNow) return;
  safeNow = next;
  broadcast({ t: 'wanted-safe', why: next });
}
