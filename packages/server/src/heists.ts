import { CHOGS, GANG_IDS, canJoinGang, gangOptions, getChog, type GangId } from '@chog-city/data';
import { chogInfo, dayOf } from '@chog-city/game';
import {
  JAIL_MS,
  JAIL_TIER,
  REVENGE_MS,
  RUN_MAX_MS,
  START_CASH,
  buildLevel,
  decodeInputs,
  maxTicks,
  powersFor,
  settle,
  tierFor,
  tierNow,
  GUARD_MS,
  GUARD_PRICE,
  vaultDef,
  type PowerId,
} from '@chog-city/game/heist';
import {
  RUSH_JAIL_ID,
  decodeRushInputs,
  rushMap,
  rushMapFor,
  rushMaxSteps,
  rushRules,
  rushSeed,
  settleRush,
} from '@chog-city/game/rush';
import { and, desc, eq, gt, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { gangVaults, heistChogs, heistRuns, type Db } from './db/index.ts';
import { canControl } from './ownership.ts';

// The gang war on the server: vault balances, who may start a heist, and settling a finished one by
// replaying its inputs (the browser never says how much it took; the server works it out).

export type HeistError =
  | 'not-yours'
  | 'no-gang'
  | 'bad-gang'
  | 'jailed'
  | 'own-gang'
  | 'done-today'
  | 'no-run'
  | 'finished'
  | 'too-late'
  | 'bad-inputs'
  | 'bad-level'
  | 'already'
  | 'too-poor'
  | 'not-in-jail';

/** How long a building's alarm stays on without the robbery finishing. */
const ALARM_MS = 3 * 60_000;

export class HeistRefused extends Error {
  constructor(readonly code: HeistError) {
    super(code);
  }
}

export async function ensureVaults(db: Db): Promise<void> {
  await db
    .insert(gangVaults)
    .values(GANG_IDS.map((gang) => ({ gang, cash: START_CASH })))
    .onConflictDoNothing();
}

export async function vaultCash(db: Db): Promise<Record<GangId, number>> {
  const v = await vaults(db);
  return Object.fromEntries(GANG_IDS.map((g) => [g, v[g].cash])) as Record<GangId, number>;
}

export interface VaultState {
  cash: number;
  /** Defence bought by members, and until when. */
  level: number;
  until: number | null;
  by: number | null;
}

export async function vaults(db: Db): Promise<Record<GangId, VaultState>> {
  await ensureVaults(db);
  const rows = await db.select().from(gangVaults);
  return Object.fromEntries(
    rows.map((r) => [
      r.gang,
      { cash: r.cash, level: r.guardLevel, until: r.guardUntil?.getTime() ?? null, by: r.guardBy },
    ]),
  ) as Record<GangId, VaultState>;
}

/** A gang's guards: its members who catch the most robbers, topped up with Chogs born into the gang. */
export async function guardsFor(db: Db, gang: GangId, n: number): Promise<number[]> {
  const members = await db
    .select({ id: heistChogs.id })
    .from(heistChogs)
    .where(eq(heistChogs.gang, gang))
    .orderBy(desc(heistChogs.catches), desc(heistChogs.escapes), heistChogs.id)
    .limit(n);
  const out = members.map((m) => m.id);
  const born = CHOGS.filter((c) => gangOptions(c).born.includes(gang));
  for (let i = 0; out.length < n && born.length && i < born.length; i++) {
    const pick = born[Math.floor((i * born.length) / Math.max(n, 1)) % born.length]!.id;
    if (!out.includes(pick)) out.push(pick);
  }
  return out;
}

export async function heistRecord(db: Db, chogId: number) {
  const [r] = await db.select().from(heistChogs).where(eq(heistChogs.id, chogId));
  return r ?? null;
}

export async function setGang(db: Db, address: string, chogId: number, gang: GangId): Promise<void> {
  if (!(await canControl(db, address, chogId))) throw new HeistRefused('not-yours');
  const chog = getChog(chogId);
  if (!chog || !canJoinGang(chog, gang)) throw new HeistRefused('bad-gang');
  const current = await heistRecord(db, chogId);
  if (current?.gang) throw new HeistRefused('bad-gang');
  await db
    .insert(heistChogs)
    .values({ id: chogId, gang })
    .onConflictDoUpdate({ target: heistChogs.id, set: { gang } });
}

/** Gangs that robbed `gang` in the last day: hitting them back pays a bonus. */
export async function revengeTargets(db: Db, gang: GangId, now: number): Promise<GangId[]> {
  const rows = await db
    .selectDistinct({ gang: heistRuns.gang })
    .from(heistRuns)
    .where(
      and(
        eq(heistRuns.target, gang),
        eq(heistRuns.result, 'escaped'),
        isNull(heistRuns.prisoner),
        gt(heistRuns.finishedAt, new Date(now - REVENGE_MS)),
      ),
    );
  return rows.map((r) => r.gang);
}

/** Which rival vaults this Chog has already hit today. */
export async function hitToday(db: Db, chogIds: number[], now: number): Promise<Map<number, GangId[]>> {
  const out = new Map<number, GangId[]>();
  if (!chogIds.length) return out;
  const rows = await db
    .select({ chogId: heistRuns.chogId, target: heistRuns.target })
    .from(heistRuns)
    .where(
      and(inArray(heistRuns.chogId, chogIds), eq(heistRuns.day, dayOf(now)), isNull(heistRuns.prisoner)),
    );
  for (const r of rows) out.set(r.chogId, [...(out.get(r.chogId) ?? []), r.target]);
  return out;
}

export interface StartedRun {
  id: string;
  vault: string;
  tier: number;
  target: GangId;
  revenge: boolean;
  powers: PowerId[];
  guards: number[];
}

export async function startRun(
  db: Db,
  { address, chogId, target, now }: { address: string; chogId: number; target: GangId; now: number },
): Promise<StartedRun> {
  if (!(await canControl(db, address, chogId))) throw new HeistRefused('not-yours');
  const me = await heistRecord(db, chogId);
  if (!me?.gang) throw new HeistRefused('no-gang');
  if (me.jailedUntil && me.jailedUntil.getTime() > now) throw new HeistRefused('jailed');
  if (target === me.gang || !GANG_IDS.includes(target)) throw new HeistRefused('own-gang');
  if ((await hitToday(db, [chogId], now)).get(chogId)?.includes(target)) throw new HeistRefused('done-today');
  const v = (await vaults(db))[target];
  const tier = tierNow(v.cash, v, now);
  const run: StartedRun = {
    id: randomBytes(12).toString('base64url'),
    vault: rushMapFor(target).id,
    tier,
    target,
    revenge: (await revengeTargets(db, me.gang, now)).includes(target),
    powers: powersFor(chogInfo(chogId).skills),
    guards: await guardsFor(db, target, rushRules(tier).guards),
  };
  await db.insert(heistRuns).values({
    id: run.id,
    chogId,
    player: address.toLowerCase(),
    gang: me.gang,
    target,
    day: dayOf(now),
    vault: run.vault,
    tier,
    revenge: run.revenge,
    powers: run.powers,
    guards: run.guards,
    startedAt: new Date(now),
  });
  // Lights the alarm on the target's building for everyone in the city.
  await db
    .execute(
      sql`select pg_notify('city', ${JSON.stringify({ alarm: target, gang: me.gang, chog: chogId, run: run.id })})`,
    )
    .catch(() => undefined);
  return run;
}

/** Vaults being robbed right now (runs started in the last few minutes and not finished). */
export async function robbing(
  db: Db,
  now: number,
): Promise<{ target: GangId; gang: GangId; chog: number; since: number }[]> {
  const rows = await db
    .select({
      target: heistRuns.target,
      gang: heistRuns.gang,
      chog: heistRuns.chogId,
      at: heistRuns.startedAt,
    })
    .from(heistRuns)
    .where(
      and(
        isNull(heistRuns.finishedAt),
        isNull(heistRuns.prisoner),
        gt(heistRuns.startedAt, new Date(now - ALARM_MS)),
      ),
    );
  return rows.map((r) => ({
    target: r.target as GangId,
    gang: r.gang as GangId,
    chog: r.chog,
    since: r.at.getTime(),
  }));
}

export interface FinishedRun {
  result: 'escaped' | 'busted';
  carried: number;
  score: number;
  moved: number;
  caughtBy: number | null;
  jailedUntil: number | null;
  revenge: boolean;
  target: GangId;
}

/**
 * Replays a run from its key presses: Cash Rush runs (map ids "rush-...") with the run's seed, and the old
 * stealth runs that were started before the switch with their own rules.
 */
function replayRun(
  run: {
    vault: string;
    tier: number;
    powers: unknown;
    prisoner: number | null;
    revenge: boolean;
    id: string;
  },
  text: string,
  vaultHas: number,
  robberHas: number,
): { state: { phase: string; carried: number; score: number; caughtBy: number | null }; moved: number } {
  const powers = run.powers as PowerId[];
  const map = rushMap(run.vault);
  if (map) {
    const inputs = decodeRushInputs(text);
    if (!inputs || inputs.length > rushMaxSteps(map)) throw new HeistRefused('bad-inputs');
    const rules = rushRules(run.tier, run.prisoner !== null);
    return settleRush(map, rules, powers, inputs, rushSeed(run.id), vaultHas, robberHas, run.revenge);
  }
  const def = vaultDef(run.vault);
  if (!def) throw new HeistRefused('no-run');
  const inputs = decodeInputs(text);
  const built = buildLevel(def, run.tier);
  if (!inputs || inputs.length > maxTicks(built)) throw new HeistRefused('bad-inputs');
  return settle(built, powers, inputs, vaultHas, robberHas, run.revenge);
}

export async function finishRun(
  db: Db,
  { address, runId, inputs: text, now }: { address: string; runId: string; inputs: string; now: number },
): Promise<FinishedRun> {
  return db.transaction(async (tx) => {
    const [run] = await tx.select().from(heistRuns).where(eq(heistRuns.id, runId)).for('update');
    if (!run || run.player !== address.toLowerCase()) throw new HeistRefused('no-run');
    if (run.finishedAt) throw new HeistRefused('finished');
    if (now - run.startedAt.getTime() > RUN_MAX_MS) throw new HeistRefused('too-late');
    // Lock both vaults in a fixed order so two runs settling at once can't deadlock.
    const pair = [run.gang, run.target].sort();
    const vaults = await tx
      .select()
      .from(gangVaults)
      .where(inArray(gangVaults.gang, pair))
      .orderBy(gangVaults.gang)
      .for('update');
    const cash = Object.fromEntries(vaults.map((v) => [v.gang, v.cash])) as Record<string, number>;
    // A break-out moves no cash: it's settled as if both vaults were empty.
    const breakout = run.prisoner !== null;
    const vaultHas = breakout ? 0 : (cash[run.target] ?? 0);
    const robberHas = breakout ? 0 : (cash[run.gang] ?? 0);
    const { state, moved } = replayRun(run, text, vaultHas, robberHas);
    const escaped = state.phase === 'escaped';
    const [from, to] = escaped ? [run.target, run.gang] : [run.gang, run.target];
    if (moved > 0) {
      await tx
        .update(gangVaults)
        .set({ cash: sql`${gangVaults.cash} - ${moved}`, updatedAt: new Date(now) })
        .where(eq(gangVaults.gang, from));
      await tx
        .update(gangVaults)
        .set({ cash: sql`${gangVaults.cash} + ${moved}`, updatedAt: new Date(now) })
        .where(eq(gangVaults.gang, to));
    }
    const caughtBy = !escaped && state.caughtBy !== null ? (run.guards[state.caughtBy] ?? null) : null;
    if (breakout && escaped)
      await tx
        .update(heistChogs)
        .set({ jailedUntil: new Date(now) })
        .where(and(eq(heistChogs.id, run.prisoner!), gt(heistChogs.jailedUntil, new Date(now))));
    const jailedUntil = escaped ? null : now + JAIL_MS;
    await tx
      .update(heistChogs)
      .set(
        escaped
          ? {
              stolen: sql`${heistChogs.stolen} + ${moved}`,
              escapes: sql`${heistChogs.escapes} + 1`,
              best: sql`greatest(${heistChogs.best}, ${state.score})`,
              lastRunAt: new Date(now),
            }
          : {
              busts: sql`${heistChogs.busts} + 1`,
              jailedUntil: new Date(jailedUntil!),
              lastRunAt: new Date(now),
            },
      )
      .where(eq(heistChogs.id, run.chogId));
    if (caughtBy !== null && !breakout)
      await tx
        .insert(heistChogs)
        .values({ id: caughtBy, gang: run.target, catches: 1 })
        .onConflictDoUpdate({ target: heistChogs.id, set: { catches: sql`${heistChogs.catches} + 1` } });
    await tx
      .update(heistRuns)
      .set({
        finishedAt: new Date(now),
        result: escaped ? 'escaped' : 'busted',
        carried: state.carried,
        score: state.score,
        moved,
        caughtBy,
        inputs: text,
      })
      .where(eq(heistRuns.id, run.id));
    await tx
      .execute(
        sql`select pg_notify('city', ${JSON.stringify({ war: run.id, target: run.target, gang: run.gang })})`,
      )
      .catch(() => undefined);
    return {
      result: escaped ? 'escaped' : 'busted',
      carried: state.carried,
      score: state.score,
      moved,
      caughtBy,
      jailedUntil,
      revenge: run.revenge,
      target: run.target,
    };
  });
}

export interface WarHit {
  id: string;
  chogId: number;
  gang: GangId;
  target: GangId;
  result: 'escaped' | 'busted';
  moved: number;
  caughtBy: number | null;
  revenge: boolean;
  /** Set on a break-out: who they tried to free. */
  prisoner: number | null;
  at: number;
}

export async function recentHits(db: Db, limit = 30, gang?: GangId): Promise<WarHit[]> {
  const rows = await db
    .select()
    .from(heistRuns)
    .where(
      gang
        ? and(
            isNotNull(heistRuns.finishedAt),
            sql`(${heistRuns.gang} = ${gang} or ${heistRuns.target} = ${gang})`,
          )
        : isNotNull(heistRuns.finishedAt),
    )
    .orderBy(desc(heistRuns.finishedAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    chogId: r.chogId,
    gang: r.gang,
    target: r.target,
    result: r.result!,
    moved: r.moved ?? 0,
    caughtBy: r.caughtBy,
    revenge: r.revenge,
    prisoner: r.prisoner,
    at: r.finishedAt!.getTime(),
  }));
}

