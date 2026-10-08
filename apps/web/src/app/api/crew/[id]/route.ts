import { crews } from '@chog-city/server/db';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { error, json } from '@/server/http';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  if (!/^\d+-\d+$/.test(id)) return error('UNKNOWN_CREW', 404);
  const [row] = await (await db()).select().from(crews).where(eq(crews.id, id));
  if (!row) return error('UNKNOWN_CREW', 404);
  return json({ crew: { ...row, createdAt: row.createdAt.getTime() } });
}
