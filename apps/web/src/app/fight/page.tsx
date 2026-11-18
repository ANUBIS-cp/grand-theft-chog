import { CHOGS, displayName, gangOptions, getChog, tokenIdFor } from '@chog-city/data';
import { chogInfo, dayOf } from '@chog-city/game';
import { powersFor } from '@chog-city/game/heist';
import { heistRuns } from '@chog-city/server/db';
import { count, desc } from 'drizzle-orm';
import type { Metadata } from 'next';
import { FightGame, type FightCard } from '@/components/fight/fight-game';
import { GANG_COLOR } from '@/lib/theme';
import { db } from '@/server/db';

export const metadata: Metadata = {
  title: 'Fight Night · Grand Theft Chog',
  description: 'The basement ring under the bar: knock the other Chog out of the ring.',
};
export const dynamic = 'force-dynamic';

const DEFAULT_CHOG = 1595;

function card(id: number, level: number): FightCard {
  const chog = getChog(id)!;
  const gang = gangOptions(chog).born[0] ?? 'legends';
  return { id, name: displayName(chog), color: GANG_COLOR[gang].bg, powers: powersFor(chogInfo(id).skills), level };
}

/** Tonight's six, the same for everyone all game day: five picked from the whole collection, then the champion. */
function tonight(day: number, skip: number[], champion: number): FightCard[] {
  let seed = (day * 2654435761) >>> 0;
  const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const ids: number[] = [];
  while (ids.length < 5) {
    const id = 1 + Math.floor(next() * CHOGS.length);
    if (!ids.includes(id) && !skip.includes(id) && id !== champion) ids.push(id);
  }
  return [...ids.map((id, i) => card(id, i + 1)), card(champion, 6)];
}

/** The champion is the Chog that has robbed the most vaults: the city's own top robber. */
async function topRobber(): Promise<number | null> {
  try {
    const [row] = await (await db())
      .select({ id: heistRuns.chogId, n: count() })
      .from(heistRuns)
      .groupBy(heistRuns.chogId)
      .orderBy(desc(count()))
      .limit(1);
    return row?.id ?? null;
  } catch {
    return null;
  }
}

export default async function FightPage({ searchParams }: { searchParams: Promise<{ chog?: string }> }) {
  const { chog: asked } = await searchParams;
  const number = Number(asked);
  const valid = Number.isInteger(number) && number >= 1 && number <= CHOGS.length;
  const myId = tokenIdFor(valid ? number : DEFAULT_CHOG);
  const day = dayOf(Date.now());
  const champ = (await topRobber()) ?? tokenIdFor(1062);
  const me = card(myId, 0);
  const opponents = tonight(day, [myId], champ === myId ? tokenIdFor(1062) : champ);
  // The crowd: a different handful of Chogs every night.
  const crowd = Array.from({ length: 12 }, (_, i) => 1 + ((day * 131 + i * 167) % CHOGS.length));
  return (
    <main className="game-root h-dvh overflow-hidden bg-[#0a0812]">
      <FightGame me={me} card={opponents} crowd={crowd} day={day} />
    </main>
  );
}
