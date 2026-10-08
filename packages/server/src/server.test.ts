import { CHOGS, gangOptions } from '@chog-city/data';
import { LEVEL_XP, dayOf, dayStart, infoOf } from '@chog-city/game';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { crews, days, delegations, events } from './db/index.ts';
import { ensureDay } from './days.ts';
import { applyMove } from './moves.ts';
import { chogsFor, setOwners } from './ownership.ts';
import { getStates, lockStates, saveStates, seedStates } from './states.ts';
import { testDb } from './test-db.ts';
import type { Db } from './db/index.ts';

const A = '0x00000000000000000000000000000000000000aa';
const B = '0x00000000000000000000000000000000000000bb';
const C = '0x00000000000000000000000000000000000000cc';
const NOW = dayStart(20_400) + 3 * 3_600_000;

const withSkill = (k: string, not: string[] = []) =>
  CHOGS.find((c) => {
    const i = infoOf(c);
    return !i.wildcard && i.skills.includes(k as never) && not.every((n) => !i.skills.includes(n as never));
  })!.id;

const tech = withSkill('tech');
const smooth = withSkill('smooth', ['money']);
const money = withSkill('money', ['smooth']);
const other = CHOGS.find((c) => ![tech, smooth, money].includes(c.id))!.id;

let db: Db;
beforeEach(async () => {
  ({ db } = await testDb());
  await setOwners(db, [
    { tokenId: tech, owner: A, block: 1 },
    { tokenId: smooth, owner: A, block: 1 },
    { tokenId: money, owner: B, block: 1 },
    { tokenId: other, owner: B, block: 1 },
  ]);
});

describe('server moves', () => {
  it('plays a solo job for the owner and stores the event', async () => {
    const r = await applyMove(db, A, { action: 'job', chogId: tech, offerKey: 'skim-atm@mon-square' }, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.events).toHaveLength(1);
    const stored = await db.select().from(events);
    expect(stored).toHaveLength(1);
    expect(stored[0]!.day).toBe(dayOf(NOW));
    const st = (await getStates(db, [tech])).get(tech)!;
    expect(st.movesUsed).toBe(1);
    expect(st.active).toBe(true);
  });

  it('refuses Chogs you do not control, and lets an approved wallet play', async () => {
    expect(
      await applyMove(db, B, { action: 'job', chogId: tech, offerKey: 'skim-atm@mon-square' }, NOW),
    ).toEqual({ ok: false, error: 'NOT_YOUR_CHOG' });
    await db.insert(delegations).values({ owner: A, player: C, signature: '0x' });
    expect(
      (await applyMove(db, C, { action: 'job', chogId: tech, offerKey: 'skim-atm@mon-square' }, NOW)).ok,
    ).toBe(true);
    expect((await chogsFor(db, C)).map((x) => x.tokenId).sort()).toEqual([smooth, tech].sort());
  });

  it('does not let you rob your own Chogs', async () => {
    expect(await applyMove(db, A, { action: 'rob', chogId: tech, target: smooth }, NOW)).toEqual({
      ok: false,
      error: 'SAME_OWNER',
    });
    expect((await applyMove(db, A, { action: 'rob', chogId: tech, target: money }, NOW)).ok).toBe(true);
  });

  it('only accepts gangs the traits allow', async () => {
    const chog = CHOGS[tech - 1]!;
    const allowed = gangOptions(chog).anyGang ? 'robbers' : gangOptions(chog).born[0]!;
    expect((await applyMove(db, A, { action: 'gang', chogId: tech, gang: allowed }, NOW)).ok).toBe(true);
    expect(
      await applyMove(db, A, { action: 'gang', chogId: tech, gang: 'not-a-gang' as never }, NOW),
    ).toEqual({ ok: false, error: 'GANG_NOT_ALLOWED' });
  });

  it('runs a crew job across two wallets', async () => {
    // Both need level 2 for crew jobs.
    await db.transaction(async (tx) => {
      const st = await lockStates(tx, [smooth, money], NOW);
      await saveStates(
        tx,
        [...st.values()].map((s) => ({ ...s, xp: LEVEL_XP[1] })),
      );
    });
    const open = await applyMove(
      db,
      A,
      { action: 'crew.open', chogId: smooth, offerKey: 'con-whale@purple-hill', slot: 0 },
      NOW,
    );
    expect(open.ok).toBe(true);
    if (!open.ok) return;
    expect(open.crew!.id).toBe(`${dayOf(NOW)}-1`);
    const join = await applyMove(
      db,
      B,
      { action: 'crew.join', chogId: money, crewId: open.crew!.id, slot: 1 },
      NOW + 60_000,
    );
    expect(join.ok).toBe(true);
    if (!join.ok) return;
    expect(join.crew!.status).toBe('done');
    expect(join.events.filter((e) => e.event.type === 'job')).toHaveLength(2);
    const [row] = await db.select().from(crews).where(eq(crews.id, open.crew!.id));
    expect(row!.status).toBe('done');
    const st = await getStates(db, [smooth, money]);
    expect([...st.values()].every((s) => s.crewId === null)).toBe(true);
  });

  it('expires open crews and flips turf when the next day starts', async () => {
    await db.transaction(async (tx) => {
      const st = await lockStates(tx, [smooth], NOW);
      await saveStates(
        tx,
        [...st.values()].map((s) => ({ ...s, xp: LEVEL_XP[1] })),
      );
    });
    const chog = CHOGS[tech - 1]!;
    const gang = gangOptions(chog).anyGang ? 'robbers' : gangOptions(chog).born[0]!;
    await applyMove(db, A, { action: 'gang', chogId: tech, gang }, NOW);
    // Play legal jobs until one succeeds, so there are turf points.
    for (const k of [
      'clean-streets@lemon-row',
      'clean-streets@aqua-docks',
      'clean-streets@mon-square',
      'clean-streets@pink-strip',
    ])
      await applyMove(db, A, { action: 'job', chogId: tech, offerKey: k }, NOW);
    const open = await applyMove(
      db,
      A,
      { action: 'crew.open', chogId: smooth, offerKey: 'con-whale@purple-hill', slot: 0 },
      NOW,
    );
    expect(open.ok).toBe(true);

    const tomorrow = await ensureDay(db, dayOf(NOW) + 1);
    expect(Object.values(tomorrow.holders)).toContain(gang);
    const [row] = await db.select().from(crews);
    expect(row!.status).toBe('expired');
    expect((await getStates(db, [smooth])).get(smooth)!.crewId).toBeNull();
    // Creating the day twice changes nothing.
    expect((await ensureDay(db, dayOf(NOW) + 1)).seed).toBe(tomorrow.seed);
    expect(await db.select().from(days)).toHaveLength(2);
  });

  it('seeds every Chog once', async () => {
    expect(await seedStates(db, NOW)).toBe(1969);
    expect(await seedStates(db, NOW)).toBe(0);
  });
});
