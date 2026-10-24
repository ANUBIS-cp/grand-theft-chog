import { CHOGS, gangOptions } from '@chog-city/data';
import { HOUR, dayStart } from '@chog-city/game';
import { BUST_FINE, HOUR_MS, REFILL_PER_HOUR, START_CASH, takeCap } from '@chog-city/game/heist';
import { eq } from 'drizzle-orm';
import { encodeLock, perfectLock } from '@chog-city/game/lock';
import { encodeRushInputs, rushSeed, type RushInput } from '@chog-city/game/rush';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  defend,
  expireGetaways,
  finishGetaway,
  lockRun,
  GETAWAY_MS,
  startBreakout,
  finishLiveRun,
  finishRun,
  joinRaid,
  heistRecord,
  recentHits,
  revengeTargets,
  runForReplay,
  setGang,
  startRun,
  tickVaults,
  vaultCash,
  warBoard,
  HeistRefused,
} from './heists.ts';
import { setOwners } from './ownership.ts';
import { testDb } from './test-db.ts';
import { gangVaults, type Db } from './db/index.ts';

const A = '0x00000000000000000000000000000000000000aa';
const B = '0x00000000000000000000000000000000000000bb';
const NOW = dayStart(20_400) + 3 * HOUR;
const born = (g: 'lazoor' | 'mcga') =>
  CHOGS.filter((c) => gangOptions(c).born.includes(g) && !gangOptions(c).anyGang);
const lazoorChog = born('lazoor')[0]!.id;
const mcgaChog = born('mcga')[0]!.id;

const go = (d: 0 | 1 | 2 | 3, n: number): RushInput[] => Array.from({ length: n }, () => ({ d }));
// Cash Rush: two tiles left for a coin, back, and down out of the door before any guard is near.
const grabAndGo = encodeRushInputs([...go(3, 12), ...go(1, 12), ...go(2, 10)]);

let db: Db;
beforeEach(async () => {
  ({ db } = await testDb());
  await setOwners(db, [
    { tokenId: lazoorChog, owner: A, block: 1 },
    { tokenId: mcgaChog, owner: B, block: 1 },
  ]);
  await setGang(db, A, lazoorChog, 'lazoor');
  await setGang(db, B, mcgaChog, 'mcga');
});

/** Stage 1: a clean break-in on the run's lock (or a loud one with no taps). */
const breakIn = (address: string, run: { id: string; target: string }, quiet = true, now = NOW + 500) =>
  lockRun(db, {
    address,
    runId: run.id,
    inputs: quiet ? encodeLock(perfectLock(run.target as 'mcga', rushSeed(run.id))) : '',
    now,
  });

const refused = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e instanceof HeistRefused ? e.code : String(e);
  }
  return 'ok';
};

