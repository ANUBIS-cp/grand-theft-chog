import { CHOGS, GANG_IDS, canJoinGang, gangOptions, getChog, type GangId } from '@chog-city/data';
import { chogInfo, dayOf } from '@chog-city/game';
import {
  JAIL_MS,
  REVENGE_MS,
  RUN_MAX_MS,
  START_CASH,
  buildLevel,
  decodeInputs,
  levelFor,
  maxTicks,
  powersFor,
  settle,
  tierFor,
  vaultDef,
  vaultFor,
  type PowerId,
} from '@chog-city/game/heist';
import { and, desc, eq, gt, inArray, isNotNull, sql } from 'drizzle-orm';
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
  | 'bad-inputs';

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
  await ensureVaults(db);
  const rows = await db.select().from(gangVaults);
  return Object.fromEntries(rows.map((r) => [r.gang, r.cash])) as Record<GangId, number>;
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
    .where(and(inArray(heistRuns.chogId, chogIds), eq(heistRuns.day, dayOf(now))));
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
  const cash = (await vaultCash(db))[target];
  const { level, tier } = levelFor(target, cash);
  const run: StartedRun = {
    id: randomBytes(12).toString('base64url'),
    vault: vaultFor(target).id,
    tier,
    target,
    revenge: (await revengeTargets(db, me.gang, now)).includes(target),
    powers: powersFor(chogInfo(chogId).skills),
    guards: await guardsFor(db, target, level.guards.length),
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
  return run;
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

export async function finishRun(
  db: Db,
  { address, runId, inputs: text, now }: { address: string; runId: string; inputs: string; now: number },
): Promise<FinishedRun> {
  const inputs = decodeInputs(text);
  if (!inputs) throw new HeistRefused('bad-inputs');
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
    const def = vaultDef(run.vault);
    if (!def) throw new HeistRefused('no-run');
    const built = buildLevel(def, run.tier);
    if (inputs.length > maxTicks(built)) throw new HeistRefused('bad-inputs');
    const { state, moved } = settle(
      built,
      run.powers as PowerId[],
      inputs,
      cash[run.target] ?? 0,
      cash[run.gang] ?? 0,
      run.revenge,
    );
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
    if (caughtBy !== null)
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
      .execute(sql`select pg_notify('city', ${JSON.stringify({ war: run.id })})`)
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
    at: r.finishedAt!.getTime(),
  }));
}

export interface VaultRow {
  gang: GangId;
  cash: number;
  tier: number;
  vault: string;
  members: number;
  guards: number[];
}

export async function warBoard(db: Db): Promise<VaultRow[]> {
  const cash = await vaultCash(db);
  const counts = await db
    .select({ gang: heistChogs.gang, n: sql<number>`count(*)::int` })
    .from(heistChogs)
    .where(isNotNull(heistChogs.gang))
    .groupBy(heistChogs.gang);
  const members = Object.fromEntries(counts.map((c) => [c.gang, c.n]));
  const rows = await Promise.all(
    GANG_IDS.map(async (gang) => ({
      gang,
      cash: cash[gang],
      tier: tierFor(cash[gang]),
      vault: vaultFor(gang).id,
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
