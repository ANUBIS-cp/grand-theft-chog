import { chogsFor, getStates } from '@chog-city/server';
import { newChogState } from '@chog-city/game';
import { db } from '@/server/db';
import { json } from '@/server/http';
import { currentAddress } from '@/server/session';
import { chogView } from '@/lib/views';

export const dynamic = 'force-dynamic';

export async function GET() {
  const address = await currentAddress();
  if (!address) return json({ address: null, chogs: [] });
  const now = Date.now();
  const mine = await chogsFor(db(), address);
  const states = await getStates(
    db(),
    mine.map((m) => m.tokenId),
  );
  return json({
    address,
    chogs: mine.map((m) => ({
      ...chogView(states.get(m.tokenId) ?? newChogState(m.tokenId, now), now),
      owner: m.owner,
      delegated: m.owner !== address,
    })),
  });
}
