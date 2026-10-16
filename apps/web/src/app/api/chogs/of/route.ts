import { displayName, getChog } from '@chog-city/data';
import { chogInfo } from '@chog-city/game';
import { powersFor } from '@chog-city/game/heist';
import { chogsFor } from '@chog-city/server';
import { isAddress } from 'viem';
import { db } from '@/server/db';
import { error, json } from '@/server/http';
import { allow, clientIp } from '@/server/rate';

export const dynamic = 'force-dynamic';

/**
 * The Chogs a wallet holds, from its address alone (read from Monad, nothing signed): you can walk the city and
 * try the practice vault as one straight away. Real robberies need the wallet proved (/api/auth/proof).
 */
export async function GET(req: Request) {
  if (!allow(`chogsof:${clientIp(req)}`, 20, 0.5)) return error('SLOW_DOWN', 429);
  const address = new URL(req.url).searchParams.get('address')?.trim() ?? '';
  if (!isAddress(address)) return error('BAD_ADDRESS');
  const mine = await chogsFor(await db(), address.toLowerCase());
  return json({
    address: address.toLowerCase(),
    chogs: mine.map((m) => ({
      id: m.tokenId,
      name: displayName(getChog(m.tokenId)!),
      powers: powersFor(chogInfo(m.tokenId).skills),
    })),
  });
}
