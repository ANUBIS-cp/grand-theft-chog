import {
  HEAD_START,
  doorAt,
  getawayTime,
  placeOf,
  seeded,
  spawnCops,
  stepCops,
  type Cop,
  type Place,
} from '@chog-city/game/city';
import { readGetawayPass, signInternal, type GetawayPass } from '@chog-city/server/ticket';

// Stage 3 of a robbery: you come out of the robbed gang's door with the bag and have to carry it to your own
// gang's door through the live city. Police come for you (packages/game/src/city/police.ts), and Chogs of the
// robbed gang who are online can tag you themselves. Everyone in the city sees it. This server is the
// referee and tells the web app how it ended, signed, so the bag lands in the right vault.

const WEB = process.env.WEB_INTERNAL_URL ?? 'http://127.0.0.1:3000';
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
/** Ids for police start far below the strollers' (which are minus a Chog's token ID). */
let nextCop = -100_000;

export type ChaseInfo = ReturnType<typeof chaseInfo>;
const chaseInfo = (c: Chase) => ({
  run: c.pass.run,
  id: c.player,
  chog: c.pass.chog,
  name: c.pass.name,
  bag: c.pass.bag,
  from: c.pass.from,
  home: c.pass.home,
  since: c.started,
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
  const cops = spawnCops(from, home.door, pass.tier, seeded(pass.run.length * 7919 + pass.bag), nextCop);
  nextCop -= cops.length;
  const c: Chase = {
    pass,
    player: p.id,
    from,
    home,
    started: now,
    until: now + getawayTime(from.door, home.door),
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
    if (stepCops(c.cops, me, c.home.door, dt)) end(c, 'caught', { chog: null, who: 'police' }, broadcast);
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
