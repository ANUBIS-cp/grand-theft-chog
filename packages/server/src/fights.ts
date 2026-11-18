import { CHOGS, tokenIdFor } from '@chog-city/data';
import { chogInfo, dayOf, dayStart, seasonOf } from '@chog-city/game';
import {
  CARD_SIZE,
  FIGHT_PAY,
  FIGHT_TPS,
  decodeFightInputs,
  replayFight,
  tonightIds,
  type FighterSetup,
} from '@chog-city/game/fight';
import { powersFor, type PowerId } from '@chog-city/game/heist';
import { and, count, desc, eq, gte, isNull, lt, sql } from 'drizzle-orm';
import { randomBytes, randomInt } from 'node:crypto';
import { fightRuns, gangVaults, heistRuns, type Db } from './db/index.ts';
import { heistRecord } from './heists.ts';
import { canControl } from './ownership.ts';

// Fight Night on the server: the seed is picked here when a fight starts, and when it ends the inputs are
// replayed with the same code the browser ran, so only a real win counts. The first win against each fight of
// the night pays the winner's gang vault (FIGHT_PAY) and counts toward the season's fighter title.

/** A fight must be finished within this long of starting. */
export const FIGHT_MAX_MS = 10 * 60_000;
/** The most steps a recorded fight may have (three long falls and the pauses, with room to spare). */
const MAX_STEPS = FIGHT_TPS * 360;
/** When nobody has robbed yet: Chog #1062. */
const FALLBACK_CHAMPION = tokenIdFor(1062);

export class FightRefused extends Error {
  constructor(public code: 'not-yours' | 'no-gang' | 'card-done' | 'no-fight' | 'finished' | 'too-late' | 'bad-inputs') {
    super(code);
  }
}

/** The day's champion: the Chog that had robbed the most vaults when the game day began (so it holds all day). */
export async function fightChampion(db: Db, day: number): Promise<number> {
  const [row] = await db
    .select({ id: heistRuns.chogId, n: count() })
    .from(heistRuns)
    .where(and(isNull(heistRuns.prisoner), lt(heistRuns.startedAt, new Date(dayStart(day)))))
    .groupBy(heistRuns.chogId)
    .orderBy(desc(count()), heistRuns.chogId)
    .limit(1);
  return row?.id ?? FALLBACK_CHAMPION;
}

export interface FightCardState {
  day: number;
  /** Token IDs, in order; the last is the champion. */
  ids: number[];
  /** How many fights of tonight's card this Chog has won, in order. */
  beaten: number;
}

/** Tonight's card for a Chog, and how far it has got (null: a visitor, who starts at the beginning). */
export async function fightCard(db: Db, chogId: number | null, now: number): Promise<FightCardState> {
  const day = dayOf(now);
  const champ = await fightChampion(db, day);
  const ids = tonightIds(day, CHOGS.length, chogId === champ ? FALLBACK_CHAMPION : champ, chogId ? [chogId] : []);
  if (chogId === null) return { day, ids, beaten: 0 };
  const won = await db
    .select({ slot: fightRuns.slot })
    .from(fightRuns)
    .where(and(eq(fightRuns.chogId, chogId), eq(fightRuns.day, day), eq(fightRuns.won, true)));
  const slots = new Set(won.map((r) => r.slot));
  let beaten = 0;
  while (slots.has(beaten)) beaten++;
  return { day, ids, beaten };
}

const setupFor = (chog: number, bot?: number): FighterSetup => ({
  chog,
  name: '',
  powers: powersFor(chogInfo(chog).skills) as PowerId[],
  ...(bot ? { bot } : {}),
});

export interface StartedFight {
  id: string;
  seed: number;
  slot: number;
  opponent: number;
  /** Both sides' powers, exactly as the server will replay them. */
  me: PowerId[];
  them: PowerId[];
}

export async function startFightRun(db: Db, { address, chogId, now }: { address: string; chogId: number; now: number }): Promise<StartedFight> {
  if (!(await canControl(db, address, chogId))) throw new FightRefused('not-yours');
  const me = await heistRecord(db, chogId);
  if (!me?.gang) throw new FightRefused('no-gang');
  const card = await fightCard(db, chogId, now);
  if (card.beaten >= CARD_SIZE) throw new FightRefused('card-done');
  const slot = card.beaten;
  const opponent = card.ids[slot]!;
  const run = {
    id: randomBytes(12).toString('base64url'),
    seed: randomInt(1, 2 ** 31 - 1),
    slot,
    opponent,
  };
  await db.insert(fightRuns).values({
    ...run,
    chogId,
    player: address.toLowerCase(),
    gang: me.gang,
    day: card.day,
    startedAt: new Date(now),
  });
  return { ...run, me: setupFor(chogId).powers, them: setupFor(opponent).powers };
}

export interface FinishedFight {
  won: boolean;
  paid: number;
  slot: number;
  /** Tonight's progress after this fight. */
  beaten: number;
}

export async function finishFightRun(
  db: Db,
  { address, id, inputs: text, now }: { address: string; id: string; inputs: string; now: number },
): Promise<FinishedFight> {
  const done = await db.transaction(async (tx) => {
    const [run] = await tx.select().from(fightRuns).where(eq(fightRuns.id, id)).for('update');
    if (!run || run.player !== address.toLowerCase()) throw new FightRefused('no-fight');
    if (run.finishedAt) throw new FightRefused('finished');
    if (now - run.startedAt.getTime() > FIGHT_MAX_MS) throw new FightRefused('too-late');
    const inputs = decodeFightInputs(text);
    if (!inputs || inputs.length > MAX_STEPS) throw new FightRefused('bad-inputs');
    const s = replayFight(setupFor(run.chogId), setupFor(run.opponent, run.slot + 1), run.seed, inputs);
    // A fight that stopped before it ended (the tab closed) is a loss.
    const won = s.phase === 'over' && s.winner === 0;
    let paid = 0;
    if (won) {
      const [before] = await tx
        .select({ n: count() })
        .from(fightRuns)
        .where(and(eq(fightRuns.chogId, run.chogId), eq(fightRuns.day, run.day), eq(fightRuns.slot, run.slot), eq(fightRuns.won, true)));
      if (!before?.n) {
        paid = FIGHT_PAY[run.slot] ?? 0;
        await tx
          .update(gangVaults)
          .set({ cash: sql`${gangVaults.cash} + ${paid}`, updatedAt: new Date(now) })
          .where(eq(gangVaults.gang, run.gang));
      }
    }
    await tx.update(fightRuns).set({ finishedAt: new Date(now), won, paid, inputs: text }).where(eq(fightRuns.id, id));
    return { won, paid, slot: run.slot, chogId: run.chogId };
  });
  const { beaten } = await fightCard(db, done.chogId, now);
  return { won: done.won, paid: done.paid, slot: done.slot, beaten };
}

/** The season's fighters: wins against tonight's card, most first (for the season's fighter title). */
export async function seasonFighters(db: Db, now: number, limit = 10) {
  const season = seasonOf(now);
  if (!season) return [];
  return db
    .select({ chogId: fightRuns.chogId, wins: count() })
    .from(fightRuns)
    .where(and(eq(fightRuns.won, true), gte(fightRuns.finishedAt, new Date(season.from)), lt(fightRuns.finishedAt, new Date(season.to))))
    .groupBy(fightRuns.chogId)
    .orderBy(desc(count()))
    .limit(limit);
}
