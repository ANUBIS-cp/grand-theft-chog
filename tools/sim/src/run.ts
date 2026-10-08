// Balance simulator: bots play the real rules for N game days and we look at the numbers.
// Usage: npx tsx tools/sim/src/run.ts [days=21] [activeShare=0.15] [seed=1]
import {
  CHOGS,
  DISTRICT_IDS,
  GANG_IDS,
  GANGS,
  SKILLS,
  SKILL_IDS,
  gangOptions,
  type DistrictId,
  type GangId,
} from '@chog-city/data';
import * as G from '@chog-city/game';

const DAYS = Number(process.argv[2] ?? 21);
const ACTIVE_SHARE = Number(process.argv[3] ?? 0.15);
let rngState = Number(process.argv[4] ?? 1) >>> 0;
const rand = () => {
  rngState = (rngState + 0x6d2b79f5) >>> 0;
  let t = rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
const hex = () =>
  Array.from({ length: 32 }, () =>
    Math.floor(rand() * 256)
      .toString(16)
      .padStart(2, '0'),
  ).join('');

type Style = 'grinder' | 'robber' | 'casual' | 'crew' | 'guard';
interface Bot {
  info: G.ChogInfo;
  state: G.ChogState;
  style: Style;
  owner: number;
}

const START = G.dayStart(20_400);
const infos = CHOGS.map(G.infoOf);
const states: G.ChogState[] = CHOGS.map((c) => G.newChogState(c.id, START));
const bots: Bot[] = [];
let owner = 0;
for (const c of CHOGS) {
  if (rand() > ACTIVE_SHARE) continue;
  const info = infos[c.id - 1]!;
  const style: Style =
    info.skills.includes('guard') && rand() < 0.6
      ? 'guard'
      : pick([
          'grinder',
          'grinder',
          'grinder',
          'casual',
          'casual',
          'casual',
          'casual',
          'crew',
          'crew',
          'robber',
        ]);
  const opts = gangOptions(c);
  const gang: GangId = opts.born.length
    ? pick(opts.born)
    : pick(GANG_IDS.filter((g) => g !== 'skulls' && g !== 'radioactive'));
  const s = { ...states[c.id - 1]!, active: true, gang, gangDay: G.dayOf(START) };
  states[c.id - 1] = s;
  bots.push({ info, state: s, style, owner: owner++ });
}
const botById = new Map(bots.map((b) => [b.info.id, b]));
const get = (id: number) => (botById.get(id)?.state ?? states[id - 1])!;
const put = (s: G.ChogState) => {
  const b = botById.get(s.id);
  if (b) b.state = s;
  states[s.id - 1] = s;
};

let holders: Partial<Record<DistrictId, GangId>> = {};
const holdDays: Partial<Record<GangId, number>> = {};
const allEvents: G.GameEvent[] = [];
const errors: Record<string, number> = {};
let crewSeq = 0;
let movesSpent = 0;
let movesBlockedByJail = 0;
let sessionCount = 0;

const evOfOffer = (o: G.JobOffer, info: G.ChogInfo, s: G.ChogState, ctx: G.Ctx) => {
  const odds = G.jobOdds(o.job, [{ info, state: s }], o.district, ctx).odds / 100;
  return odds * o.pay - (1 - odds) * (o.job.jailChanceOnFail / 100) * 60;
};

for (let d = 0; d < DAYS; d++) {
  const day = G.dayOf(START) + d;
  const seed = hex();
  const board = G.fullBoard(day, new Set());
  const dayEvents: G.GameEvent[] = [];
  const openCrews: G.Crew[] = [];
  // Each gang leans toward the district where it scored most yesterday.
  const focus = new Map<GangId, DistrictId>();
  for (const g of GANG_IDS) focus.set(g, pick(DISTRICT_IDS.filter((x) => x !== 'radioactive-zone')));

  // Sessions spread over the day.
  type Session = { at: number; bot: Bot; moves: number };
  const sessions: Session[] = [];
  for (const b of bots) {
    if (b.style === 'casual' && rand() < 0.5) continue;
    const moves = b.style === 'casual' ? 2 : 5;
    const n = b.style === 'casual' ? 1 : 2;
    for (let i = 0; i < n; i++)
      sessions.push({
        at: G.dayStart(day) + Math.floor(rand() * 23.5 * G.HOUR),
        bot: b,
        moves: Math.ceil(moves / n),
      });
  }
  sessions.sort((a, b) => a.at - b.at);
  sessionCount += sessions.length;

  for (const sess of sessions) {
    const b = sess.bot;
    for (let m = 0; m < sess.moves; m++) {
      const ctx: G.Ctx = { now: sess.at + m * 60_000, seed, holders, events: new Set() };
      let s = G.refresh(b.state, ctx.now);
      put(s);
      if (G.inJail(s, ctx.now)) {
        movesBlockedByJail++;
        const cost = G.bailCost(s, ctx.now);
        if (cost && cost <= s.cash * 0.3) {
          const r = G.payBail(ctx, s, s);
          if (r.ok) put(r.value.target);
        }
        break;
      }
      if (G.movesLeft(s, ctx.now) <= 0) break;
      const record = (r: G.Result<unknown>, events: G.GameEvent[] = []) => {
        if (!r.ok) errors[r.error] = (errors[r.error] ?? 0) + 1;
        else {
          dayEvents.push(...events);
          movesSpent++;
        }
        return r.ok;
      };

      // Revenge first.
      const rev = s.revenge[0];
      if (rev) {
        const t = get(rev.against);
        const r = G.rob(ctx, b.info, s, infos[rev.against - 1]!, t, { sameOwner: false });
        if (record(r, r.ok ? r.value.events : [])) {
          if (r.ok) {
            put(r.value.attacker);
            put(r.value.target);
          }
          continue;
        }
      }
      if (b.style === 'robber' && rand() < 0.6) {
        const cands = Array.from({ length: 10 }, () => pick(CHOGS).id).filter((id) => id !== b.info.id);
        const target = cands.sort((x, y) => get(y).cash - get(x).cash)[0]!;
        const r = G.rob(ctx, b.info, s, infos[target - 1]!, get(target), { sameOwner: false });
        if (record(r, r.ok ? r.value.events : []) && r.ok) {
          put(r.value.attacker);
          put(r.value.target);
          continue;
        }
      }
      if (b.style === 'guard') {
        const wanted = bots.filter(
          (x) => G.currentWanted(x.state, ctx.now) >= 3 && !G.inJail(x.state, ctx.now) && x !== b,
        );
        if (wanted.length) {
          const t = pick(wanted);
          const r = G.arrest(ctx, b.info, s, t.info, t.state, { sameOwner: false });
          if (record(r, r.ok ? r.value.events : []) && r.ok) {
            put(r.value.attacker);
            put(r.value.target);
            continue;
          }
        }
      }
      if (G.levelOf(s.xp) >= 2 && (b.style === 'crew' || rand() < 0.35)) {
        // Join an open crew if there is a slot we fit.
        let joined = false;
        for (const c of openCrews) {
          if (c.status !== 'open' || s.crewId) continue;
          const offer = G.findOffer(c.day, c.offerKey, ctx.events)!;
          const slot = c.slots.findIndex((x, i) => x === null && G.canFill(b.info, offer.job.slots[i]!));
          if (slot < 0) continue;
          const r = G.joinCrew(ctx, c, b.info, s, slot);
          if (!r.ok) continue;
          Object.assign(c, r.value.crew);
          s = r.value.state;
          put(s);
          movesSpent++;
          joined = true;
          if (r.value.full) {
            const members = c.slots.map((id) => ({ info: infos[id! - 1]!, state: get(id!) }));
            const out = G.resolveCrew(ctx, c, members);
            if (out.ok) {
              Object.assign(c, out.value.crew);
              out.value.members.forEach(put);
              dayEvents.push(...out.value.events);
            }
          }
          break;
        }
        if (joined) continue;
        if (!s.crewId && (b.style === 'crew' || rand() < 0.3)) {
          const crewJobs = board.filter(
            (o) =>
              (o.job.kind === 'crew' || o.job.kind === 'big') &&
              !o.job.special &&
              G.levelOf(s.xp) >= o.job.minLevel,
          );
          const options = crewJobs.flatMap((o) =>
            o.job.slots.map((slot, i) => ({ o, i, slot })).filter((x) => G.canFill(b.info, x.slot)),
          );
          const prefer = options.filter((x) => x.o.district === focus.get(s.gang!));
          const choice = prefer.length && rand() < 0.6 ? pick(prefer) : options.length ? pick(options) : null;
          if (choice) {
            const r = G.openCrew(ctx, `${day}-${++crewSeq}`, b.info, s, choice.o.key, choice.i);
            if (r.ok) {
              openCrews.push(r.value.crew);
              put(r.value.state);
              movesSpent++;
              continue;
            }
          }
        }
      }
      // Best solo/legal job by expected value, leaning to the gang's focus district.
      const solos = board.filter(
        (o) =>
          (o.job.kind === 'solo' || o.job.kind === 'legal') &&
          G.canFill(b.info, o.job.slots[0]!) &&
          !s.doneToday.includes(o.key),
      );
      if (!solos.length) break;
      const scored = solos.map((o) => ({
        o,
        v:
          evOfOffer(o, b.info, s, ctx) * (o.district === focus.get(s.gang!) ? 1.3 : 1) * (0.8 + rand() * 0.4),
      }));
      scored.sort((x, y) => y.v - x.v);
      const r = G.doSoloJob(ctx, b.info, s, scored[0]!.o.key);
      if (record(r, r.ok ? r.value.events : []) && r.ok) put(r.value.state);
    }
  }
  // Day end: crews expire, turf flips.
  for (const c of openCrews.filter((x) => x.status === 'open'))
    for (const id of c.slots) if (id) put(G.clearExpired(get(id), c));
  const scores = G.turfScores(dayEvents);
  holders = G.flipTurf(holders, scores).holders;
  for (const g of Object.values(holders)) if (g) holdDays[g] = (holdDays[g] ?? 0) + 1;
  allEvents.push(...dayEvents);
}

// ---------- report ----------
const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(1) + '%' : '-');
const jobs = allEvents.filter((e): e is Extract<G.GameEvent, { type: 'job' }> => e.type === 'job');
const robs = allEvents.filter((e): e is Extract<G.GameEvent, { type: 'rob' }> => e.type === 'rob');
const arrests = allEvents.filter((e) => e.type === 'arrest');
console.log(
  `\n${DAYS} days, ${bots.length} active Chogs (${(ACTIVE_SHARE * 100).toFixed(0)}%), ${movesSpent} moves`,
);
const kinds = ['legal', 'solo', 'crew', 'big'] as const;
for (const k of kinds) {
  const js = jobs.filter((e) => G.JOBS_BY_ID.get(e.jobId)!.kind === k);
  console.log(
    `  ${k.padEnd(6)} jobs ${String(js.length).padStart(6)}  success ${pct(js.filter((e) => e.success).length, js.length)}`,
  );
}
console.log(
  `  robberies ${robs.length}, success ${pct(robs.filter((e) => e.success).length, robs.length)}, revenge ${robs.filter((e) => e.revenge).length}; arrests ${arrests.length}`,
);
console.log(
  `  sessions cut short by jail: ${movesBlockedByJail} of ${sessionCount} (${pct(movesBlockedByJail, sessionCount)}); rejected moves: ${JSON.stringify(errors)}`,
);