describe('the gang war', () => {
  it('only lets owners play, only from a gang, never against their own gang', async () => {
    expect(await refused(startRun(db, { address: B, chogId: lazoorChog, target: 'mcga', now: NOW }))).toBe(
      'not-yours',
    );
    expect(await refused(startRun(db, { address: A, chogId: lazoorChog, target: 'lazoor', now: NOW }))).toBe(
      'own-gang',
    );
    expect(await refused(setGang(db, A, lazoorChog, 'mcga'))).toBe('bad-gang');
  });

  it('breaks in first: the lock is replayed (quiet or loud) and only done once', async () => {
    const run = await startRun(db, { address: A, chogId: lazoorChog, target: 'mcga', now: NOW });
    expect(
      await refused(finishRun(db, { address: A, runId: run.id, inputs: grabAndGo, now: NOW + 1000 })),
    ).toBe('no-lock');
    expect(await refused(breakIn(B, run))).toBe('no-run');
    expect(await breakIn(A, run)).toMatchObject({ loud: false, run: { id: run.id } });
    expect(await refused(breakIn(A, run))).toBe('locked');
    const other = await startRun(db, { address: B, chogId: mcgaChog, target: 'lazoor', now: NOW });
    expect((await breakIn(B, other, false)).loud).toBe(true);
  });

  it('an escape carries the bag out; it lands in your vault when you get it home, once per vault per day', async () => {
    const run = await startRun(db, { address: A, chogId: lazoorChog, target: 'mcga', now: NOW });
    await breakIn(A, run);
    const out = await finishRun(db, { address: A, runId: run.id, inputs: grabAndGo, now: NOW + 60_000 });
    expect(out.result).toBe('escaped');
    expect(out.moved).toBeGreaterThan(0);
    expect(out.getaway).toMatchObject({ bag: out.moved, from: 'mcga', home: 'lazoor', chog: lazoorChog });
    // Out of their vault, not in yours yet.
    expect(await vaultCash(db)).toMatchObject({ mcga: START_CASH - out.moved, lazoor: START_CASH });
    const home = await finishGetaway(db, { runId: run.id, outcome: 'home', by: null, now: NOW + 90_000 });
    expect(home).toMatchObject({ outcome: 'home', bag: out.moved, jailedUntil: null });
    const cash = await vaultCash(db);
    expect(cash.mcga).toBe(START_CASH - out.moved);
    expect(cash.lazoor).toBe(START_CASH + out.moved);
    expect((await heistRecord(db, lazoorChog))!.stolen).toBe(out.moved);
    expect(
      await refused(finishGetaway(db, { runId: run.id, outcome: 'home', by: null, now: NOW + 91_000 })),
    ).toBe('no-run');
    expect(
      await refused(finishRun(db, { address: A, runId: run.id, inputs: grabAndGo, now: NOW + 61_000 })),
    ).toBe('finished');
    expect(
      await refused(startRun(db, { address: A, chogId: lazoorChog, target: 'mcga', now: NOW + 120_000 })),
    ).toBe('done-today');
    // ...except the owner's wallets, filming (again: true): the same vault the same day.
    expect(
      (
        await startRun(db, {
          address: A,
          chogId: lazoorChog,
          target: 'mcga',
          now: NOW + 120_000,
          again: true,
        })
      ).target,
    ).toBe('mcga');
    // The robbed gang can hit back for a bonus.
    expect(await revengeTargets(db, 'mcga', NOW + 120_000)).toEqual(['lazoor']);
    const back = await startRun(db, { address: B, chogId: mcgaChog, target: 'lazoor', now: NOW + 120_000 });
    expect(back.revenge).toBe(true);
    expect((await recentHits(db))[0]).toMatchObject({ gang: 'lazoor', target: 'mcga', result: 'escaped' });
  });

  it('caught on the way home: the bag goes back, the fine is paid, jail; a robbed-gang Chog gets the catch', async () => {
    const run = await startRun(db, { address: A, chogId: lazoorChog, target: 'mcga', now: NOW });
    await breakIn(A, run);
    const out = await finishRun(db, { address: A, runId: run.id, inputs: grabAndGo, now: NOW + 60_000 });
    // B's MCGA Chog tagged the robber in the street.
    const caught = await finishGetaway(db, {
      runId: run.id,
      outcome: 'caught',
      by: mcgaChog,
      now: NOW + 80_000,
      track: {
        cops: [7],
        frames: [
          [100, 100, 120, 100],
          [101, 100, 102, 100],
        ],
        outcome: 'caught',
        who: 'gang',
        by: mcgaChog,
        bag: out.moved,
      },
    });
    expect(caught.caughtBy).toBe(mcgaChog);
    // The run home is kept for the replay.
    expect((await runForReplay(db, run.id))!.getawayTrack).toMatchObject({ who: 'gang', bag: out.moved });
    expect(await vaultCash(db)).toMatchObject({
      mcga: START_CASH + BUST_FINE,
      lazoor: START_CASH - BUST_FINE,
    });
    expect(out.moved).toBeGreaterThan(0);
    expect((await heistRecord(db, lazoorChog))!.jailedUntil!.getTime()).toBe(NOW + 80_000 + 30 * 60_000);
    expect((await heistRecord(db, mcgaChog))!.catches).toBe(1);
    expect((await recentHits(db))[0]).toMatchObject({ result: 'busted' });
  });

  it('a getaway nobody reports on is banked after five minutes', async () => {
    const run = await startRun(db, { address: A, chogId: lazoorChog, target: 'mcga', now: NOW });
    await breakIn(A, run);
    const out = await finishRun(db, { address: A, runId: run.id, inputs: grabAndGo, now: NOW + 60_000 });
    expect(await expireGetaways(db, NOW + 60_000 + GETAWAY_MS - 1)).toBe(0);
    expect(await expireGetaways(db, NOW + 60_000 + GETAWAY_MS + 1)).toBe(1);
    expect((await vaultCash(db)).lazoor).toBe(START_CASH + out.moved);
  });

  it('a bust jails the Chog and its gang pays the fine to the vault', async () => {
    const run = await startRun(db, { address: A, chogId: lazoorChog, target: 'mcga', now: NOW });
    await breakIn(A, run);
    const out = await finishRun(db, { address: A, runId: run.id, inputs: '', now: NOW + 60_000 });
    expect(out.result).toBe('busted');
    expect((await vaultCash(db)).mcga).toBe(START_CASH + BUST_FINE);
    expect((await vaultCash(db)).lazoor).toBe(START_CASH - BUST_FINE);
    expect(
      await refused(startRun(db, { address: A, chogId: lazoorChog, target: 'robbers', now: NOW + 70_000 })),
    ).toBe('jailed');
  });

  it('a robbery on a near-empty vault takes a fifth of it at most', async () => {
    await vaultCash(db);
    await db.update(gangVaults).set({ cash: 1_000 }).where(eq(gangVaults.gang, 'mcga'));
    const run = await startRun(db, { address: A, chogId: lazoorChog, target: 'mcga', now: NOW });
    await breakIn(A, run);
    const out = await finishRun(db, { address: A, runId: run.id, inputs: grabAndGo, now: NOW + 60_000 });
    expect(out.result).toBe('escaped');
    expect(out.moved).toBe(Math.min(out.score, takeCap(1_000, false)));
    expect(out.moved).toBeLessThanOrEqual(200);
  });

  it('vaults tick once an hour: refill under $5k, upkeep at Fortress, from the first tick on', async () => {
    await vaultCash(db);
    await db.update(gangVaults).set({ cash: 1_000 }).where(eq(gangVaults.gang, 'mcga'));
    await db.update(gangVaults).set({ cash: 60_000 }).where(eq(gangVaults.gang, 'lazoor'));
    // The first tick only starts the clock: nothing is charged for the time before it.
    await tickVaults(db, NOW);
    expect(await vaultCash(db)).toMatchObject({ mcga: 1_000, lazoor: 60_000, robbers: START_CASH });
    await tickVaults(db, NOW + 3 * HOUR_MS);
    await tickVaults(db, NOW + 3 * HOUR_MS + 10_000);
    const cash = await vaultCash(db);
    expect(cash.mcga).toBe(1_000 + 3 * REFILL_PER_HOUR);
    expect(cash.lazoor).toBeLessThan(60_000);
    expect(cash.lazoor).toBeGreaterThan(58_000);
    expect(cash.robbers).toBe(START_CASH);
  });

  it('lists every gang vault, richest first, with guards from the gang', async () => {
    const board = await warBoard(db);
    expect(board).toHaveLength(20);
    expect(board.find((r) => r.gang === 'mcga')!.guards[0]).toBe(mcgaChog);
  });

  it('lets a member pay out of the vault for more defence, for a day, and the next robbery faces it', async () => {
    expect(await refused(defend(db, { address: B, chogId: lazoorChog, level: 3, now: NOW }))).toBe(
      'not-yours',
    );
    const before = (await warBoard(db, NOW)).find((v) => v.gang === 'lazoor')!;
    expect(await refused(defend(db, { address: A, chogId: lazoorChog, level: before.tier, now: NOW }))).toBe(
      'already',
    );
    const r = await defend(db, { address: A, chogId: lazoorChog, level: 3, now: NOW });
    expect(r.cash).toBe(START_CASH - 4000);
    const after = (await warBoard(db, NOW)).find((v) => v.gang === 'lazoor')!;
    expect(after.tier).toBe(3);
    expect(after.boughtUntil).toBe(NOW + 24 * HOUR);
    expect(
      (await startRun(db, { address: B, chogId: mcgaChog, target: 'lazoor', now: NOW + HOUR })).tier,
    ).toBe(3);
    // A day later it's back to what the cash gives.
    expect((await warBoard(db, NOW + 25 * HOUR)).find((v) => v.gang === 'lazoor')!.tier).toBe(before.tier);
  });

  it('frees a jailed gang-mate on a clean break-out, moves no cash, and allows one try a day', async () => {
    // B's MCGA Chog gets caught in Lazoor's vault.
    const r = await startRun(db, { address: B, chogId: mcgaChog, target: 'lazoor', now: NOW });
    await breakIn(B, r);
    await finishRun(db, { address: B, runId: r.id, inputs: '', now: NOW + 1000 });
    expect((await heistRecord(db, mcgaChog))!.jailedUntil!.getTime()).toBeGreaterThan(NOW);
    // Only a gang-mate can try.
    expect(
      await refused(
        startBreakout(db, { address: A, chogId: lazoorChog, prisoner: mcgaChog, now: NOW + 2000 }),
      ),
    ).toBe('not-in-jail');
    const mate = born('mcga')[1]!.id;
    await setOwners(db, [{ tokenId: mate, owner: B, block: 2 }]);
    await setGang(db, B, mate, 'mcga');
    const before = await vaultCash(db);
    const run = await startBreakout(db, { address: B, chogId: mate, prisoner: mcgaChog, now: NOW + 3000 });
    expect(run.vault).toBe('rush-jail');
    // Up into the jail and back: whether it frees them or not, no cash moves.
    const route = encodeRushInputs([...go(0, 60), ...go(2, 60)]);
    const done = await finishRun(db, { address: B, runId: run.id, inputs: route, now: NOW + 60_000 });
    expect(await vaultCash(db)).toEqual(before);
    if (done.result === 'escaped') {
      expect((await heistRecord(db, mcgaChog))!.jailedUntil!.getTime()).toBeLessThanOrEqual(NOW + 60_000);
    } else {
      expect((await heistRecord(db, mate))!.jailedUntil!.getTime()).toBeGreaterThan(NOW + 60_000);
    }
    expect(
      await refused(startBreakout(db, { address: B, chogId: mate, prisoner: mcgaChog, now: NOW + 70_000 })),
    ).not.toBe('ok');
  });

  it('a gang-mate can jump into a raid on their vault; then only the live server can finish it', async () => {
    const run = await startRun(db, { address: A, chogId: lazoorChog, target: 'mcga', now: NOW });
    await breakIn(A, run);
    // Not your gang's vault, or not your Chog: no.
    expect(
      await refused(joinRaid(db, { address: A, chogId: lazoorChog, runId: run.id, now: NOW + 1000 })),
    ).toBe('own-gang');
    expect(
      await refused(joinRaid(db, { address: A, chogId: mcgaChog, runId: run.id, now: NOW + 1000 })),
    ).toBe('not-yours');
    expect(await joinRaid(db, { address: B, chogId: mcgaChog, runId: run.id, now: NOW + 1000 })).toEqual({
      run: run.id,
      target: 'mcga',
    });
    // The robber's own browser can't settle it now (it could leave the defender out).
    expect(
      await refused(finishRun(db, { address: A, runId: run.id, inputs: grabAndGo, now: NOW + 5000 })),
    ).toBe('live');
    // The live server's record, with the defender standing still on guard 0, settles it.
    const out = await finishLiveRun(db, {
      runId: run.id,
      inputs: grabAndGo,
      defenders: [{ guard: 0, name: `d${mcgaChog}`, chog: mcgaChog, at: 30, moves: 'A'.repeat(4) }],
      now: NOW + 6000,
    });
    expect(out.result).toBe('escaped');
    expect((await vaultCash(db)).mcga).toBe(START_CASH - out.moved);
  });
});
