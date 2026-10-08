import { GANG_IDS } from '@chog-city/data';
import { applyMove, type MoveInput } from '@chog-city/server';
import { z } from 'zod';
import { db } from '@/server/db';
import { error, json } from '@/server/http';
import { allow } from '@/server/rate';
import { currentAddress } from '@/server/session';
import { chogView } from '@/lib/views';

export const dynamic = 'force-dynamic';

const id = z.number().int().min(1).max(1969);
const key = z.string().min(3).max(64);
const Move = z.discriminatedUnion('action', [
  z.object({ action: z.literal('job'), chogId: id, offerKey: key }),
  z.object({ action: z.literal('rob'), chogId: id, target: id }),
  z.object({ action: z.literal('arrest'), chogId: id, target: id }),
  z.object({ action: z.literal('bail'), chogId: id, target: id }),
  z.object({ action: z.literal('gang'), chogId: id, gang: z.enum(GANG_IDS) }),
  z.object({
    action: z.literal('crew.open'),
    chogId: id,
    offerKey: key,
    slot: z.number().int().min(0).max(4),
    jailbreakTarget: id.optional(),
  }),
  z.object({ action: z.literal('crew.join'), chogId: id, crewId: key, slot: z.number().int().min(0).max(4) }),
  z.object({ action: z.literal('crew.leave'), chogId: id, crewId: key }),
]);

export async function POST(req: Request) {
  const address = await currentAddress();
  if (!address) return error('NOT_LOGGED_IN', 401);
  if (!allow(`move:${address}`, 12, 1)) return error('SLOW_DOWN', 429);
  const body = Move.safeParse(await req.json().catch(() => null));
  if (!body.success) return error('BAD_REQUEST');
  const now = Date.now();
  const r = await applyMove(db(), address, body.data as MoveInput, now);
  if (!r.ok) return json(r, { status: 409 });
  return json({
    ok: true,
    events: r.events,
    chogs: r.states.map((s) => chogView(s, now)),
    crew: r.crew ?? null,
  });
}
