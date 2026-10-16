import { displayName, getChog } from '@chog-city/data';
import { canControl, heistRecord, noteVisit } from '@chog-city/server';
import { makeTicket } from '@chog-city/server/ticket';
import { cookies } from 'next/headers';
import { randomBytes } from 'node:crypto';
import { db } from '@/server/db';
import { json } from '@/server/http';
import { currentAddress } from '@/server/session';

export const dynamic = 'force-dynamic';

/** A pass for the live server: walk in as one of your Chogs (?chog=<token id>), or as a guest. */
export async function GET(req: Request) {
  const asked = Number(new URL(req.url).searchParams.get('chog'));
  const address = await currentAddress();
  const chog = Number.isInteger(asked) ? getChog(asked) : undefined;
  const d = await db();
  if (!address || !chog) {
    await noteVisit(d, { who: `g:${await guestId()}`, holder: false, chogId: null, now: Date.now() }).catch(
      () => undefined,
    );
    return json({ ticket: makeTicket({ chog: null, name: 'Guest', gang: null, jail: null }) });
  }
  if (!(await canControl(d, address, chog.id)))
    return json({ ok: false, error: 'not-yours' }, { status: 403 });
  await noteVisit(d, { who: address, holder: true, chogId: chog.id, now: Date.now() }).catch(() => undefined);
  const r = await heistRecord(d, chog.id);
  const jail = r?.jailedUntil && r.jailedUntil.getTime() > Date.now() ? r.jailedUntil.getTime() : null;
  return json({
    ticket: makeTicket({ chog: chog.id, name: displayName(chog), gang: r?.gang ?? null, jail }),
  });
}

/** A guest's random id (a cookie), so a guest who comes back counts once a day. Nothing else is kept. */
async function guestId(): Promise<string> {
  const jar = await cookies();
  const have = jar.get('cw_visitor')?.value;
  if (have && /^[A-Za-z0-9_-]{16,32}$/.test(have)) return have;
  const id = randomBytes(12).toString('base64url');
  jar.set('cw_visitor', id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 365 * 86_400,
  });
  return id;
}
