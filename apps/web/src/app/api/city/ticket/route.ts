import { displayName, getChog } from '@chog-city/data';
import { canControl, heistRecord } from '@chog-city/server';
import { makeTicket } from '@chog-city/server/ticket';
import { db } from '@/server/db';
import { json } from '@/server/http';
import { currentAddress } from '@/server/session';

export const dynamic = 'force-dynamic';

/** A pass for the live server: walk in as one of your Chogs (?chog=<token id>), or as a guest. */
export async function GET(req: Request) {
  const asked = Number(new URL(req.url).searchParams.get('chog'));
  const address = await currentAddress();
  const chog = Number.isInteger(asked) ? getChog(asked) : undefined;
  if (!address || !chog)
    return json({ ticket: makeTicket({ chog: null, name: 'Guest', gang: null, jail: null }) });
  const d = await db();
  if (!(await canControl(d, address, chog.id)))
    return json({ ok: false, error: 'not-yours' }, { status: 403 });
  const r = await heistRecord(d, chog.id);
  const jail = r?.jailedUntil && r.jailedUntil.getTime() > Date.now() ? r.jailedUntil.getTime() : null;
  return json({
    ticket: makeTicket({ chog: chog.id, name: displayName(chog), gang: r?.gang ?? null, jail }),
  });
}
