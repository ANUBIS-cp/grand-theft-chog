import { json } from '@/server/http';
import { endSession } from '@/server/session';

export const dynamic = 'force-dynamic';

export async function POST() {
  await endSession();
  return json({ ok: true });
}
