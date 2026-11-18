import type { GangId } from '@chog-city/data';
import { START_CASH } from '@chog-city/game/heist';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { gangVaults, heistRuns, type Db } from './db/index.ts';
import { ensureVaults } from './heists.ts';
import { closeSeasons, seasonBoard, titlesFor } from './season-titles.ts';
import { testDb } from './test-db.ts';

const NOV = (d: number, h = 12) => Date.UTC(2026, 10, d, h);
const DEC_1 = Date.UTC(2026, 11, 1, 0, 1);

let n = 0;
function run(
  db: Db,
  r: {
    chog: number;
    gang: GangId;
    target: GangId;
    at: number;
    result: 'escaped' | 'busted';
    moved: number;
    caughtBy?: number;
    prisoner?: number;
  },
) {
  return db.insert(heistRuns).values({
    id: `r${++n}`,
    chogId: r.chog,
    player: '0xaa',
    gang: r.gang,
    target: r.target,
    day: 1,
    vault: 'v',
    tier: 1,
    powers: [],
    guards: [],
    startedAt: new Date(r.at - 60_000),
    finishedAt: new Date(r.at),
    result: r.result,
    moved: r.moved,
    caughtBy: r.caughtBy ?? null,
    prisoner: r.prisoner ?? null,
  });
}

describe('monthly seasons', () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await testDb());
    await ensureVaults(db);
  });

  it('hands out nothing while the season is still on', async () => {
    await run(db, { chog: 1, gang: 'royals', target: 'clowns', at: NOV(20), result: 'escaped', moved: 900 });
    expect(await closeSeasons(db, NOV(30, 23))).toEqual([]);
    expect((await titlesFor(db, [1])).size).toBe(0);
  });

  it('at the end, titles go on the winning Chogs for good and every vault starts again', async () => {
    // Royals steal the most and end with the biggest vault; Chog 1 is their best robber, Chog 2 robbed too.
    await run(db, { chog: 1, gang: 'royals', target: 'clowns', at: NOV(20), result: 'escaped', moved: 900 });
    await run(db, { chog: 1, gang: 'royals', target: 'skulls', at: NOV(21), result: 'escaped', moved: 600 });
    await run(db, {
      chog: 2,
      gang: 'royals',
      target: 'skulls',
      at: NOV(22),
      result: 'busted',
      moved: 300,
      caughtBy: 7,
    });
    await run(db, { chog: 3, gang: 'clowns', target: 'royals', at: NOV(23), result: 'escaped', moved: 1000 });
    // Chog 7 (Skulls) catches twice; Chog 8 (Royals) once.
    await run(db, {
      chog: 3,
      gang: 'clowns',
      target: 'skulls',
      at: NOV(24),
      result: 'busted',
      moved: 250,
      caughtBy: 7,
    });
    await run(db, {
      chog: 4,
      gang: 'clowns',
      target: 'royals',
      at: NOV(25),
      result: 'busted',
      moved: 250,
      caughtBy: 8,
    });
    // Before the season, and a jail break-out: neither counts.
    await run(db, { chog: 5, gang: 'suits', target: 'royals', at: NOV(10), result: 'escaped', moved: 5000 });
    await run(db, {
      chog: 6,
      gang: 'suits',
      target: 'royals',
      at: NOV(26),
      result: 'escaped',
      moved: 0,
      prisoner: 5,
    });
    await db.update(gangVaults).set({ cash: 5000 });
    await db
      .update(gangVaults)
      .set({ cash: 8000, guardLevel: 2, guardUntil: new Date(DEC_1 + 3_600_000) })
      .where(eq(gangVaults.gang, 'royals'));

    expect(await closeSeasons(db, DEC_1)).toEqual([1]);
    const t = await titlesFor(db, [1, 2, 3, 7, 8, 5]);
    expect(
      t
        .get(1)!
        .map((x) => x.name)
        .sort(),
    ).toEqual(['Richest Gang', 'Top Robber']);
    expect(t.get(1)!.find((x) => x.kind === 'robber')!.amount).toBe(1500);
    expect(t.get(2)!.map((x) => x.name)).toEqual(['Richest Gang']);
    expect(t.get(8)!.map((x) => x.name)).toEqual(['Richest Gang']); // guarded for the Royals
    expect(t.get(7)!.map((x) => x.name)).toEqual(['Best Guard']);
    expect(t.has(3)).toBe(false);
    expect(t.has(5)).toBe(false);

    const v = await db.select().from(gangVaults);
    expect(v.every((r) => r.cash === START_CASH && r.guardLevel === 0 && r.guardUntil === null)).toBe(true);

    // Only once.
    await db.update(gangVaults).set({ cash: 123 }).where(eq(gangVaults.gang, 'royals'));
    expect(await closeSeasons(db, DEC_1 + 120_000)).toEqual([]);
    expect((await db.select().from(gangVaults).where(eq(gangVaults.gang, 'royals')))[0]!.cash).toBe(123);
  });

  it('a season where nobody robbed anyone gives no titles, but the vaults still start fresh', async () => {
    await db.update(gangVaults).set({ cash: 5000 });
    await db.update(gangVaults).set({ cash: 9000 }).where(eq(gangVaults.gang, 'royals'));
    expect(await closeSeasons(db, DEC_1)).toEqual([1]);
    const b = await seasonBoard(db, DEC_1);
    expect(b!.season).toBe(2);
    expect(b!.past).toEqual([]);
    expect((await db.select().from(gangVaults).where(eq(gangVaults.gang, 'royals')))[0]!.cash).toBe(
      START_CASH,
    );
  });

  it('the board shows who is leading now and when it ends', async () => {
    await run(db, { chog: 1, gang: 'royals', target: 'clowns', at: NOV(20), result: 'escaped', moved: 900 });
    await run(db, {
      chog: 3,
      gang: 'clowns',
      target: 'royals',
      at: NOV(21),
      result: 'busted',
      moved: 250,
      caughtBy: 8,
    });
    const b = await seasonBoard(db, NOV(22));
    expect(b!.season).toBe(1);
    expect(b!.endsAt).toBe(Date.UTC(2026, 11, 1));
    expect(b!.robbers[0]).toMatchObject({ chogId: 1, amount: 900, gang: 'royals' });
    expect(b!.guards[0]).toMatchObject({ chogId: 8, amount: 1, gang: 'royals' });
    // The past seasons show their winners once closed.
    await closeSeasons(db, DEC_1);
    const after = await seasonBoard(db, DEC_1);
    expect(after!.past[0]).toMatchObject({ season: 1, robber: 1, guard: 8 });
    expect(after!.robbers).toEqual([]);
  });
});
