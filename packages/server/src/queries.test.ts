import { CHOGS } from '@chog-city/data';
import {
  HOUR,
  addWanted,
  chogInfo,
  dayOf,
  dayStart,
  newChogState,
  sendToJail,
  type GameEvent,
} from '@chog-city/game';
import { beforeEach, describe, expect, it } from 'vitest';
import { crews, days, events, type Db } from './db/index.ts';
import { setOwners } from './ownership.ts';
import { crewsFor, finder, gangStandings, inbox, recap, targets, turfToday } from './queries.ts';
import { lockStates, saveStates } from './states.ts';
import { testDb } from './test-db.ts';

const A = '0x00000000000000000000000000000000000000aa';
const B = '0x00000000000000000000000000000000000000bb';
const NOW = dayStart(20_400) + 3 * HOUR;
const DAY = dayOf(NOW);
const laserIds = CHOGS.filter((c) => chogInfo(c.id).skills.includes('laser') && !chogInfo(c.id).wildcard).map(
  (c) => c.id,
);
const [mine1, mine2] = [laserIds[0]!, laserIds[1]!];
const [rich, poor, crook, jailbird] = [laserIds[2]!, laserIds[3]!, laserIds[4]!, laserIds[5]!];

let db: Db;

async function put(id: number, f: (s: ReturnType<typeof newChogState>) => ReturnType<typeof newChogState>) {
  await db.transaction(async (tx) => {
    const st = await lockStates(tx, [id], NOW);
    await saveStates(tx, [f(st.get(id)!)]);
  });
}

const job = (
  chogId: number,
  pay: number,
  extra: Partial<Extract<GameEvent, { type: 'job' }>> = {},
): GameEvent => ({
  type: 'job',
  chogId,
  gang: 'lazoor',
  jobId: 'skim-atm',
  district: 'mon-square',
  crewId: null,
  success: pay > 0,
  roll: 10,
  odds: 60,
  pay,
  turf: pay > 0 ? 2 : 0,
  xp: 10,
  wanted: 1,
  jailedUntil: 0,
  rollLabel: 'x',
  ...extra,
});

async function addEvent(e: GameEvent, day = DAY) {
  await db
    .insert(events)
    .values({
      day,
      at: new Date(NOW),
      type: e.type,
      chogId: e.chogId,
      target: 'target' in e ? e.target : null,
      data: e,
    });
}

beforeEach(async () => {
  ({ db } = await testDb());
  await setOwners(db, [
    { tokenId: mine1, owner: A, block: 1 },
    { tokenId: mine2, owner: A, block: 1 },
    { tokenId: rich, owner: B, block: 1 },
    { tokenId: poor, owner: B, block: 1 },
    { tokenId: crook, owner: B, block: 1 },
    { tokenId: jailbird, owner: B, block: 1 },
  ]);
  await put(mine1, (s) => ({ ...s, active: true, cash: 9999, gang: 'lazoor' }));
  await put(rich, (s) => ({ ...s, active: true, cash: 900, gang: 'lazoor' }));
  await put(poor, (s) => ({ ...s, active: true, cash: 50, gang: 'mcga' }));
  await put(crook, (s) => ({ ...addWanted({ ...s, active: true }, 4, NOW), cash: 300 }));
  await put(jailbird, (s) => ({ ...sendToJail({ ...s, active: true }, NOW), cash: 2000 }));
});

describe('targets', () => {
  it('lists robbery targets richest first, without your own Chogs or jailed ones', async () => {
    const t = await targets(db, 'rob', [A], NOW);
    const ids = t.map((x) => x.id);
    expect(ids).not.toContain(mine1);
    expect(ids).not.toContain(jailbird);
    expect(ids.indexOf(rich)).toBeLessThan(ids.indexOf(poor));
  });

  it('lists only Chogs with 3+ stars for arrests, after stars wear off', async () => {
    expect((await targets(db, 'arrest', [A], NOW)).map((x) => x.id)).toEqual([crook]);
    // 4 stars, one wears off every 6 hours: after 7 hours it has 3, after 13 it has 2.
    expect((await targets(db, 'arrest', [A], NOW + 7 * HOUR)).map((x) => x.id)).toEqual([crook]);
    expect(await targets(db, 'arrest', [A], NOW + 13 * HOUR)).toEqual([]);
  });

  it('lists jailed Chogs', async () => {
    expect((await targets(db, 'jailed', [], NOW)).map((x) => x.id)).toEqual([jailbird]);
  });
});

