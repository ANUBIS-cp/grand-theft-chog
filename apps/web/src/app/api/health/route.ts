import { sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { json } from '@/server/http';

export const dynamic = 'force-dynamic';

export async function GET() {
  await db().execute(sql`select 1`);
  return json({ ok: true, at: Date.now() });
}
