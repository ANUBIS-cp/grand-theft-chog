import { CHOGS, gangOptions } from '@chog-city/data';
import { HOUR, dayStart } from '@chog-city/game';
import { BUST_FINE, START_CASH } from '@chog-city/game/heist';
import { encodeRushInputs, type RushInput } from '@chog-city/game/rush';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  defend,
  startBreakout,
  finishRun,
  heistRecord,
  recentHits,
  revengeTargets,
  setGang,
  startRun,
  vaultCash,
  warBoard,
  HeistRefused,
} from './heists.ts';
import { setOwners } from './ownership.ts';
import { testDb } from './test-db.ts';
import type { Db } from './db/index.ts';

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

  it('an escape moves cash from their vault to yours, once per vault per day', async () => {
    const run = await startRun(db, { address: A, chogId: lazoorChog, target: 'mcga', now: NOW });
    const out = await finishRun(db, { address: A, runId: run.id, inputs: grabAndGo, now: NOW + 60_000 });
    expect(out.result).toBe('escaped');
    expect(out.moved).toBeGreaterThan(0);
    const cash = await vaultCash(db);
    expect(cash.mcga).toBe(START_CASH - out.moved);
    expect(cash.lazoor).toBe(START_CASH + out.moved);
    expect((await heistRecord(db, lazoorChog))!.stolen).toBe(out.moved);
    expect(
      await refused(finishRun(db, { address: A, runId: run.id, inputs: grabAndGo, now: NOW + 61_000 })),
    ).toBe('finished');
    expect(
      await refused(startRun(db, { address: A, chogId: lazoorChog, target: 'mcga', now: NOW + 120_000 })),
    ).toBe('done-today');
    // The robbed gang can hit back for a bonus.
    expect(await revengeTargets(db, 'mcga', NOW + 120_000)).toEqual(['lazoor']);
    const back = await startRun(db, { address: B, chogId: mcgaChog, target: 'lazoor', now: NOW + 120_000 });
    expect(back.revenge).toBe(true);
    expect((await recentHits(db))[0]).toMatchObject({ gang: 'lazoor', target: 'mcga', result: 'escaped' });
  });

  it('a bust jails the Chog and its gang pays the fine to the vault', async () => {
    const run = await startRun(db, { address: A, chogId: lazoorChog, target: 'mcga', now: NOW });
    const out = await finishRun(db, { address: A, runId: run.id, inputs: '', now: NOW + 60_000 });
    expect(out.result).toBe('busted');
    expect((await vaultCash(db)).mcga).toBe(START_CASH + BUST_FINE);
    expect((await vaultCash(db)).lazoor).toBe(START_CASH - BUST_FINE);
    expect(
      await refused(startRun(db, { address: A, chogId: lazoorChog, target: 'robbers', now: NOW + 70_000 })),
    ).toBe('jailed');
  });

  it('lists every gang vault, richest first, with guards from the gang', async () => {
    const board = await warBoard(db);
    expect(board).toHaveLength(16);
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
});
