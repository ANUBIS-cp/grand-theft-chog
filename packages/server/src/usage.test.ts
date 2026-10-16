import { DAY, dayStart } from '@chog-city/game';
import { describe, expect, it } from 'vitest';
import { testDb } from './test-db.ts';
import { noteVisit, usage } from './usage.ts';

describe('usage', () => {
  it('counts each person once a day, and who came back', async () => {
    const { db } = await testDb();
    const d0 = dayStart(20_000) + 3_600_000;
    // A holder comes two days running (twice on the first), a guest comes once.
    await noteVisit(db, { who: '0xaa', holder: true, chogId: 5, now: d0 });
    await noteVisit(db, { who: '0xaa', holder: true, chogId: 5, now: d0 + 60_000 });
    await noteVisit(db, { who: 'g:x', holder: false, chogId: null, now: d0 });
    await noteVisit(db, { who: '0xaa', holder: true, chogId: 5, now: d0 + DAY });
    const u = await usage(db, d0 + 2 * DAY);
    expect(u).toMatchObject({ holdersEver: 1, guestsEver: 1, chogsEver: 1 });
    // Day 0: two people, one came back the next day. Day 1's visitor can't be judged until day 2 is over.
    expect(u.backNextDay).toEqual({ of: 2, back: 1 });
    expect(u.days.find((d) => d.start === dayStart(20_000))).toMatchObject({ holders: 1, guests: 1 });
  });
});
