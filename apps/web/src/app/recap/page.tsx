import { DISTRICTS } from '@chog-city/data';
import { dayOf, dayStart } from '@chog-city/game';
import { recap } from '@chog-city/server';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ChogPortrait } from '@/components/chog-portrait';
import { GangTag } from '@/components/gang-tag';
import { SiteHeader } from '@/components/site-header';
import { Label, Panel } from '@/components/ui/panel';
import { describe, nameOf } from '@/lib/describe';
import { db } from '@/server/db';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Yesterday in Chog City' };

export default async function RecapPage({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const today = dayOf(Date.now());
  const asked = Number((await searchParams).day);
  const day = Number.isInteger(asked) && asked < today && asked > today - 60 ? asked : today - 1;
  const r = await recap(await db(), day);
  const date = new Date(dayStart(day)).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
  const big = r.biggestJob?.event;

  return (
    <main className="mx-auto max-w-[900px] px-4 pb-20 sm:px-6">
      <SiteHeader
        right={
          <Link
            href="/play"
            className="rounded-[6px] border-2 border-ink bg-paper-raised px-3 py-2 text-sm font-semibold shadow-hard-sm"
          >
            Play
          </Link>
        }
      />
      <header className="pt-8">
        <Label>Game day from {date}, 18:00 UTC</Label>
        <h1 className="mt-2 font-display text-[56px] uppercase leading-[0.85] sm:text-[80px]">
          Yesterday in Chog City
        </h1>
      </header>

      {r.jobs + r.robberies === 0 ? (
        <p className="mt-8 rounded-[8px] border-2 border-dashed border-ink-faint p-5 text-[15px] text-ink-soft">
          Nothing happened that day. The city was quiet.
        </p>
      ) : (
        <>
          <dl className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              [
                ['Jobs', r.jobs],
                ['Jobs won', r.jobsWon],
                ['Robberies', r.robberies],
                ['Went to jail', r.jailed],
              ] as const
            ).map(([k, v]) => (
              <Panel key={k} className="p-3 shadow-none">
                <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-soft">{k}</dt>
                <dd className="mt-1 font-display text-[34px] leading-none">{v}</dd>
              </Panel>
            ))}
          </dl>

          <section className="mt-10">
            <h2 className="font-display text-[32px] uppercase leading-none">Turf</h2>
            {r.changes.length === 0 ? (
              <p className="mt-3 text-[15px] text-ink-soft">No district changed hands.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {r.changes.map((c) => (
                  <li key={c.district} className="flex flex-wrap items-center gap-2 text-[15px]">
                    {c.to && <GangTag gang={c.to} size="sm" />} took{' '}
                    <strong>{DISTRICTS[c.district].name}</strong>
                    {c.from ? (
                      <>
                        from <GangTag gang={c.from} size="sm" />
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-10 grid gap-5 sm:grid-cols-3">
            {big && big.type === 'job' && (
              <Highlight label="Biggest job" id={big.chogId} text={describe(big, r.biggestJob!.id).text} />
            )}
            {r.topEarner && (
              <Highlight
                label="Top earner"
                id={r.topEarner.id}
                text={`${nameOf(r.topEarner.id)} made ${r.topEarner.cash} cash.`}
              />
            )}
            {r.mostRobbed && (
              <Highlight
                label="Most robbed"
                id={r.mostRobbed.id}
                text={`${nameOf(r.mostRobbed.id)} got robbed ${r.mostRobbed.times} times.`}
              />
            )}
          </section>
        </>
      )}
      <p className="mt-12 text-[13px] text-ink-soft">
        <Link href={`/recap?day=${day - 1}`} className="underline underline-offset-4">
          The day before
        </Link>
      </p>
    </main>
  );
}

function Highlight({ label, id, text }: { label: string; id: number; text: string }) {
  return (
    <Panel className="p-4">
      <Label>{label}</Label>
      <div className="mt-3 flex items-center gap-3">
        <ChogPortrait id={id} name={nameOf(id)} size="sm" />
        <Link href={`/chog/${id}`} className="font-display text-[22px] uppercase leading-none">
          {nameOf(id)}
        </Link>
      </div>
      <p className="mt-3 text-[14px] leading-snug">{text}</p>
    </Panel>
  );
}
