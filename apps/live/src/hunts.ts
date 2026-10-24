import { bloodMoon, isHalloweenWeek } from '@chog-city/game';
import { PUMPKIN_GRAB, placeOf, pumpkinSpots } from '@chog-city/game/city';
import { signInternal } from '@chog-city/server/ticket';
import { runningFor } from './getaway.ts';

// The city's two live hunts. This server is the referee for both and tells the web app the result, signed.
//
// Pumpkin Rush (Halloween): pumpkins full of cash appear on the streets. The first Chog to reach one carries it
// home for its gang: a few at a time all through the Blood Moon hour (18:00 UTC), one now and then the rest of
// the week. A gold one is rare and worth much more.
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
}

const pumpkins = new Map<string, Pumpkin>();
let nextPumpkin = 0;
export const pumpkinsNow = () => [...pumpkins.values()];

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
  const on = moon || isHalloweenWeek(now) || ALWAYS;
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
  for (const p of pumpkins.values())
    for (const h of hunters) {
      if (h.chog === null || h.gang === null || jailedNow(h, now)) continue;
      if (Math.hypot(h.x - p.x, h.y - p.y) > PUMPKIN_GRAB) continue;
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

/**
 * One tick of Most Wanted: a Chog of another gang that reaches today's Most Wanted claims the bounty. The web
 * app moves the cash and jails them; then `jail` moves them to the jail yard here.
 */
export function stepWanted(
  now: number,
  hunters: Iterable<Hunter>,
  broadcast: (msg: unknown) => void,
  jail: (h: Hunter, until: number) => void,
) {
  const w = wanted;
  if (!w || w.claimed || tagging) return;
  const list = [...hunters];
  const prey = list.find((h) => h.chog === w.chog);
  if (!prey || jailedNow(prey, now) || now - prey.joined < ARRIVE_SAFE_MS || runningFor(w.chog)) return;
  const home = placeOf(w.gang);
  if (home && Math.hypot(prey.x - home.door.x, prey.y - home.door.y) < HOME_SAFE) return;
  const by = list.find(
    (h) =>
      h.id !== prey.id &&
      h.chog !== null &&
      h.gang !== null &&
      h.gang !== w.gang &&
      !jailedNow(h, now) &&
      Math.hypot(h.x - prey.x, h.y - prey.y) < TAG,
  );
  if (!by) return;
  tagging = true;
  void post('/api/city/wanted-tag', JSON.stringify({ day: w.day, chog: w.chog, by: by.chog, at: now }))
    .then(async (res) => {
      if (!res?.ok) return;
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
      jail(prey, r.jailedUntil);
    })
    .finally(() => {
      tagging = false;
    });
}
