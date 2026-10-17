import { GANGS, type GangId } from '@chog-city/data';
import { usage } from '@chog-city/server';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PageShell } from '@/components/ui/page-shell';
import { isAdmin } from '@/server/admin';
import { db } from '@/server/db';
import { currentAddress } from '@/server/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Usage · Chog World', robots: { index: false } };

const pct = (back: number, of: number) => (of ? `${Math.round((back / of) * 100)}%` : '–');
const date = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/** The owner's numbers: who plays, who comes back, what they do. */
export default async function UsagePage() {
  const me = await currentAddress();
  // Only the owner's wallets (ADMIN_WALLETS); anyone else gets "not found".
  if (!isAdmin(me)) notFound();
  const u = await usage(await db());
  const tiles = [
    { label: 'Holders who came', value: u.holdersEver },
    { label: 'Guests who came', value: u.guestsEver },
    { label: 'Chogs played', value: u.chogsEver },
    { label: 'Robberies', value: u.robberiesEver },
    {
      label: 'Back the next day',
      value: pct(u.backNextDay.back, u.backNextDay.of),
      note: `of ${u.backNextDay.of}`,
    },
    {
      label: 'Back within a week',
      value: pct(u.backInAWeek.back, u.backInAWeek.of),
      note: `of ${u.backInAWeek.of}`,
    },
    { label: 'Chogs in a gang', value: u.chogsInGangs },
    { label: '$CHOG burned', value: u.burns.reduce((s, b) => s + b.chog, 0).toLocaleString('en-US') },
  ];
  return (
    <PageShell>
      <h1 className="font-display text-[40px] leading-none">Usage</h1>
      <p className="mt-2 text-[14px] text-label-2">
        Counted from the game’s own records. Only you can see this page.
      </p>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="glass rounded-[22px] p-4">
            <div className="text-[13px] font-semibold text-label-2">{t.label}</div>
            <div className="mt-1 font-display text-[32px] leading-none tabular-nums">{t.value}</div>
            {t.note && <div className="mt-1 text-[12px] text-label-2">{t.note}</div>}
          </div>
        ))}
      </div>

      <h2 className="mt-8 font-display text-[22px]">Last 14 days</h2>
      <div className="glass mt-3 overflow-x-auto rounded-[22px] p-2">
        <table className="w-full min-w-[560px] text-[14px] tabular-nums">
          <thead className="text-left text-[12px] text-label-2">
            <tr>
              {[
                'Day',
                'Holders',
                'Guests',
                'Chogs',
                'Robberies',
                'Got out',
                'Caught',
                'Home',
                'Caught on the way',
                'Break-outs',
              ].map((h) => (
                <th key={h} className="px-3 py-2 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {u.days.map((d) => (
              <tr key={d.day} className="border-t border-white/5">
                <td className="px-3 py-2">{date(d.start)}</td>
                <td className="px-3 py-2">{d.holders}</td>
                <td className="px-3 py-2">{d.guests}</td>
                <td className="px-3 py-2">{d.chogs}</td>
                <td className="px-3 py-2">{d.robberies}</td>
                <td className="px-3 py-2">{d.escaped}</td>
                <td className="px-3 py-2">{d.busted}</td>
                <td className="px-3 py-2">{d.getawaysHome}</td>
                <td className="px-3 py-2">{d.getawaysCaught}</td>
                <td className="px-3 py-2">{d.breakouts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <section className="glass rounded-[22px] p-4">
          <h2 className="font-display text-[20px]">Gangs</h2>
          <ul className="mt-2 space-y-1 text-[14px]">
            {u.gangs.length ? (
              u.gangs.map((g) => (
                <li key={g.gang} className="flex justify-between">
                  <span>{GANGS[g.gang as GangId]?.name ?? g.gang}</span>
                  <span className="tabular-nums">{g.members}</span>
                </li>
              ))
            ) : (
              <li className="text-label-2">Nobody has picked a gang yet.</li>
            )}
          </ul>
        </section>
        <section className="glass rounded-[22px] p-4">
          <h2 className="font-display text-[20px]">$CHOG burns</h2>
          <ul className="mt-2 space-y-1 text-[14px]">
            {u.burns.length ? (
              u.burns.map((b) => (
                <li key={b.kind} className="flex justify-between">
                  <span className="capitalize">{b.kind}</span>
                  <span className="tabular-nums">
                    {b.n} · {b.chog.toLocaleString('en-US')} $CHOG
                  </span>
                </li>
              ))
            ) : (
              <li className="text-label-2">No burns yet.</li>
            )}
          </ul>
        </section>
      </div>
    </PageShell>
  );
}
