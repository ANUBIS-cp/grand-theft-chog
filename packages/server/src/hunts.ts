import { GANG_IDS, type GangId } from '@chog-city/data';
import { dayOf } from '@chog-city/game';
import { JAIL_MS } from '@chog-city/game/heist';
import { and, desc, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm';
import { gangVaults, heistChogs, heistRuns, mostWanted, pumpkins, type Db } from './db/index.ts';
import { HeistRefused } from './heists.ts';
import { sameOwner } from './ownership.ts';

// The city's two live hunts (the live server, apps/live/src/hunts.ts, is the referee and reports here, signed).
//
// Pumpkin Rush: a pumpkin a Chog reached first lands in its gang's vault. New cash, so the amount is capped and
// each pumpkin pays once.
//
// Most Wanted: each game day, the Chog that stole the most the day before has a bounty on its head, paid out of
// its own gang's vault to the gang of whoever tags it in the city. Being wanted pays too: its hauls take
// WANTED_BONUS% more while the bounty stands, so it's worth playing, not hiding.

export const PUMPKIN_MAX = 1500;
export const WANTED_MIN_STOLE = 2000;
export const WANTED_SHARE = 15;
export const WANTED_BOUNTY = { min: 1000, max: 6000 };
export const WANTED_BONUS = 25;

export const bountyFor = (stole: number) =>
  Math.max(
    WANTED_BOUNTY.min,
    Math.min(WANTED_BOUNTY.max, Math.round((stole * WANTED_SHARE) / 100 / 50) * 50),
  );

/** A pumpkin the live server says a Chog reached first. Pays once; the Chog must be in the gang it names. */
export async function claimPumpkin(
  db: Db,
  p: { id: string; chog: number; gang: GangId; cash: number; gold: boolean; now: number },
): Promise<{ paid: number }> {
  if (!/^[a-z0-9]{6,24}$/.test(p.id) || !GANG_IDS.includes(p.gang)) throw new HeistRefused('bad-inputs');
  const cash = Math.max(0, Math.min(PUMPKIN_MAX, Math.floor(p.cash)));
  return db.transaction(async (tx) => {
    const [me] = await tx.select({ gang: heistChogs.gang }).from(heistChogs).where(eq(heistChogs.id, p.chog));
    if (me?.gang !== p.gang) throw new HeistRefused('no-gang');
    const won = await tx
      .insert(pumpkins)
      .values({ id: p.id, chogId: p.chog, gang: p.gang, cash, gold: p.gold, at: new Date(p.now) })
      .onConflictDoNothing()
      .returning({ id: pumpkins.id });
    if (!won.length) return { paid: 0 };
    await tx
      .update(gangVaults)
      .set({ cash: sql`${gangVaults.cash} + ${cash}`, updatedAt: new Date(p.now) })
      .where(eq(gangVaults.gang, p.gang));
    return { paid: cash };
  });
}

export interface WantedToday {
  day: number;
  chog: number;
  gang: GangId;
  bounty: number;
  stole: number;
  claimedBy: number | null;
}

/**
 * Today's Most Wanted: worked out once per game day, from the day before (cash carried home, not break-outs),
 * and kept, so it doesn't change as the day goes on. Null on a quiet day.
 */
export async function wantedToday(db: Db, now: number): Promise<WantedToday | null> {
  const day = dayOf(now);
  let [row] = await db.select().from(mostWanted).where(eq(mostWanted.day, day));
  if (!row) {
    const [top] = await db
      .select({
        chog: heistRuns.chogId,
        gang: heistRuns.gang,
        stole: sql<number>`sum(${heistRuns.moved})::int`,
      })
      .from(heistRuns)
      .where(
        and(
          eq(heistRuns.day, day - 1),
          eq(heistRuns.result, 'escaped'),
          isNull(heistRuns.prisoner),
          sql`(${heistRuns.getaway} is null or ${heistRuns.getaway} = 'home')`,
        ),
      )
      .groupBy(heistRuns.chogId, heistRuns.gang)
      .orderBy(desc(sql`sum(${heistRuns.moved})`))
      .limit(1);
    const pick = top && top.stole >= WANTED_MIN_STOLE ? top : null;
    await db
      .insert(mostWanted)
      .values({
        day,
        chogId: pick?.chog ?? null,
        gang: (pick?.gang as GangId | undefined) ?? null,
        stole: pick?.stole ?? 0,
        bounty: pick ? bountyFor(pick.stole) : 0,
      })
      .onConflictDoNothing();
    [row] = await db.select().from(mostWanted).where(eq(mostWanted.day, day));
  }
  if (!row || row.chogId === null || row.gang === null) return null;
  return {
    day,
    chog: row.chogId,
    gang: row.gang,
    bounty: row.bounty,
    stole: row.stole,
    claimedBy: row.claimedBy,
  };
}

/** Extra percent on hauls: today's Most Wanted, while nobody has claimed the bounty. */
export async function wantedBonus(db: Db, chogId: number, at: number): Promise<number> {
  const [row] = await db
    .select({ chog: mostWanted.chogId, claimed: mostWanted.claimedBy })
    .from(mostWanted)
    .where(eq(mostWanted.day, dayOf(at)));
  return row && row.chog === chogId && row.claimed === null ? WANTED_BONUS : 0;
}

/**
 * The live server saw a rival tag today's Most Wanted. The bounty moves from the wanted Chog's gang to the
 * tagger's (as much as that vault has), the tagger gets the catch, and the wanted Chog goes to jail. Once a day.
 */
export async function tagWanted(
  db: Db,
  t: { day: number; chog: number; by: number; now: number },
): Promise<{ bounty: number; jailedUntil: number }> {
  if (t.day !== dayOf(t.now)) throw new HeistRefused('too-late');
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(mostWanted).where(eq(mostWanted.day, t.day)).for('update');
    if (!row || row.chogId !== t.chog || row.gang === null || row.claimedBy !== null)
      throw new HeistRefused('no-run');
    const [tagger] = await tx
      .select({ gang: heistChogs.gang })
      .from(heistChogs)
      .where(eq(heistChogs.id, t.by));
    if (!tagger?.gang || tagger.gang === row.gang) throw new HeistRefused('own-gang');
    // Your own other Chog can't claim it: that would move the gang's shared cash to another gang of yours.
    if (await sameOwner(tx as unknown as Db, t.by, t.chog)) throw new HeistRefused('not-yours');
    const pair = [row.gang, tagger.gang].sort();
    const vaults = await tx
      .select()
      .from(gangVaults)
      .where(inArray(gangVaults.gang, pair))
      .orderBy(gangVaults.gang)
      .for('update');
    const has = vaults.find((v) => v.gang === row.gang)?.cash ?? 0;
    const bounty = Math.max(0, Math.min(row.bounty, has));
    const at = new Date(t.now);
    if (bounty) {
      await tx
        .update(gangVaults)
        .set({ cash: sql`${gangVaults.cash} - ${bounty}`, updatedAt: at })
        .where(eq(gangVaults.gang, row.gang));
      await tx
        .update(gangVaults)
        .set({ cash: sql`${gangVaults.cash} + ${bounty}`, updatedAt: at })
        .where(eq(gangVaults.gang, tagger.gang));
    }
    const jailedUntil = t.now + JAIL_MS;
    await tx
      .update(mostWanted)
      .set({ claimedBy: t.by, claimedAt: at, bounty })
      .where(eq(mostWanted.day, t.day));
    await tx
      .update(heistChogs)
      .set({ jailedUntil: new Date(jailedUntil) })
      .where(eq(heistChogs.id, t.chog));
    await tx
      .update(heistChogs)
      .set({ catches: sql`${heistChogs.catches} + 1` })
      .where(eq(heistChogs.id, t.by));
    return { bounty, jailedUntil };
  });
}

