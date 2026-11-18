import { displayName, getChog } from '@chog-city/data';
import { seasonBoard } from '@chog-city/server';
import { db } from '@/server/db';
import { json } from '@/server/http';

export const dynamic = 'force-dynamic';

const name = (id: number | null) => {
  if (id === null) return null;
  const c = getChog(id);
  return c ? displayName(c) : `Chog #${id}`;
};

/** This season's leaders (richest gangs, top robbers, best guards), when it ends, and past winners. */
export async function GET() {
  const b = await seasonBoard(await db(), Date.now());
  if (!b) return json(null);
  return json({
    ...b,
    robbers: b.robbers.map((r) => ({ ...r, name: name(r.chogId) })),
    guards: b.guards.map((r) => ({ ...r, name: name(r.chogId) })),
    past: b.past.map((p) => ({ ...p, robberName: name(p.robber), guardName: name(p.guard) })),
  });
}