const byStyle = new Map<Style, number[]>();
for (const b of bots) {
  if (!byStyle.has(b.style)) byStyle.set(b.style, []);
  byStyle.get(b.style)!.push(b.state.cash);
}
console.log('\nCash after the run (median / max) by style:');
for (const [st, xs] of byStyle) {
  xs.sort((a, b) => a - b);
  console.log(
    `  ${st.padEnd(8)} n=${String(xs.length).padStart(3)}  median ${xs[Math.floor(xs.length / 2)]}  max ${xs[xs.length - 1]}`,
  );
}
const levels = new Map<number, number>();
for (const b of bots) levels.set(G.levelOf(b.state.xp), (levels.get(G.levelOf(b.state.xp)) ?? 0) + 1);
console.log(
  'Levels:',
  [...levels.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([l, n]) => `L${l}:${n}`)
    .join(' '),
);

console.log('\nDistrict-days held per gang (members active):');
const members = new Map<GangId, number>();
for (const b of bots) if (b.state.gang) members.set(b.state.gang, (members.get(b.state.gang) ?? 0) + 1);
for (const g of [...GANG_IDS].sort((a, b) => (holdDays[b] ?? 0) - (holdDays[a] ?? 0)))
  console.log(
    `  ${GANGS[g].name.padEnd(12)} ${String(holdDays[g] ?? 0).padStart(3)}   (${members.get(g) ?? 0} active)`,
  );

console.log('\nAverage cash earned per active Chog, by skill:');
const earned = new Map<string, number[]>();
for (const b of bots)
  for (const k of b.info.skills) {
    if (!earned.has(k)) earned.set(k, []);
    earned.get(k)!.push(b.state.stats.cashEarned);
  }
for (const k of SKILL_IDS) {
  const xs = earned.get(k) ?? [];
  const avg = xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0;
  console.log(`  ${SKILLS[k].name.padEnd(9)} n=${String(xs.length).padStart(3)}  avg earned ${avg}`);
}
