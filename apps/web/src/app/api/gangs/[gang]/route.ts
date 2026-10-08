import { GANG_IDS, displayName, getChog, type GangId } from '@chog-city/data';
import { gangMembers, recentHits } from '@chog-city/server';
import { db } from '@/server/db';
import { error, json } from '@/server/http';

export const dynamic = 'force-dynamic';

/** A gang's best robbers and its latest hits, for the card at its door. */
export async function GET(_req: Request, { params }: { params: Promise<{ gang: string }> }) {
  const gang = (await params).gang as GangId;
  if (!GANG_IDS.includes(gang)) return error('no-gang', 404);
  const d = await db();
  const [members, hits] = await Promise.all([gangMembers(d, gang, 5), recentHits(d, 6, gang)]);
  return json({
    members: members.map((m) => ({
      id: m.id,
      name: displayName(getChog(m.id)!),
      stolen: m.stolen,
      catches: m.catches,
    })),
    hits,
  });
}
