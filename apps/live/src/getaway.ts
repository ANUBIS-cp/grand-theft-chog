import { CHOGS } from '@chog-city/data';
import {
  CITY,
  Ground,
  WALK_SPEED,
  doorAt,
  groundAt,
  placeOf,
  route,
  slide,
  standable,
  type Place,
} from '@chog-city/game/city';
import { readGetawayPass, signInternal, type GetawayPass } from '@chog-city/server/ticket';

// Stage 3 of a robbery: you come out of the robbed gang's door with the bag and have to carry it to your own
// gang's door through the live city. Police come for you, and Chogs of the robbed gang who are online can
// tag you themselves. Everyone in the city sees it. This server is the referee and tells the web app how it
// ended, signed, so the bag lands in the right vault.

const WEB = process.env.WEB_INTERNAL_URL ?? 'http://127.0.0.1:3000';
/**
 * Police on foot, each with a job: two come out of the robbed door after you, one heads for a spot ahead of
 * you on your way home to cut you off, and for a well-defended vault one waits at your own door.
 */
export const COP_SPEED = { chase: 3.85, cut: 3.6, door: 3.4 };
/** How far ahead of you (in tiles along your way home) a cut-off cop aims. */
const CUT_AHEAD = 9;
/** A cop waiting at your door comes at you once you're this close. */
const DOOR_RANGE = 5;
/** Seconds out of the door before the police run and anyone can tag you. */
const HEAD_START = 2;
const CATCH = 0.62;
/** A robbed-gang Chog has to reach you; a little more forgiving than the police. */
const TAG = 0.8;
/** You lost connection mid-run: the run waits this long for you to come back. */
const GONE_MS = 10_000;

export interface Runner {
  id: number;
  chog: number | null;
  gang: string | null;
  x: number;
  y: number;
  jail: number | null;
}

interface Cop {
  id: number;
  chog: number;
  job: 'chase' | 'cut' | 'door';
  x: number;
  y: number;
  face: -1 | 1;
  moving: boolean;
  path: { x: number; y: number }[];
  repath: number;
}

interface Chase {
  pass: GetawayPass;
  player: number;
  from: Place;
  home: Place;
  started: number;
  until: number;
  cops: Cop[];
  goneAt: number | null;
  over: boolean;
}

const chases = new Map<string, Chase>();
let nextCop = 1;

/** Ids for police start far below the strollers' (which are minus a Chog's token ID). */
const COP_BASE = -100_000;

function seeded(n: number) {
  let s = n | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Road tiles between `min` and `max` tiles (by walk) from a spot: where police start. */
function roadSpots(x: number, y: number, min: number, max: number) {
  const out: { x: number; y: number }[] = [];
  for (let ty = 0; ty < CITY.h; ty++)
    for (let tx = 0; tx < CITY.w; tx++) {
      const g = groundAt(tx, ty);
      if ((g !== Ground.Road && g !== Ground.Cross) || !standable(tx + 0.5, ty + 0.5)) continue;
      const d = Math.abs(tx + 0.5 - x) + Math.abs(ty + 0.5 - y);
      if (d >= min && d <= max) out.push({ x: tx + 0.5, y: ty + 0.5 });
    }
  return out;
}

/** How long you get: the walk home at full speed, half again, plus a little. */
function timeFor(from: Place, home: Place) {
  const r = route(from.door.x, from.door.y, home.door.x, home.door.y);
  const tiles = r ? r.length : 60;
  return Math.round(((tiles / WALK_SPEED) * 1.5 + 12) * 1000);
}

export type ChaseInfo = ReturnType<typeof chaseInfo>;
const chaseInfo = (c: Chase) => ({
  run: c.pass.run,
  id: c.player,
  chog: c.pass.chog,
  name: c.pass.name,
  bag: c.pass.bag,
  from: c.pass.from,
  home: c.pass.home,
  until: c.until,
  cops: c.cops.map((k) => ({ id: k.id, chog: k.chog })),
});

/** Getaways running now, to tell someone who just walked into the city. */
export const chasesNow = () => [...chases.values()].filter((c) => !c.over).map(chaseInfo);

/**
 * A robber asks to start (or carry on) a getaway. Returns where they must stand (the robbed building's door
 * on a new run), or null if the pass isn't theirs or the run is over.
 */
export function startChase(
  p: Runner,
  passText: unknown,
  now: number,
  broadcast: (msg: unknown) => void,
): { x: number; y: number } | null {
  if (typeof passText !== 'string') return null;
  const pass = readGetawayPass(passText, now);
  if (!pass || pass.chog !== p.chog) return null;
  const have = chases.get(pass.run);
  if (have) {
    if (have.over) return null;
    // Back after losing the connection: same run, carry on from where they are.
    have.player = p.id;
    have.goneAt = null;
    broadcast({ t: 'chase', ...chaseInfo(have) });
    return null;
  }
  const from = placeOf(pass.from);
  const home = placeOf(pass.home);
  if (!from || !home) return null;
  const rand = seeded(pass.run.length * 7919 + pass.bag);
  const jobs: Cop['job'][] = ['chase', 'chase', 'cut', ...(pass.tier >= 2 ? (['door'] as const) : [])];
  const far = roadSpots(from.door.x, from.door.y, 14, 26);
  const cops: Cop[] = jobs.map((job, i) => {
    // Chasers come out of the robbed building's door; the cut-off cop starts out in the streets; the door
    // guard starts at your door.
    const at =
      job === 'chase'
        ? { x: from.door.x + (i ? 0.5 : -0.5), y: from.door.y }
        : job === 'door'
          ? { x: home.door.x, y: home.door.y + 1 }
          : (far[Math.floor(rand() * far.length)] ?? { ...CITY.spawn });
    return {
      id: COP_BASE - nextCop++,
      chog: CHOGS[Math.floor(rand() * CHOGS.length)]!.id,
      job,
      x: at.x,
      y: at.y,
      face: 1,
      moving: false,
      path: [],
      repath: 0,
    };
  });
  const c: Chase = {
    pass,
    player: p.id,
    from,
    home,
    started: now,
    until: now + timeFor(from, home),
    cops,
    goneAt: null,
    over: false,
  };
  chases.set(pass.run, c);
  broadcast({ t: 'chase', ...chaseInfo(c) });
  return { x: from.door.x, y: from.door.y + 0.6 };
}

async function report(c: Chase, outcome: 'home' | 'caught', by: number | null) {
  const body = JSON.stringify({ run: c.pass.run, outcome, by });
  for (let tryNo = 0; tryNo < 3; tryNo++) {
    try {
      const res = await fetch(`${WEB}/api/heist/getaway-finish`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-city-mac': signInternal(body) },
        body,
      });
      if (res.ok || res.status === 409) return;
    } catch {
      /* try again */
    }
    await new Promise((ok) => setTimeout(ok, 500));
  }
  // Still nothing: the web app banks it itself after a few minutes.
}

