import { chogsFor, crewsFor } from '@chog-city/server';
import { db } from '@/server/db';
import { json } from '@/server/http';
import { currentAddress } from '@/server/session';

export const dynamic = 'force-dynamic';

/** Today's open crews, plus the crews your Chogs are in. */
export async function GET() {
  const d = await db();
  const address = await currentAddress();
  const mine = address ? (await chogsFor(d, address)).map((c) => c.tokenId) : [];
  return json(await crewsFor(d, Date.now(), mine));
}
