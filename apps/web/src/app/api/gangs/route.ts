import { gangStandings } from '@chog-city/server';
import { db } from '@/server/db';
import { json } from '@/server/http';

export const dynamic = 'force-dynamic';

export async function GET() {
  return json({ gangs: await gangStandings(await db(), Date.now()) });
}