export interface VaultRow {
  gang: GangId;
  cash: number;
  tier: number;
  /** Set while members have paid for more defence than the cash gives. */
  boughtUntil: number | null;
  vault: string;
  members: number;
  guards: number[];
}

export async function warBoard(db: Db, now = Date.now()): Promise<VaultRow[]> {
  const v = await vaults(db);
  const counts = await db
    .select({ gang: heistChogs.gang, n: sql<number>`count(*)::int` })
    .from(heistChogs)
    .where(isNotNull(heistChogs.gang))
    .groupBy(heistChogs.gang);
  const members = Object.fromEntries(counts.map((c) => [c.gang, c.n]));
  const rows = await Promise.all(
    GANG_IDS.map(async (gang) => ({
      gang,
      cash: v[gang].cash,
      tier: tierNow(v[gang].cash, v[gang], now),
      boughtUntil:
        v[gang].until !== null && v[gang].until! > now && v[gang].level > tierFor(v[gang].cash)
          ? v[gang].until
          : null,
      vault: rushMapFor(gang).id,
      members: members[gang] ?? 0,
      guards: await guardsFor(db, gang, 3),
    })),
  );
  return rows.sort((a, b) => b.cash - a.cash || a.gang.localeCompare(b.gang));
}

/** A Chog's latest heists, and the robbers it caught while guarding. */
export async function chogHits(db: Db, chogId: number, limit = 20): Promise<WarHit[]> {
  const rows = await db
    .select()
    .from(heistRuns)
    .where(
      and(
        isNotNull(heistRuns.finishedAt),
        sql`(${heistRuns.chogId} = ${chogId} or ${heistRuns.caughtBy} = ${chogId})`,
      ),
    )
    .orderBy(desc(heistRuns.finishedAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    chogId: r.chogId,
    gang: r.gang,
    target: r.target,
    result: r.result!,
    moved: r.moved ?? 0,
    caughtBy: r.caughtBy,
    revenge: r.revenge,
    prisoner: r.prisoner,
    at: r.finishedAt!.getTime(),
  }));
}

