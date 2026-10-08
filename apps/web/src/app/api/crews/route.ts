import { crews } from '@chog-city/server/db';
import { dayOf } from '@chog-city/game';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { json } from '@/server/http';

export const dynamic = 'force-dynamic';

/** Today's open crews, newest first. */
export async function GET() {
  const rows = await db()
    .select()
    .from(crews)
    .where(and(eq(crews.day, dayOf(Date.now())), eq(crews.status, 'open')))
    .orderBy(desc(crews.createdAt))
    .limit(200);
  return json({ crews: rows.map((r) => ({ ...r, createdAt: r.createdAt.getTime() })) });
}
