import { GANGS, displayName, gangOptions, getChog, hasTrait } from '@chog-city/data';
import { chogInfo } from '@chog-city/game';
import { powersFor } from '@chog-city/game/heist';
import { chogsFor, hitToday, revengeTargets } from '@chog-city/server';
import { heistChogs } from '@chog-city/server/db';
import { inArray } from 'drizzle-orm';
import { isAdmin } from '@/server/admin';
import { db } from '@/server/db';
import { json } from '@/server/http';
import { currentAddress } from '@/server/session';

export const dynamic = 'force-dynamic';

/** The logged-in wallet's Chogs with their gang, jail time, record and which vaults they've hit today. */
export async function GET() {
  const address = await currentAddress();
  if (!address) return json({ address: null, chogs: [] });
  const d = await db();
  const now = Date.now();
  const mine = await chogsFor(d, address);
  const ids = mine.map((m) => m.tokenId);
  const records = ids.length ? await d.select().from(heistChogs).where(inArray(heistChogs.id, ids)) : [];
  const byId = new Map(records.map((r) => [r.id, r]));
  const hit = await hitToday(d, ids, now);
  const gangs = [...new Set(records.map((r) => r.gang).filter((g) => g !== null))];
  const revenge = Object.fromEntries(
    await Promise.all(gangs.map(async (g) => [g, await revengeTargets(d, g, now)])),
  );
  return json({
    address,
    // The owner sees the demo controls for filming (?film=1).
    ...(isAdmin(address) ? { admin: true } : {}),
    revenge,
    chogs: mine.map((m) => {
      const chog = getChog(m.tokenId)!;
      const r = byId.get(m.tokenId);
      const opts = gangOptions(chog);
      return {
        id: m.tokenId,
        name: displayName(chog),
        gang: r?.gang && opts.born.includes(r.gang) ? r.gang : null,
        gangChoices: opts.born,
        // What it wears that puts it in each gang, for the gang picker ("Crown", "Purple laser").
        gangWhy: Object.fromEntries(
          opts.born.map((g) => {
            const hit = GANGS[g].from.filter((m) => hasTrait(chog.traits, m)).map(([, v]) => v);
            return [g, hit.length ? hit : ['No gang trait']];
          }),
        ),
        jailedUntil: r?.jailedUntil && r.jailedUntil.getTime() > now ? r.jailedUntil.getTime() : null,
        // The owner's wallets can rob a vault again the same day (filming), so nothing shows as done.
        hitToday: isAdmin(address) ? [] : (hit.get(m.tokenId) ?? []),
        powers: powersFor(chogInfo(m.tokenId).skills),
        record: {
          stolen: r?.stolen ?? 0,
          escapes: r?.escapes ?? 0,
          busts: r?.busts ?? 0,
          catches: r?.catches ?? 0,
          best: r?.best ?? 0,
        },
      };
    }),
  });
}
