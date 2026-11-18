import { CHOGS, GANGS, displayName, gangOptions, getChog, tokenIdFor, type GangId } from '@chog-city/data';
import { chogInfo, dayOf } from '@chog-city/game';
import { tonightIds } from '@chog-city/game/fight';
import { powersFor } from '@chog-city/game/heist';
import { canControl, fightCard, heistRecord } from '@chog-city/server';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { FightGame, type FightCard } from '@/components/fight/fight-game';
import { GANG_COLOR } from '@/lib/theme';
import { db } from '@/server/db';
import { currentAddress } from '@/server/session';

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

// Taken off the site on 18 Nov 2026 (the owner played it and it wasn't fun); the code stays for parts of a
// better game. The page answers "not found" until then.
const LIVE = false;

export default async function FightPage({ searchParams }: { searchParams: Promise<{ chog?: string }> }) {
  if (!LIVE) notFound();
  const { chog: asked } = await searchParams;
  const number = Number(asked);
  const valid = Number.isInteger(number) && number >= 1 && number <= CHOGS.length;
  const myId = tokenIdFor(valid ? number : DEFAULT_CHOG);
  const now = Date.now();
  // Your own Chog, signed in and in a gang: wins count and pay your gang. Anyone else: practice. Without the
  // database (local development) it's practice too, against the same card.
  let gang: GangId | null = null;
  let tonight = { day: dayOf(now), ids: tonightIds(dayOf(now), CHOGS.length, tokenIdFor(1062), [myId]), beaten: 0 };
  try {
    const base = await db();
    const address = await currentAddress();
    if (address && (await canControl(base, address, myId))) gang = (await heistRecord(base, myId))?.gang ?? null;
    tonight = await fightCard(base, gang ? myId : null, now);
  } catch {
    /* practice */
  }
  const me = card(myId, 0);
  const ids = tonight.ids;
  const opponents = ids.map((id, i) => card(id, i + 1));
  // The crowd: a different handful of Chogs every night.
  const day = tonight.day;
  const crowd = Array.from({ length: 12 }, (_, i) => 1 + ((day * 131 + i * 167) % CHOGS.length));
  return (
    <main className="game-root h-dvh overflow-hidden bg-[#0a0812]">
      <FightGame
        me={me}
        card={opponents}
        crowd={crowd}
        day={day}
        real={gang ? { beaten: tonight.beaten, gang: GANGS[gang].name } : null}
      />
    </main>
  );
}
