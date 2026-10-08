import { DISTRICTS, GANG_IDS, GANGS, getChog, type GangId } from '@chog-city/data';
import { chogStates } from '@chog-city/server/db';
import { gangStandings } from '@chog-city/server';
import { and, desc, eq } from 'drizzle-orm';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChogPortrait } from '@/components/chog-portrait';
import { DistrictPlate } from '@/components/district-plate';
import { GangTag } from '@/components/gang-tag';
import { SiteHeader } from '@/components/site-header';
import { Label, Panel } from '@/components/ui/panel';
import { nameOf } from '@/lib/describe';
import { db } from '@/server/db';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ gang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const g = (await params).gang as GangId;
  return { title: GANG_IDS.includes(g) ? `${GANGS[g].name} · Chog City` : 'Gang not found · Chog City' };
}

export default async function GangPage({ params }: Props) {
  const gang = (await params).gang as GangId;
  if (!GANG_IDS.includes(gang)) notFound();
  const d = await db();
  const [standings, members] = await Promise.all([
    gangStandings(d, Date.now()),
    d
      .select()
      .from(chogStates)
      .where(and(eq(chogStates.gang, gang), eq(chogStates.active, true)))
      .orderBy(desc(chogStates.cash))
      .limit(60),
  ]);
  const rank = standings.findIndex((s) => s.gang === gang);
  const row = standings[rank]!;
  const from = GANGS[gang].from.map(([, v]) => v);

  return (
    <main className="mx-auto max-w-[1180px] px-4 pb-20 sm:px-6">
      <SiteHeader
        right={
          <Link
            href="/play?tab=city"
            className="rounded-[6px] border-2 border-ink bg-paper-raised px-3 py-2 text-sm font-semibold shadow-hard-sm"
          >
            Play
          </Link>
        }
      />
      <section className="pt-8">
        <Label>
          Rank {rank + 1} of {standings.length}
        </Label>
        <div className="mt-3">
          <GangTag gang={gang} size="lg" />
        </div>
        <p className="mt-4 max-w-[60ch] text-[15px] leading-snug text-ink-soft">
          Chogs with{' '}
          {from.length > 3
            ? `${from.slice(0, 3).join(', ')} and ${from.length - 3} more traits`
            : from.join(', ')}{' '}
          can join. Free agents (Chogs with no gang trait) can join any gang.
        </p>
        <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              ['Districts held', row.holds.length],
              ['Points today', row.pointsToday],
              ['District-days', row.districtDays],
              ['Playing', row.members],
            ] as const
          ).map(([k, v]) => (
            <Panel key={k} className="p-3 shadow-none">
              <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-soft">{k}</dt>
              <dd className="mt-1 font-display text-[34px] leading-none">{v}</dd>
            </Panel>
          ))}
        </dl>
        {row.holds.length > 0 && (
          <div className="mt-5 flex flex-wrap items-center gap-2 text-[14px]">
            Holds{' '}
            {row.holds.map((h) => (
              <DistrictPlate key={h} district={h} size="sm" />
            ))}
          </div>
        )}
      </section>

      <section className="mt-10 border-t-2 border-ink pt-8">
        <h2 className="font-display text-[34px] uppercase leading-none">Members</h2>
        <p className="mt-1.5 text-[14px] text-ink-soft">
          Playing Chogs in {GANGS[gang].name}, richest first.
        </p>
        {members.length === 0 ? (
          <p className="mt-4 rounded-[8px] border-2 border-dashed border-ink-faint p-4 text-[14px] text-ink-soft">
            Nobody plays for {GANGS[gang].name} yet. Be the first.
          </p>
        ) : (
          <ul className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-3">
            {members.map((m) => (
              <li key={m.id}>
                <Link href={`/chog/${m.id}`} className="block text-center">
                  <ChogPortrait
                    id={m.id}
                    name={nameOf(m.id)}
                    size="md"
                    className="!h-auto !w-full aspect-square"
                  />
                  <span className="mt-1.5 block truncate text-[13px] font-semibold">
                    {getChog(m.id) ? nameOf(m.id) : m.id}
                  </span>
                  <span className="block font-mono text-[11px] text-cash">{m.cash} cash</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="mt-10 text-[13px] text-ink-soft">
        Turf: every job a member does scores points in that district. At 18:00 UTC each district goes to the
        gang with the most points, counting each gang&apos;s best 5 Chogs there. Districts:{' '}
        {Object.values(DISTRICTS)
          .filter((x) => !x.eventOnly)
          .map((x) => x.name)
          .join(', ')}
        .
      </p>
    </main>
  );
}
