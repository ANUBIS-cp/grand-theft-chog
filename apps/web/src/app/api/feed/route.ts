import { events } from '@chog-city/server/db';
import { desc, lt } from 'drizzle-orm';
import { db } from '@/server/db';
import { json } from '@/server/http';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const before = Number(new URL(req.url).searchParams.get('before') ?? 0);
  const q = (await db()).select().from(events);
  const rows = await (before > 0 ? q.where(lt(events.id, before)) : q).orderBy(desc(events.id)).limit(50);
  return json({ events: rows.map((e) => ({ id: e.id, at: e.at.getTime(), event: e.data })) });
}
