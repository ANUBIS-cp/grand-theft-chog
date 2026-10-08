'use client';
import { DISTRICT_IDS, DISTRICTS, type DistrictId } from '@chog-city/data';
import { useMemo, useState } from 'react';
import { DistrictPlate } from '@/components/district-plate';
import { JobPoster } from '@/components/job-poster';
import { Button } from '@/components/ui/button';
import type { Board } from '@/lib/api';
import { cn } from '@/lib/cn';
import { checkJob, ctxFor, type Offer } from '@/lib/play';
import type { ChogView } from '@/lib/views';

/** Today's jobs for the selected Chog: the ones it can do first, each with its real odds. */
export function JobBoard({
  chog,
  board,
  now,
  busyKey,
  onDo,
}: {
  chog: ChogView;
  board: Board;
  now: number;
  busyKey: string | null;
  onDo: (offer: Offer) => void;
}) {
  const [district, setDistrict] = useState<DistrictId | 'all'>('all');
  const [onlyMine, setOnlyMine] = useState(true);
  const ctx = ctxFor(board, now);

  const rows = useMemo(() => {
    const list = board.offers
      .filter((o) => district === 'all' || o.district === district)
      // "Anywhere" jobs are on every district's board; in the "All" view show each once, in the Chog's home district.
      .filter(
        (o) =>
          district !== 'all' ||
          o.job.district !== 'anywhere' ||
          o.district === (chog.home === 'any' ? 'lemon-row' : chog.home),
      )
      .map((o) => ({ o, c: checkJob(chog, o, ctx) }))
      .filter((r) => !onlyMine || r.c.fits);
    const rank = (r: (typeof list)[number]) => (r.c.reason === null ? 0 : r.c.fits ? 1 : 2);
    return list.sort(
      (a, b) =>
        rank(a) - rank(b) ||
        Number(b.o.hot) - Number(a.o.hot) ||
        (b.c.odds?.odds ?? 0) - (a.c.odds?.odds ?? 0),
    );
  }, [board.offers, chog, ctx, district, onlyMine]);

  const solo = rows.filter((r) => r.o.job.slots.length === 1);
  const crew = rows.filter((r) => r.o.job.slots.length > 1);
  const open = DISTRICT_IDS.filter((d) => board.offers.some((o) => o.district === d));

  return (
    <section aria-labelledby="jobs-title">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 id="jobs-title" className="font-display text-[34px] uppercase leading-none">
          Today&apos;s jobs
        </h2>
        <label className="flex cursor-pointer items-center gap-2 text-[13px] font-semibold">
          <input
            type="checkbox"
            checked={onlyMine}
            onChange={(e) => setOnlyMine(e.target.checked)}
            className="h-4 w-4 accent-[var(--color-ink)]"
          />
          Only jobs {chog.name} can do
        </label>
      </div>
      <p className="mt-1.5 text-[14px] text-ink-soft">
        Each job uses 1 of your 5 moves for today. The odds are for {chog.name}.
      </p>

      <div
        className="-mx-4 mt-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0"
        role="group"
        aria-label="Filter by district"
      >
        <div className="flex gap-2">
          <button
            onClick={() => setDistrict('all')}
            aria-pressed={district === 'all'}
            className={cn(
              'shrink-0 rounded-[5px] border-2 border-ink px-2.5 pb-[2px] pt-[5px] font-display text-[15px] uppercase leading-none',
              district === 'all' ? 'bg-ink text-paper-raised' : 'bg-paper-raised',
            )}
          >
            All
          </button>
          {open.map((d) => (
            <button
              key={d}
              onClick={() => setDistrict(d)}
              aria-pressed={district === d}
              aria-label={DISTRICTS[d].name}
              className={cn(
                'shrink-0 rounded-[6px] p-0.5',
                district === d && 'ring-2 ring-ink ring-offset-2 ring-offset-paper',
              )}
            >
              <DistrictPlate district={d} size="sm" />
            </button>
          ))}
        </div>
      </div>

      <h3 className="mb-3 mt-6 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-soft">
        Solo jobs · result right away
      </h3>
      {solo.length === 0 ? (
        <p className="rounded-[8px] border-2 border-dashed border-ink-faint p-4 text-[14px] text-ink-soft">
          No solo jobs here for {chog.name}. Try another district or show all jobs.
        </p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {solo.map(({ o, c }) => (
            <JobPoster
              key={o.key}
              job={o.job}
              district={o.district}
              pay={o.pay}
              hot={o.hot}
              odds={c.odds?.odds ?? null}
              reason={c.reason ?? undefined}
              done={chog.doneToday.includes(o.key)}
            >
              {c.reason === null && (
                <Button
                  className="w-full"
                  size="lg"
                  loading={busyKey === o.key}
                  disabled={!!busyKey && busyKey !== o.key}
                  onClick={() => onDo(o)}
                >
                  Do it · {c.odds!.odds}% chance
                </Button>
              )}
            </JobPoster>
          ))}
        </div>
      )}

      <h3 className="mb-3 mt-8 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-soft">
        Crew jobs · need other Chogs
      </h3>
      {crew.length === 0 ? (
        <p className="rounded-[8px] border-2 border-dashed border-ink-faint p-4 text-[14px] text-ink-soft">
          No crew jobs here for {chog.name}.
        </p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {crew.map(({ o, c }) => (
            <JobPoster
              key={o.key}
              job={o.job}
              district={o.district}
              pay={o.pay}
              hot={o.hot}
              odds={c.odds?.odds ?? null}
              reason={c.reason ?? undefined}
            >
              <Button variant="secondary" className="w-full" disabled>
                Crews open in the next build
              </Button>
            </JobPoster>
          ))}
        </div>
      )}
    </section>
  );
}