describe('finder', () => {
  it('finds active players with a skill who are free to join', async () => {
    const ids = (await finder(db, 'laser', NOW)).map((x) => x.id);
    expect(ids).toEqual(expect.arrayContaining([mine1, rich, poor, crook]));
    expect(ids).not.toContain(jailbird);
    expect(ids).not.toContain(mine2); // never played
  });
});

describe('turf, gangs and recap', () => {
  beforeEach(async () => {
    await db
      .insert(days)
      .values({ day: DAY, seed: '00', commitment: '00', holders: { 'mon-square': 'lazoor' }, changes: [] });
    await db.insert(days).values({
      day: DAY + 1,
      seed: '00',
      commitment: '00',
      holders: { 'mon-square': 'mcga' },
      changes: [{ district: 'mon-square', from: 'lazoor', to: 'mcga', score: 4 }],
    });
    await addEvent(job(rich, 40));
    await addEvent(job(poor, 75, { gang: 'mcga' }));
    await addEvent(job(poor, 0, { gang: 'mcga', jailedUntil: NOW + HOUR }));
    await addEvent({
      type: 'rob',
      chogId: rich,
      target: poor,
      revenge: false,
      success: true,
      roll: 1,
      odds: 60,
      loot: 5,
      jailedUntil: 0,
      rollLabel: 'r',
    });
    await addEvent({
      type: 'rob',
      chogId: crook,
      target: poor,
      revenge: false,
      success: true,
      roll: 1,
      odds: 60,
      loot: 4,
      jailedUntil: 0,
      rollLabel: 'r',
    });
  });

  it('scores today with the same rules as the flip', async () => {
    const t = await turfToday(db, NOW);
    expect(t.scores['mon-square']).toEqual({ lazoor: 2, mcga: 2 });
    expect(t.holders).toEqual({ 'mon-square': 'lazoor' });
  });

  it('ranks gangs by districts held, then district-days', async () => {
    const g = await gangStandings(db, NOW);
    expect(g[0]!.gang).toBe('lazoor');
    expect(g[0]!.holds).toEqual(['mon-square']);
    expect(g.find((x) => x.gang === 'mcga')!.districtDays).toBe(1);
    expect(g.find((x) => x.gang === 'lazoor')!.members).toBe(2);
  });

  it('summarises a day', async () => {
    const r = await recap(db, DAY);
    expect(r).toMatchObject({ jobs: 3, jobsWon: 2, robberies: 2, jailed: 1 });
    expect(r.biggestJob?.event.chogId).toBe(poor);
    expect(r.mostRobbed).toEqual({ id: poor, times: 2 });
    expect(r.topEarner).toEqual({ id: poor, cash: 75 });
    expect(r.changes[0]).toMatchObject({ district: 'mon-square', to: 'mcga' });
  });
});

describe('inbox and crews', () => {
  it('shows what happened to your Chogs', async () => {
    await addEvent({
      type: 'rob',
      chogId: rich,
      target: mine1,
      revenge: false,
      success: true,
      roll: 1,
      odds: 60,
      loot: 99,
      jailedUntil: 0,
      rollLabel: 'r',
    });
    await addEvent(job(mine1, 30)); // a solo job: not inbox news
    await addEvent(job(mine1, 120, { crewId: `${DAY}-1` }));
    const items = await inbox(db, [mine1]);
    expect(items.map((i) => i.event.type)).toEqual(['job', 'rob']);
  });

  it('finds crews by member, with numeric slots', async () => {
    await db
      .insert(crews)
      .values({
        id: `${DAY}-7`,
        day: DAY,
        offerKey: 'con-whale@purple-hill',
        leaderId: rich,
        slots: [rich, null],
        status: 'open',
      });
    await db
      .insert(crews)
      .values({
        id: `${DAY}-8`,
        day: DAY,
        offerKey: 'con-whale@purple-hill',
        leaderId: mine1,
        slots: [mine1, poor],
        status: 'done',
      });
    const c = await crewsFor(db, NOW, [mine1]);
    expect(c.open.map((x) => x.id)).toEqual([`${DAY}-7`]);
    expect(c.mine.map((x) => x.id)).toEqual([`${DAY}-8`]);
  });
});
