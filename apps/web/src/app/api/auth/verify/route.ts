import { authNonces } from '@chog-city/server/db';
import { and, eq, gt } from 'drizzle-orm';
import { parseSiweMessage } from 'viem/siwe';
import { z } from 'zod';
import { publicClient } from '@/server/chain';
import { db } from '@/server/db';
import { error, json } from '@/server/http';
import { allow, clientIp } from '@/server/rate';
import { createSession } from '@/server/session';

export const dynamic = 'force-dynamic';

const Body = z.object({
  message: z.string().min(20).max(2000),
  signature: z
    .string()
    .regex(/^0x[0-9a-fA-F]+$/)
    .max(4000),
});

export async function POST(req: Request) {
  if (!allow(`verify:${clientIp(req)}`, 10, 0.5)) return error('SLOW_DOWN', 429);
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return error('BAD_REQUEST');
  const { message, signature } = body.data;
  const fields = parseSiweMessage(message);
  // PUBLIC_HOST can list several names (the new address first) while the site moves to a new one.
  const hosts = (
    process.env.PUBLIC_HOST ??
    req.headers.get('x-forwarded-host') ??
    req.headers.get('host') ??
    ''
  )
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);
  const host = fields.domain && hosts.includes(fields.domain) ? fields.domain : '';
  if (!fields.nonce || !fields.address || !host || fields.chainId !== 143) return error('BAD_MESSAGE');

  // The nonce is single-use and only valid for 15 minutes.
  const used = await (
    await db()
  )
    .delete(authNonces)
    .where(
      and(eq(authNonces.nonce, fields.nonce), gt(authNonces.createdAt, new Date(Date.now() - 15 * 60_000))),
    )
    .returning();
  if (!used.length) return error('NONCE_EXPIRED');

  // Works for normal wallets and smart-contract wallets (checked on-chain).
  const valid = await publicClient()
    .verifySiweMessage({ message, signature: signature as `0x${string}`, domain: host, nonce: fields.nonce })
    .catch(() => false);
  if (!valid) return error('BAD_SIGNATURE', 401);
  await createSession(fields.address);
  return json({ ok: true, address: fields.address.toLowerCase() });
}