function end(
  c: Chase,
  outcome: 'home' | 'caught',
  by: { chog: number | null; who: 'police' | 'gang' | 'time' } | null,
  broadcast: (msg: unknown) => void,
) {
  c.over = true;
  void report(c, outcome, by?.chog ?? null);
  broadcast({
    t: 'chase-end',
    run: c.pass.run,
    id: c.player,
    chog: c.pass.chog,
    outcome,
    by: by?.chog ?? null,
    who: by?.who ?? null,
    bag: c.pass.bag,
  });
  setTimeout(() => chases.delete(c.pass.run), 30_000);
}

/** One tick of every getaway: police run at you, and it ends at your door, on a catch or when time's up. */
export function stepChases(
  dt: number,
  now: number,
  runners: Map<number, Runner>,
  broadcast: (msg: unknown) => void,
) {
  for (const c of chases.values()) {
    if (c.over) continue;
    const me = runners.get(c.player);
    if (!me) {
      c.goneAt ??= now;
      if (now - c.goneAt > GONE_MS) end(c, 'caught', { chog: null, who: 'police' }, broadcast);
      continue;
    }
    if (doorAt(me.x, me.y)?.id === c.home.id) {
      end(c, 'home', null, broadcast);
      continue;
    }
    if (now > c.until) {
      end(c, 'caught', { chog: null, who: 'time' }, broadcast);
      continue;
    }
    // Nobody can touch you in the first moments out of the door (no camping it).
    if (now - c.started < HEAD_START * 1000) continue;
    // A Chog of the robbed gang that reaches you takes the bag back.
    let tagged: number | null = null;
    for (const r of runners.values())
      if (
        r.id !== me.id &&
        r.chog !== null &&
        r.gang === c.pass.from &&
        !(r.jail && r.jail > now) &&
        Math.hypot(r.x - me.x, r.y - me.y) < TAG
      )
        tagged = r.chog;
    if (tagged !== null) {
      end(c, 'caught', { chog: tagged, who: 'gang' }, broadcast);
      continue;
    }
    let ahead: { x: number; y: number } | null = null;
    for (const k of c.cops) {
      const near = Math.hypot(k.x - me.x, k.y - me.y);
      k.repath -= dt;
      if (k.repath <= 0 || !k.path.length) {
        k.repath = 0.35 + (Math.abs(k.id) % 5) * 0.04;
        // Close up, every job runs straight at you.
        let goal = { x: me.x, y: me.y };
        if (k.job === 'cut' && near > 4) {
          if (!ahead) {
            const way = route(me.x, me.y, c.home.door.x, c.home.door.y) ?? [];
            ahead = way[Math.min(CUT_AHEAD, way.length - 1)] ?? goal;
          }
          goal = ahead;
        } else if (k.job === 'door' && Math.hypot(me.x - c.home.door.x, me.y - c.home.door.y) > DOOR_RANGE)
          goal = { x: c.home.door.x, y: c.home.door.y + 1 };
        k.path = route(k.x, k.y, goal.x, goal.y) ?? [];
        k.path.push(goal);
      }
      let left = COP_SPEED[k.job] * dt;
      k.moving = false;
      while (left > 0 && k.path.length) {
        const to = k.path[0]!;
        const dx = to.x - k.x;
        const dy = to.y - k.y;
        const d = Math.hypot(dx, dy);
        if (Math.abs(dx) > 0.05) k.face = dx < 0 ? -1 : 1;
        if (d <= left) {
          ({ x: k.x, y: k.y } = slide(k.x, k.y, dx, dy));
          k.path.shift();
          left -= d;
        } else {
          ({ x: k.x, y: k.y } = slide(k.x, k.y, (dx / d) * left, (dy / d) * left));
          left = 0;
        }
        k.moving = true;
      }
      if (Math.hypot(k.x - me.x, k.y - me.y) < CATCH) {
        end(c, 'caught', { chog: null, who: 'police' }, broadcast);
        break;
      }
    }
  }
}

/** Police positions for the ten-a-second picture: id, x, y and facing/moving, as in the people list. */
export function copPositions(): number[] {
  const d: number[] = [];
  for (const c of chases.values())
    if (!c.over)
      for (const k of c.cops)
        d.push(k.id, Math.round(k.x * 100), Math.round(k.y * 100), (k.face < 0 ? 1 : 0) | (k.moving ? 2 : 0));
  return d;
}

/** The run a Chog is carrying a bag on, if any (so it can't be put somewhere else). */
export const runningFor = (chog: number) =>
  [...chases.values()].find((c) => !c.over && c.pass.chog === chog)?.pass.run ?? null;
