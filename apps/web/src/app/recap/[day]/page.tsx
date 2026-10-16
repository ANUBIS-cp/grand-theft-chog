import { GANGS } from '@chog-city/data';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageShell } from '@/components/ui/page-shell';
import { chogImage } from '@/lib/images';
import { GANG_COLOR } from '@/lib/theme';
import { chogName, dayLabel, money, recapFor, recapLines } from './data';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ day: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const r = await recapFor((await params).day);
  if (!r) return { title: 'Recap not found · Chog World' };
  return { title: `${dayLabel(r.start)} in Chog World`, description: recapLines(r).join(' ') };
}

/** "Yesterday in Chog World": the day's robberies, the biggest haul, the best guard and the richest gangs. */
export default async function RecapPage({ params }: Props) {
  const r = await recapFor((await params).day);
  if (!r) notFound();
  const [first, ...rest] = recapLines(r);
  return (
    <PageShell>
      <p className="text-[14px] font-semibold text-label-2">{dayLabel(r.start)} in Chog World</p>
      <h1 className="mt-1 font-display text-[38px] leading-[1.05] sm:text-[48px]">{first}</h1>

      <div className="mt-5 grid grid-cols-3 gap-3">
        {[
          { label: 'Robberies', value: r.robberies },
          { label: 'Cash carried home', value: money(r.stolen) },
          { label: 'Caught', value: r.caught },
        ].map((t) => (
          <div key={t.label} className="glass rounded-[22px] p-4">
            <div className="text-[13px] font-semibold text-label-2">{t.label}</div>
            <div className="mt-1 font-display text-[28px] leading-none tabular-nums sm:text-[34px]">
              {t.value}
            </div>
          </div>
        ))}
      </div>

      {r.biggest && (
        <Link
          href={`/replay/${r.biggest.run}`}
          className="glass-strong press mt-4 flex items-center gap-4 rounded-[26px] p-4"
        >
          <img
            src={chogImage(r.biggest.chog, 256)}
            alt=""
            className="h-20 w-20 rounded-[16px] object-cover"
          />
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-label-2">Biggest haul</div>
            <div className="font-display text-[30px] leading-none text-sys-gold tabular-nums">
              {money(r.biggest.cash)}
            </div>
            <div className="mt-1 truncate text-[15px]">
              {chogName(r.biggest.chog)} of {GANGS[r.biggest.gang].name}, from {GANGS[r.biggest.target].name}
            </div>
            <div className="mt-1 text-[13px] font-semibold underline underline-offset-2">Watch it</div>
          </div>
        </Link>
      )}

      {rest.length > 0 && (
        <ul className="glass mt-4 space-y-2 rounded-[22px] p-4 text-[16px] leading-snug">
          {rest.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}

      <h2 className="mt-8 font-display text-[22px]">Richest gangs</h2>
      <ol className="mt-3 space-y-2">
        {r.top.map((g, i) => (
          <li key={g.gang}>
            <Link
              href={`/gangs/${g.gang}`}
              className="glass press flex items-center gap-3 rounded-[20px] p-3"
            >
              <span className="w-6 text-center font-display text-[20px]">{i + 1}</span>
              <span
                className="grid h-11 w-11 place-items-center rounded-[12px]"
                style={{ background: GANG_COLOR[g.gang].bg }}
              >
                <img
                  src={`/art/city/small/gang-${g.gang}.webp`}
                  alt=""
                  className="max-h-9 max-w-9 object-contain"
                />
              </span>
              <span className="flex-1 text-[16px] font-semibold">{GANGS[g.gang].name}</span>
              <span className="font-display text-[20px] tabular-nums text-sys-gold">{money(g.cash)}</span>
            </Link>
          </li>
        ))}
      </ol>

      <div className="mt-8 flex justify-between text-[14px] font-semibold">
        {r.day > 0 ? (
          <Link href={`/recap/${r.day - 1}`} className="underline underline-offset-2">
            The day before
          </Link>
        ) : (
          <span />
        )}
        <Link href="/" className="underline underline-offset-2">
          Into the city
        </Link>
      </div>
    </PageShell>
  );
}