/** Pumpkin Rush between two times: what each gang carried home, and the best single hunter. */
export async function pumpkinTally(db: Db, from: number, to: number) {
  const rows = await db
    .select({ chog: pumpkins.chogId, gang: pumpkins.gang, cash: pumpkins.cash, gold: pumpkins.gold })
    .from(pumpkins)
    .where(and(gte(pumpkins.at, new Date(from)), lt(pumpkins.at, new Date(to))));
  const gangs = new Map<GangId, number>();
  const chogs = new Map<number, { gang: GangId; cash: number; n: number }>();
  for (const r of rows) {
    gangs.set(r.gang, (gangs.get(r.gang) ?? 0) + r.cash);
    const c = chogs.get(r.chog) ?? { gang: r.gang, cash: 0, n: 0 };
    c.cash += r.cash;
    c.n++;
    chogs.set(r.chog, c);
  }
  const best = [...chogs.entries()].sort((a, b) => b[1].cash - a[1].cash)[0];
  return {
    count: rows.length,
    gold: rows.filter((r) => r.gold).length,
    total: rows.reduce((a, r) => a + r.cash, 0),
    gangs: [...gangs.entries()].sort((a, b) => b[1] - a[1]).map(([gang, cash]) => ({ gang, cash })),
    best: best ? { chog: best[0], ...best[1] } : null,
  };
}
