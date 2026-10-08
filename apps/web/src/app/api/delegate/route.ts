import { delegations } from '@chog-city/server/db';
import { and, eq } from 'drizzle-orm';
import { isAddress } from 'viem';
import { z } from 'zod';
import { db } from '@/server/db';
import { error, json } from '@/server/http';
import { allow } from '@/server/rate';
import { currentAddress } from '@/server/session';

export const dynamic = 'force-dynamic';

// The logged-in wallet is the owner: logging in already proved it controls its Chogs.
// It can let other wallets (say, an everyday hot wallet) play them, and take that back any time.

const Body = z.object({ player: z.string().refine((a) => isAddress(a), 'not an address') });

export async function GET() {
  const owner = await currentAddress();
  if (!owner) return error('NOT_LOGGED_IN', 401);
  const rows = await (
    await db()
  )
    .select({ player: delegations.player, createdAt: delegations.createdAt })
    .from(delegations)
    .where(eq(delegations.owner, owner));
  return json({ players: rows.map((r) => ({ player: r.player, since: r.createdAt.getTime() })) });
}

export async function POST(req: Request) {
  const owner = await currentAddress();
  if (!owner) return error('NOT_LOGGED_IN', 401);
  if (!allow(`delegate:${owner}`, 5, 0.1)) return error('SLOW_DOWN', 429);
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return error('BAD_REQUEST');
  const player = body.data.player.toLowerCase();
  if (player === owner) return error('SAME_WALLET');
  await (
    await db()
  )
    .insert(delegations)
    .values({ owner, player, signature: 'session' })
    .onConflictDoNothing();
  return json({ ok: true });
}

export async function DELETE(req: Request) {
  const owner = await currentAddress();
  if (!owner) return error('NOT_LOGGED_IN', 401);
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return error('BAD_REQUEST');
  await (
    await db()
  )
    .delete(delegations)
    .where(and(eq(delegations.owner, owner), eq(delegations.player, body.data.player.toLowerCase())));
  return json({ ok: true });
}
