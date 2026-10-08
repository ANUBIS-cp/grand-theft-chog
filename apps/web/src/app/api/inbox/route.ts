import { chogsFor, inbox } from '@chog-city/server';
import { db } from '@/server/db';
import { json } from '@/server/http';
import { currentAddress } from '@/server/session';

export const dynamic = 'force-dynamic';

/** What happened to your Chogs: robbed, arrested, bailed, crew results, level-ups. */
export async function GET() {
  const address = await currentAddress();
  if (!address) return json({ items: [] });
  const d = await db();
  const mine = (await chogsFor(d, address)).map((c) => c.tokenId);
  return json({ items: await inbox(d, mine) });
}
