'use client';
import { ChogPortrait } from '@/components/chog-portrait';
import { Countdown } from '@/components/countdown';
import { GangTag } from '@/components/gang-tag';
import { Stars } from '@/components/stars';
import type { ChogView } from '@/lib/views';
import { MovesDots } from './moves';

/** The selected Chog at a glance: who it is, and what it can do right now. */
export function ChogBar({ chog, nextReset }: { chog: ChogView; nextReset: number }) {
  return (
    <section
      aria-label="Your Chog"
      className="rounded-[8px] border-2 border-ink bg-paper-raised p-3 shadow-hard sm:p-4"
    >
      <div className="flex items-center gap-3">
        <ChogPortrait id={chog.id} name={chog.name} size="sm" jailed={!!chog.jailUntil} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h2 className="truncate font-display text-[26px] uppercase leading-none pt-1">{chog.name}</h2>
            {chog.gang ? (
              <GangTag gang={chog.gang} size="sm" tilt={false} />
            ) : (
              <span className="text-[12px] text-ink-soft">No gang yet</span>
            )}
          </div>
          <dl className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px]">
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">Moves left today</dt>
              <dd>
                <MovesDots left={chog.movesLeft} />
              </dd>
              <span className="text-ink-soft">{chog.movesLeft} moves</span>
            </div>
            <div>
              <dt className="sr-only">Cash</dt>
              <dd className="font-semibold text-cash">{chog.cash.toLocaleString('en-US')} cash</dd>
            </div>
            <div>
              <dt className="sr-only">Level</dt>
              <dd>Level {chog.level}</dd>
            </div>
            {chog.wanted > 0 && (
              <div>
                <dt className="sr-only">Wanted</dt>
                <dd>
                  <Stars n={chog.wanted} size={13} />
                </dd>
              </div>
            )}
          </dl>
        </div>
      </div>
      <p className="mt-3 border-t-2 border-dashed border-ink-faint pt-2.5 text-[12px] text-ink-soft">
        {chog.jailUntil ? (
          <span className="font-semibold text-jail">
            In jail. Out in <Countdown to={chog.jailUntil} />.
          </span>
        ) : (
          <>
            Moves refill in <Countdown to={nextReset} className="font-semibold text-ink" />.
          </>
        )}
      </p>
    </section>
  );
}
