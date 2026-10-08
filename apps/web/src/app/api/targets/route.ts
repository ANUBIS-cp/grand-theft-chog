import { playableOwners, targets } from '@chog-city/server';
import { db } from '@/server/db';
import { error, json } from '@/server/http';
import { currentAddress } from '@/server/session';

export const dynamic = 'force-dynamic';

const KINDS = new Set(['rob', 'arrest', 'jailed']);

/** Chogs to rob, arrest or bail out. Your own Chogs are left out of rob and arrest lists. */
export async function GET(req: Request) {
  const kind = new URL(req.url).searchParams.get('kind') ?? 'rob';
  if (!KINDS.has(kind)) return error('BAD_REQUEST');
  const address = await currentAddress();
  const d = await db();
  const exclude = address && kind !== 'jailed' ? await playableOwners(d, address) : [];
  return json({ targets: await targets(d, kind as 'rob' | 'arrest' | 'jailed', exclude, Date.now()) });
}
