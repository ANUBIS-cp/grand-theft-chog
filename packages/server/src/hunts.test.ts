import { CHOGS, gangOptions } from '@chog-city/data';
import { HOUR, dayOf, dayStart } from '@chog-city/game';
import { START_CASH } from '@chog-city/game/heist';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { gangVaults, heistRuns, type Db } from './db/index.ts';
import { HeistRefused, heistRecord, setGang, vaultCash } from './heists.ts';
import { WANTED_BONUS, bountyFor, claimPumpkin, pumpkinTally, tagWanted, wantedBonus, wantedToday } from './hunts.ts';
import { setOwners } from './ownership.ts';
import { testDb } from './test-db.ts';

const A = '0x00000000000000000000000000000000000000aa';
const B = '0x00000000000000000000000000000000000000bb';
const DAY = 20_400;
const NOW = dayStart(DAY) + 3 * HOUR;
const born = (g: 'lazoor' | 'mcga') =>
  CHOGS.filter((c) => gangOptions(c).born.includes(g) && !gangOptions(c).anyGang);
const lazoorChog = born('lazoor')[0]!.id;
const lazoorMate = born('lazoor')[1]!.id;
const mcgaChog = born('mcga')[0]!.id;

let db: Db;
beforeEach(async () => {
  ({ db } = await testDb());
  await setOwners(db, [
    { tokenId: lazoorChog, owner: A, block: 1 },
    { tokenId: lazoorMate, owner: A, block: 1 },
    { tokenId: mcgaChog, owner: B, block: 1 },
  ]);
  await setGang(db, A, lazoorChog, 'lazoor');
  await setGang(db, A, lazoorMate, 'lazoor');
  await setGang(db, B, mcgaChog, 'mcga');
  await vaultCash(db);
});

const refused = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e instanceof HeistRefused ? e.code : String(e);
  }
  return 'ok';
};

/** A robbery carried home on `day`. */
const robbed = (id: string, chogId: number, gang: 'lazoor' | 'mcga', moved: number, day = DAY - 1) =>
  db.insert(heistRuns).values({
    id,
    chogId,
    player: A,
    gang,
    target: 'robbers',
    day,
    vault: 'rush-bank',
    tier: 1,
    powers: [],
    guards: [],
    startedAt: new Date(dayStart(day) + HOUR),
    finishedAt: new Date(dayStart(day) + HOUR + 60_000),
    result: 'escaped',
    getaway: 'home',
    moved,
  });

describe('pumpkin rush', () => {
  it('pays a pumpkin once, to the gang of the Chog that reached it', async () => {
    const p = { id: 'pk0001', chog: lazoorChog, gang: 'lazoor' as const, cash: 400, gold: false, now: NOW };
    expect(await claimPumpkin(db, p)).toEqual({ paid: 400 });
    expect(await claimPumpkin(db, { ...p, chog: lazoorMate })).toEqual({ paid: 0 });
    expect((await vaultCash(db)).lazoor).toBe(START_CASH + 400);
    // Not your gang, or a silly amount: refused or capped.
    expect(await refused(claimPumpkin(db, { ...p, id: 'pk0002', gang: 'mcga' }))).toBe('no-gang');
    expect(await claimPumpkin(db, { ...p, id: 'pk0003', cash: 99_999 })).toEqual({ paid: 1500 });
    const tally = await pumpkinTally(db, NOW - HOUR, NOW + HOUR);
    expect(tally).toMatchObject({ count: 2, total: 1900, gangs: [{ gang: 'lazoor', cash: 1900 }] });
    expect(tally.best).toMatchObject({ chog: lazoorChog, cash: 1900, n: 2 });
  });
});

describe('most wanted', () => {
  it('is yesterday’s best robber, with a bounty from what they stole, kept for the day', async () => {
    await robbed('r1aaaaaaaa', lazoorChog, 'lazoor', 9000);
    await robbed('r2aaaaaaaa', lazoorChog, 'lazoor', 11_000);
    await robbed('r3aaaaaaaa', mcgaChog, 'mcga', 15_000);
    // Today's own hauls don't count until tomorrow.
    await robbed('r4aaaaaaaa', lazoorMate, 'lazoor', 50_000, DAY);
    const w = await wantedToday(db, NOW);
    expect(w).toMatchObject({ day: DAY, chog: lazoorChog, gang: 'lazoor', stole: 20_000, bounty: 3000 });
    await robbed('r5aaaaaaaa', mcgaChog, 'mcga', 99_000);
    expect((await wantedToday(db, NOW + HOUR))!.chog).toBe(lazoorChog);
    expect(bountyFor(1000)).toBe(1000);
    expect(bountyFor(1_000_000)).toBe(6000);
  });

  it('nobody on a quiet day', async () => {
    await robbed('r1aaaaaaaa', lazoorChog, 'lazoor', 500);
    expect(await wantedToday(db, NOW)).toBeNull();
  });

  it('a rival tag moves the bounty and jails them, once; their own gang can’t claim it', async () => {
    await robbed('r1aaaaaaaa', lazoorChog, 'lazoor', 20_000);
    await wantedToday(db, NOW);
    expect(await wantedBonus(db, lazoorChog, NOW)).toBe(WANTED_BONUS);
    expect(await refused(tagWanted(db, { day: DAY, chog: lazoorChog, by: lazoorMate, now: NOW }))).toBe(
      'own-gang',
    );
    const r = await tagWanted(db, { day: DAY, chog: lazoorChog, by: mcgaChog, now: NOW });
    expect(r).toEqual({ bounty: 3000, jailedUntil: NOW + 30 * 60_000 });
    expect(await vaultCash(db)).toMatchObject({ lazoor: START_CASH - 3000, mcga: START_CASH + 3000 });
    expect((await heistRecord(db, lazoorChog))!.jailedUntil!.getTime()).toBe(NOW + 30 * 60_000);
    expect((await heistRecord(db, mcgaChog))!.catches).toBe(1);
    expect(await wantedBonus(db, lazoorChog, NOW)).toBe(0);
    expect(await refused(tagWanted(db, { day: DAY, chog: lazoorChog, by: mcgaChog, now: NOW }))).toBe('no-run');
  });

  it('your own Chog in another gang can’t claim your bounty', async () => {
    const alt = born('mcga')[1]!.id;
    await setOwners(db, [{ tokenId: alt, owner: A, block: 2 }]);
    await setGang(db, A, alt, 'mcga');
    await robbed('r1aaaaaaaa', lazoorChog, 'lazoor', 20_000);
    await wantedToday(db, NOW);
    expect(await refused(tagWanted(db, { day: DAY, chog: lazoorChog, by: alt, now: NOW }))).toBe('not-yours');
    expect((await vaultCash(db)).lazoor).toBe(START_CASH);
  });

  it('pays only what the vault has, and only on its own day', async () => {
    await robbed('r1aaaaaaaa', lazoorChog, 'lazoor', 40_000);
    await wantedToday(db, NOW);
    await db.update(gangVaults).set({ cash: 1200 }).where(eq(gangVaults.gang, 'lazoor'));
    expect(
      await refused(tagWanted(db, { day: DAY - 1, chog: lazoorChog, by: mcgaChog, now: NOW })),
    ).toBe('too-late');
    expect((await tagWanted(db, { day: DAY, chog: lazoorChog, by: mcgaChog, now: NOW })).bounty).toBe(1200);
    expect(dayOf(NOW)).toBe(DAY);
  });
});
