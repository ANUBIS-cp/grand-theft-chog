import { displayName, getChog, tokenIdFor } from '@chog-city/data';
import { chogInfo } from '@chog-city/game';
import { powersFor } from '@chog-city/game/heist';
import { strollers } from '@chog-city/game/city';
import { jailed } from '@chog-city/server';
import { db } from '@/server/db';
import { json } from '@/server/http';

export const dynamic = 'force-dynamic';

const name = (id: number) => displayName(getChog(id)!);
const PRACTICE = tokenIdFor(1595);

/** Who's on the street besides the players: today's strollers, and everyone in jail. */
export async function GET() {
  const now = Date.now();
  const inJail = await jailed(await db(), now);
  return json({
    strollers: strollers(now).map((s) => ({ ...s, name: name(s.id) })),
    jailed: inJail.map((j) => ({ ...j, name: name(j.id) })),
    // Who you play as in the practice vault without a Chog of your own.
    practice: { id: PRACTICE, name: name(PRACTICE), powers: powersFor(chogInfo(PRACTICE).skills) },
  });
}