/** A gang's members, best robbers first. */
export async function gangMembers(db: Db, gang: GangId, limit = 50) {
  return db
    .select()
    .from(heistChogs)
    .where(eq(heistChogs.gang, gang))
    .orderBy(desc(heistChogs.stolen), desc(heistChogs.catches), heistChogs.id)
    .limit(limit);
}

/** Chogs sitting in jail right now, soonest out first. */
export async function jailed(db: Db, now: number, limit = 40) {
  const rows = await db
    .select({ id: heistChogs.id, gang: heistChogs.gang, until: heistChogs.jailedUntil })
    .from(heistChogs)
    .where(gt(heistChogs.jailedUntil, new Date(now)))
    .orderBy(heistChogs.jailedUntil)
    .limit(limit);
  return rows.map((r) => ({ id: r.id, gang: r.gang as GangId, until: r.until!.getTime() }));
}

/**
 * A member pays out of the gang's vault to raise its defence for a day. Any Chog in the gang can do it, so
 * the gang decides together when to lock down (before a revenge hit, say) and when to keep the cash.
 */
export async function defend(
  db: Db,
  { address, chogId, level, now }: { address: string; chogId: number; level: number; now: number },
): Promise<{ gang: GangId; level: number; until: number; cash: number }> {
  if (!(await canControl(db, address, chogId))) throw new HeistRefused('not-yours');
  const me = await heistRecord(db, chogId);
  if (!me?.gang) throw new HeistRefused('no-gang');
  if (me.jailedUntil && me.jailedUntil.getTime() > now) throw new HeistRefused('jailed');
  if (!Number.isInteger(level) || level < 1 || level > 3) throw new HeistRefused('bad-level');
  const gang = me.gang as GangId;
  await ensureVaults(db);
  return db.transaction(async (tx) => {
    const [v] = await tx.select().from(gangVaults).where(eq(gangVaults.gang, gang)).for('update');
    const state = { level: v!.guardLevel, until: v!.guardUntil?.getTime() ?? null };
    if (level <= tierNow(v!.cash, state, now)) throw new HeistRefused('already');
    const price = GUARD_PRICE[level as 1 | 2 | 3];
    if (v!.cash < price) throw new HeistRefused('too-poor');
    const until = now + GUARD_MS;
    await tx
      .update(gangVaults)
      .set({
        cash: v!.cash - price,
        guardLevel: level,
        guardUntil: new Date(until),
        guardBy: chogId,
        updatedAt: new Date(now),
      })
      .where(eq(gangVaults.gang, gang));
    await tx
      .execute(sql`select pg_notify('city', ${JSON.stringify({ defend: gang, level, chog: chogId })})`)
      .catch(() => undefined);
    return { gang, level, until, cash: v!.cash - price };
  });
}

