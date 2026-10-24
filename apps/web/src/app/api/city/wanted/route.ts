import { displayName, getChog } from '@chog-city/data';
import { wantedToday } from '@chog-city/server';
import { db } from '@/server/db';
import { json } from '@/server/http';

export const dynamic = 'force-dynamic';

/** Today's Most Wanted: who, their gang, the bounty, and whether it's been claimed (null on a quiet day). */
export async function GET() {
  const w = await wantedToday(await db(), Date.now());
  return json({
    wanted: w && {
      day: w.day,
      chog: w.chog,
      name: displayName(getChog(w.chog)!),
      gang: w.gang,
      bounty: w.bounty,
      stole: w.stole,
      claimed: w.claimedBy !== null,
      claimedBy: w.claimedBy,
      claimedByName: w.claimedBy !== null ? displayName(getChog(w.claimedBy)!) : null,
    },
  });
}
