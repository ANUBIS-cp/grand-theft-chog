import type { DistrictId } from '@chog-city/data';
import type { JobTemplate } from '@chog-city/game';
import { cn } from '@/lib/cn';
import { CrewSlots, type SlotView } from './crew-slots';
import { DistrictPlate } from './district-plate';
import { SkillIcon } from './skill-icons';

export interface JobPosterProps {
  job: JobTemplate;
  district: DistrictId;
  pay: number;
  hot?: boolean;
  /** Odds for the selected Chog, or null when it can't take this job. */
  odds: number | null;
  /** "Odds" by default; crew jobs show "Base odds" because the crew changes them. */
  oddsLabel?: string;
  reason?: string;
  slots?: SlotView[];
  done?: boolean;
  className?: string;
  children?: React.ReactNode;
}

const KIND_LABEL: Record<JobTemplate['kind'], string> = {
  legal: 'Legal',
  solo: 'Solo',
  crew: 'Crew',
  big: 'Big job',
};

/** A job as a poster pinned to the wall. */
export function JobPoster({
  job,
  district,
  pay,
  hot,
  odds,
  oddsLabel = 'Odds',
  reason,
  slots,
  done,
  className,
  children,
}: JobPosterProps) {
  const crew = job.slots.length > 1;
  return (
    <article
      className={cn(
        'relative flex flex-col rounded-[6px] border-2 border-ink bg-paper-raised p-4 pt-5 shadow-hard',
        done && 'opacity-60',
        className,
      )}
    >
      {/* tape */}
      <span
        aria-hidden="true"
        className="absolute -top-2.5 left-1/2 h-5 w-16 -translate-x-1/2 rotate-[-2deg] bg-[#e9e2c2]/85 shadow-[0_1px_0_rgb(0_0_0/0.15)]"
      />
      {hot && (
        <span className="absolute -right-2 -top-3 rotate-[8deg] rounded-[5px] border-2 border-ink bg-pink px-1.5 pb-[1px] pt-[4px] font-display text-[15px] leading-none shadow-hard-sm">
          HOT +50%
        </span>
      )}
      <div className="flex items-center gap-2">
        <DistrictPlate district={district} size="sm" />
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-soft">
          {KIND_LABEL[job.kind]}
          {job.minLevel > 1 ? ` · LV ${job.minLevel}+` : ''}
        </span>
      </div>
      <h3 className="mt-2.5 font-display text-[27px] uppercase leading-[0.95]">{job.name}</h3>

      <div className="mt-3">
        {crew ? (
          <CrewSlots slots={slots ?? job.slots.map((slot) => ({ slot }))} />
        ) : (
          <p className="flex flex-wrap items-center gap-1.5 text-[13px] text-ink-soft">
            Needs
            {job.slots[0] === 'any' ? (
              <span className="font-semibold text-ink">any Chog</span>
            ) : (
              job.slots[0]!.anyOf.map((k, i) => (
                <span key={k} className="inline-flex items-center gap-1 font-semibold text-ink">
                  {i > 0 && <span className="font-normal text-ink-soft">or</span>}
                  <SkillIcon skill={k} width={15} height={15} />
                  {k[0]!.toUpperCase() + k.slice(1)}
                </span>
              ))
            )}
          </p>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2 border-t-2 border-dashed border-ink-faint pt-3">
        <div>
          <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-soft">{oddsLabel}</dt>
          <dd className={cn('font-display text-[30px] leading-none', odds === null && 'text-ink-soft')}>
            {odds === null ? '—' : `${odds}%`}
          </dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-soft">
            {crew ? 'Pay (total)' : 'Pay'}
          </dt>
          <dd className="font-display text-[30px] leading-none text-cash">
            {job.special === 'jailbreak' ? 'Free' : pay}
          </dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-soft">Turf</dt>
          <dd className="font-display text-[30px] leading-none">+{job.turf}</dd>
        </div>
      </dl>
      <p className="mt-2 font-mono text-[11px] text-ink-soft">
        {job.wantedOnSuccess < 0
          ? 'Clears a star'
          : `+${job.wantedOnSuccess} star${job.wantedOnSuccess === 1 ? '' : 's'}`}
        {job.jailChanceOnFail > 0 ? ` · ${job.jailChanceOnFail}% jail if it fails` : ' · no jail'}
      </p>
      {reason && <p className="mt-2 text-[13px] font-semibold text-jail">{reason}</p>}
      {children && <div className="mt-4">{children}</div>}
    </article>
  );
}
