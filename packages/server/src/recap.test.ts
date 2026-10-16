import { describe, expect, it } from 'vitest';
import { heistRuns } from './db/index.ts';
import { ensureVaults } from './heists.ts';
import { dayRecap } from './recap.ts';
import { testDb } from './test-db.ts';

const run = (id: string, o: Partial<typeof heistRuns.$inferInsert>) => ({
  id,
  chogId: 1,
  player: '0xaa',
  gang: 'mcga' as const,
  target: 'lazoor' as const,
  day: 100,
  vault: 'rush-bank',
  tier: 1,
  powers: [],
  guards: [],
  finishedAt: new Date(),
  ...o,
});

describe('day recap', () => {
  it('adds up the day: hauls, the hardest-hit gang, the best catcher, break-outs', async () => {
    const { db } = await testDb();
    await ensureVaults(db);
    await db.insert(heistRuns).values([
      run('aaaaaaaa1', { result: 'escaped', moved: 900, getaway: 'home' }),
      run('aaaaaaaa2', { chogId: 2, result: 'escaped', moved: 300, target: 'royals' }),
      run('aaaaaaaa3', { chogId: 3, result: 'busted', moved: 250, caughtBy: 77, getaway: 'caught' }),
      run('aaaaaaaa4', { chogId: 4, result: 'busted', moved: 250, caughtBy: 77 }),
      run('aaaaaaaa5', { chogId: 5, result: 'escaped', prisoner: 9, target: 'mcga' }),
      // Still on the way home: not counted yet. Another day: not counted.
      run('aaaaaaaa6', { chogId: 6, result: 'escaped', moved: 5000, getaway: 'running' }),
      run('aaaaaaaa7', { chogId: 7, result: 'escaped', moved: 5000, day: 99 }),
    ]);
    const r = await dayRecap(db, 100);
    expect(r).toMatchObject({
      robberies: 4,
      home: 2,
      caught: 2,
      stolen: 1200,
      biggest: { run: 'aaaaaaaa1', chog: 1, cash: 900 },
      hardestHit: { gang: 'lazoor', lost: 900, times: 1 },
      catcher: { chog: 77, catches: 2 },
      breakouts: { tried: 1, freed: 1 },
    });
    expect(r.top).toHaveLength(3);
  });
});