/** A finished run, with everything needed to play it back. */
export async function runForReplay(db: Db, id: string) {
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(id)) return null;
  const [r] = await db
    .select()
    .from(heistRuns)
    .where(and(eq(heistRuns.id, id), isNotNull(heistRuns.finishedAt)));
  if (!r || r.inputs === null) return null;
  return {
    id: r.id,
    chogId: r.chogId,
    gang: r.gang as GangId,
    target: r.target as GangId,
    vault: r.vault,
    tier: r.tier,
    powers: r.powers as PowerId[],
    guards: r.guards as number[],
    inputs: r.inputs,
    result: r.result!,
    moved: r.moved ?? 0,
    revenge: r.revenge,
    prisoner: r.prisoner,
    at: r.finishedAt!.getTime(),
  };
}

/** The jail is guarded by the city's best catchers, topped up with Jailbirds. */
async function jailGuards(db: Db, n: number): Promise<number[]> {
  const best = await db
    .select({ id: heistChogs.id })
    .from(heistChogs)
    .where(gt(heistChogs.catches, 0))
    .orderBy(desc(heistChogs.catches), heistChogs.id)
    .limit(n);
  const out = best.map((b) => b.id);
  const birds = CHOGS.filter((c) => gangOptions(c).born.includes('jailbirds'));
  for (let i = 0; out.length < n && i < birds.length; i += 7)
    if (!out.includes(birds[i]!.id)) out.push(birds[i]!.id);
  return out;
}

