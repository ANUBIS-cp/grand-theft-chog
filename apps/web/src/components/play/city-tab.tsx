'use client';
import { DISTRICTS, GANGS, type DistrictId, type GangId } from '@chog-city/data';
import type { Scores } from '@chog-city/game';
import Link from 'next/link';
import { useState } from 'react';
import { CityMap, type MapPing } from '@/components/city-map';
import { Countdown } from '@/components/countdown';
import { DistrictPlate } from '@/components/district-plate';
import { FeedList } from '@/components/feed-list';
import { GangTag } from '@/components/gang-tag';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import type { FeedItem, GangRow } from '@/lib/api';
import { GANG_COLOR } from '@/lib/theme';

export function leadersOf(scores: Scores): Partial<Record<DistrictId, GangId>> {
  const out: Partial<Record<DistrictId, GangId>> = {};
  for (const [d, s] of Object.entries(scores) as [DistrictId, Partial<Record<GangId, number>>][]) {
    const sorted = Object.entries(s ?? {}).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
    if (sorted[0] && (!sorted[1] || sorted[1][1] !== sorted[0][1])) out[d] = sorted[0][0] as GangId;
  }
  return out;
}

export function CityTab({
  holders,
  scores,
  nextReset,
  closed,
  myGang,
  gangs,
  feed,
  mine,
  pings,
  onSeeJobs,
}: {
  holders: Partial<Record<DistrictId, GangId>>;
  scores: Scores;
  nextReset: number;
  closed: (d: DistrictId) => boolean;
  myGang: GangId | null;
  gangs: GangRow[] | null;
  feed: FeedItem[];
  mine: ReadonlySet<number>;
  pings: MapPing[];
  onSeeJobs: (d: DistrictId) => void;
}) {
  const [picked, setPicked] = useState<DistrictId | null>(null);
  const [showAll, setShowAll] = useState(false);
  const leaders = leadersOf(scores);
  const rows = picked
    ? (Object.entries(scores[picked] ?? {}) as [GangId, number][]).sort((a, b) => b[1] - a[1])
    : [];
  const max = rows[0]?.[1] ?? 1;

  return (
    <div className="space-y-8 lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start lg:gap-10 lg:space-y-0">
      <section aria-labelledby="city-title">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 id="city-title" className="font-display text-[34px] uppercase leading-none">
            The city
          </h2>
          <p className="text-[13px] text-ink-soft">
            Turf flips in <Countdown to={nextReset} className="font-semibold text-ink" />
          </p>
        </div>
        <p className="mt-1.5 text-[14px] text-ink-soft">
          Each district belongs to the gang that scored the most there yesterday. Tap a district to see who is
          winning it today.
          {myGang ? ' Your gang’s districts have a dashed line.' : ''}
        </p>
        <div className="mx-auto mt-4 max-w-[520px] rounded-[14px] border-2 border-ink shadow-hard">
          <CityMap
            holders={holders}
            leaders={leaders}
            closed={closed}
            myGang={myGang}
            pings={pings}
            onPick={setPicked}
          />
        </div>
      </section>

      <div className="space-y-8">
        <section aria-labelledby="gangs-title">
          <h2 id="gangs-title" className="font-display text-[34px] uppercase leading-none">
            Gangs
          </h2>
          <p className="mt-1.5 text-[14px] text-ink-soft">
            Ranked by districts held now, then by district-days this season.
          </p>
          {gangs === null ? (
            <div className="mt-4 h-40 animate-pulse rounded-[8px] bg-ink-faint" />
          ) : (
            <ol className="mt-4 divide-y-2 divide-ink rounded-[8px] border-2 border-ink bg-paper-raised">
              {gangs
                .filter(
                  (g, i) =>
                    showAll || i < 3 || g.holds.length || g.pointsToday || g.districtDays || g.members,
                )
                .map((g, i) => (
                  <li key={g.gang} className="flex items-center gap-3 px-3 py-2.5">
                    <span className="w-6 text-center font-display text-[20px] leading-none pt-1">
                      {i + 1}
                    </span>
                    <Link href={`/gangs/${g.gang}`} className="min-w-0 flex-1">
                      <GangTag gang={g.gang} size="sm" tilt={false} />
                    </Link>
                    <span className="text-right text-[12px] leading-tight text-ink-soft">
                      <strong className="block text-[15px] text-ink">{g.holds.length} held</strong>
                      {g.pointsToday} pts today · {g.members} playing
                    </span>
                  </li>
                ))}
            </ol>
          )}
          {gangs &&
            !showAll &&
            gangs.some(
              (g, i) => !(i < 3 || g.holds.length || g.pointsToday || g.districtDays || g.members),
            ) && (
              <button
                className="mt-3 text-[13px] font-semibold underline underline-offset-4"
                onClick={() => setShowAll(true)}
              >
                Show all {gangs.length} gangs (the rest haven&apos;t played yet)
              </button>
            )}
        </section>

        <section aria-labelledby="feed-title">
          <h2 id="feed-title" className="font-display text-[34px] uppercase leading-none">
            Live
          </h2>
          <p className="mt-1.5 text-[14px] text-ink-soft">Everything happening in the city, as it happens.</p>
          <FeedList
            items={feed}
            mine={mine}
            empty="Quiet so far. The first move of the day shows up here."
            className="mt-3"
          />
        </section>
      </div>

      <Sheet
        open={!!picked}
        onOpenChange={(o) => !o && setPicked(null)}
        title={picked ? DISTRICTS[picked].name : ''}
        description={picked ? DISTRICTS[picked].kind : undefined}
      >
        {picked && (
          <div>
            <div className="flex flex-wrap items-center gap-2 text-[14px]">
              <DistrictPlate district={picked} size="sm" />
              {holders[picked] ? (
                <>
                  held by <GangTag gang={holders[picked]!} size="sm" tilt={false} />
                </>
              ) : (
                <span className="text-ink-soft">Nobody holds it yet.</span>
              )}
            </div>
            {closed(picked) ? (
              <p className="mt-4 text-[14px]">This district opens for Halloween week.</p>
            ) : (
              <>
                <h3 className="mb-2 mt-5 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-soft">
                  Points today (best 5 Chogs per gang)
                </h3>
                {rows.length === 0 ? (
                  <p className="text-[14px] text-ink-soft">
                    No points yet today. One job here could take it.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {rows.map(([g, p]) => (
                      <li key={g} className="flex items-center gap-3">
                        <span className="w-[120px] shrink-0 truncate text-[13px] font-semibold">
                          {GANGS[g].name}
                        </span>
                        <span className="h-4 flex-1 overflow-hidden rounded-full border-2 border-ink bg-white">
                          <span
                            className="block h-full"
                            style={{
                              width: `${Math.max(6, (p / max) * 100)}%`,
                              background: GANG_COLOR[g].bg,
                            }}
                          />
                        </span>
                        <span className="w-8 text-right font-mono text-[13px] tabular-nums">{p}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <Button
                  className="mt-6 w-full"
                  onClick={() => {
                    onSeeJobs(picked);
                    setPicked(null);
                  }}
                >
                  See jobs in {DISTRICTS[picked].name}
                </Button>
              </>
            )}
          </div>
        )}
      </Sheet>
    </div>
  );
}
