import { displayName, getChog, tokenIdFor } from '@chog-city/data';
import { chogInfo } from '@chog-city/game';
import { powersFor } from '@chog-city/game/heist';
import { strollers } from '@chog-city/game/city';
import { BURN_PRICE, POSTER_LINES, burnsNow, eventText, eventsNow, jailed } from '@chog-city/server';
import { db } from '@/server/db';
import { json } from '@/server/http';

export const dynamic = 'force-dynamic';

const name = (id: number) => displayName(getChog(id)!);
const PRACTICE = tokenIdFor(1595);

/** Who's on the street besides the players: today's strollers, everyone in jail, posters and banners. */
export async function GET() {
  const now = Date.now();
  const [inJail, burns, events] = await Promise.all([
    jailed(await db(), now),
    burnsNow(await db(), now),
    eventsNow(await db(), now),
  ]);
  return json({
    strollers: strollers(now).map((s) => ({ ...s, name: name(s.id) })),
    jailed: inJail.map((j) => ({ ...j, name: name(j.id) })),
    // Who you play as in the practice vault without a Chog of your own.
    // $CHOG: Wanted posters and gang banners up now, the prices, and the city's total burned.
    burns: {
      ...burns,
      posters: burns.posters.map((p) => ({ ...p, name: name(p.chog) })),
      prices: BURN_PRICE,
      lines: POSTER_LINES,
    },
    // Judging-week events on now (packages/server/src/events.ts): a line for the big screen, a banner.
    events: eventText(events),
    // The Blood Moon up now, or the next one: the countdown under the map. (The page works out the ones after
    // from the shared calendar, on this clock.)
    moon: events.moon,
    now,
    practice: { id: PRACTICE, name: name(PRACTICE), powers: powersFor(chogInfo(PRACTICE).skills) },
  });
}