/** Starts a break-out: sneak into the jail and free a gang-mate. Each Chog gets one try a day. */
export async function startBreakout(
  db: Db,
  { address, chogId, prisoner, now }: { address: string; chogId: number; prisoner: number; now: number },
): Promise<StartedRun & { prisoner: number }> {
  if (!(await canControl(db, address, chogId))) throw new HeistRefused('not-yours');
  const me = await heistRecord(db, chogId);
  if (!me?.gang) throw new HeistRefused('no-gang');
  if (me.jailedUntil && me.jailedUntil.getTime() > now) throw new HeistRefused('jailed');
  const them = await heistRecord(db, prisoner);
  if (!them || them.gang !== me.gang || !them.jailedUntil || them.jailedUntil.getTime() <= now)
    throw new HeistRefused('not-in-jail');
  const [tried] = await db
    .select({ id: heistRuns.id })
    .from(heistRuns)
    .where(and(eq(heistRuns.chogId, chogId), eq(heistRuns.day, dayOf(now)), isNotNull(heistRuns.prisoner)))
    .limit(1);
  if (tried) throw new HeistRefused('done-today');
  const run = {
    id: randomBytes(12).toString('base64url'),
    vault: RUSH_JAIL_ID,
    tier: JAIL_TIER,
    target: me.gang as GangId,
    revenge: false,
    powers: powersFor(chogInfo(chogId).skills),
    guards: await jailGuards(db, rushRules(JAIL_TIER, true).guards),
    prisoner,
  };
  await db.insert(heistRuns).values({
    id: run.id,
    chogId,
    player: address.toLowerCase(),
    gang: me.gang,
    target: run.target,
    day: dayOf(now),
    vault: run.vault,
    tier: run.tier,
    revenge: false,
    powers: run.powers,
    guards: run.guards,
    prisoner,
    startedAt: new Date(now),
  });
  await db
    .execute(
      sql`select pg_notify('city', ${JSON.stringify({ breakout: prisoner, gang: me.gang, chog: chogId })})`,
    )
    .catch(() => undefined);
  return run;
}
