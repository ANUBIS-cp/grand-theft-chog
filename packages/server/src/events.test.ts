import { CHOGS } from '@chog-city/data';
import { afterEach, describe, expect, it } from 'vitest';
import { heistRuns } from './db/index.ts';
import { ELECTION, HALLOWEEN_NIGHT, HALLOWEEN_WEEK, election, eventBonus, eventsNow } from './events.ts';
import { testDb } from './test-db.ts';

const lefts = CHOGS.filter((c) => c.traits.Side === 'Left').map((c) => c.id);
const rights = CHOGS.filter((c) => c.traits.Side === 'Right').map((c) => c.id);
let n = 0;
const run = (chogId: number, o: Partial<typeof heistRuns.$inferInsert> = {}) => ({
  id: `evtrun${String(n++).padStart(4, '0')}`,
  chogId,
  player: '0xaa',
  gang: 'mcga' as const,
  target: 'lazoor' as const,
  day: 1,
  vault: 'rush-bank',
  tier: 1,
  powers: [],
  guards: [],
  startedAt: new Date(ELECTION.from + 3_600_000),
  finishedAt: new Date(ELECTION.from + 3_700_000),
  result: 'escaped' as const,
  moved: 500,
  getaway: 'home' as const,
  ...o,
});

afterEach(() => {
  delete process.env.EVENTS;
});

describe('judging-week events', () => {
  it('scores the election per Chog that played, so the bigger side can lose', async () => {
    const { db } = await testDb();
    await db.insert(heistRuns).values([
      // Left: one Chog, two bags home.
      run(lefts[0]!),
      run(lefts[0]!),
      // Right: three Chogs, three bags home and one bust and a bag still on its way.
      run(rights[0]!),
      run(rights[1]!),
      run(rights[2]!),
      run(rights[2]!, { result: 'busted', getaway: null }),
      run(rights[1]!, { getaway: 'running' }),
      // Before the election: doesn't count.
      run(rights[3]!, { startedAt: new Date(ELECTION.from - 1000) }),
    ]);
    const e = await election(db, ELECTION.to);
    expect(e.left).toEqual({ points: 2, players: 1, score: 2 });
    expect(e.right).toEqual({ points: 3, players: 3, score: 1 });
    expect(e.leader).toBe('Left');
    // The winners take 20% more for three days; the losers don't.
    expect(await eventBonus(db, lefts[1]!, 'mcga', ELECTION.to + 1000)).toBe(20);
    expect(await eventBonus(db, rights[5]!, 'mcga', ELECTION.to + 1000)).toBe(0);
    expect((await eventsNow(db, ELECTION.from + 1000)).side?.kind).toBe('election');
  });
  it('Halloween: Skulls and Radioactive take 25% more all week, everyone double on the night', async () => {
    const { db } = await testDb();
    const mid = HALLOWEEN_WEEK.from + 86_400_000 * 1.5;
    expect(await eventBonus(db, rights[0]!, 'skulls', mid)).toBe(25);
    expect(await eventBonus(db, rights[0]!, 'mcga', mid)).toBe(0);
    expect(await eventBonus(db, rights[0]!, 'mcga', HALLOWEEN_NIGHT.from + 1000)).toBe(100);
    expect(await eventBonus(db, rights[0]!, 'radioactive', HALLOWEEN_NIGHT.from + 1000)).toBe(125);
    process.env.EVENTS = 'off';
    expect(await eventBonus(db, rights[0]!, 'skulls', mid)).toBe(0);
  });
});
