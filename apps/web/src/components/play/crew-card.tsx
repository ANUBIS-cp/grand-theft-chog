'use client';
import { SKILLS } from '@chog-city/data';
import type { Crew, JobTemplate } from '@chog-city/game';
import { ChogPortrait } from '@/components/chog-portrait';
import { DistrictPlate } from '@/components/district-plate';
import { SkillDot } from '@/components/skill-badge';
import type { Board } from '@/lib/api';
import { cn } from '@/lib/cn';
import { nameOf } from '@/lib/describe';

const STATUS: Record<Crew['status'], string> = {
  open: 'Waiting for the crew to fill',
  done: 'Done',
  cancelled: 'Cancelled',
  expired: 'Expired at the reset',
};

/** A crew: the job, each slot (who filled it, or what it still needs), and actions underneath. */
export function CrewCard({
  crew,
  offer,
  highlight,
  children,
  className,
}: {
  crew: Crew;
  offer:
    | Board['offers'][number]
    | { job: JobTemplate; district: Board['offers'][number]['district']; pay: number }
    | null;
  highlight?: number;
  children?: React.ReactNode;
  className?: string;
}) {
  if (!offer) return null;
  const { job } = offer;
  const open = crew.slots.filter((s) => s === null).length;
  return (
    <article className={cn('rounded-[8px] border-2 border-ink bg-paper-raised p-4 shadow-hard', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <DistrictPlate district={offer.district} size="sm" />
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-soft">
          {STATUS[crew.status]}
          {crew.status === 'open' && open > 0 ? ` · ${open} to go` : ''}
        </span>
      </div>
      <h3 className="mt-2 font-display text-[25px] uppercase leading-[0.95]">{job.name}</h3>
      {crew.jailbreakTarget && (
        <p className="mt-1 text-[13px] text-ink-soft">Breaking out {nameOf(crew.jailbreakTarget)}</p>
      )}
      <ul className="mt-3 grid gap-2">
        {job.slots.map((slot, i) => {
          const who = crew.slots[i];
          const need = slot === 'any' ? 'Any Chog' : slot.anyOf.map((k) => SKILLS[k].name).join(' or ');
          return (
            <li
              key={i}
              className={cn(
                'flex items-center gap-3 rounded-[6px] border-2 p-1.5 pr-3',
                who === highlight ? 'border-ink bg-white' : 'border-transparent',
              )}
            >
              {who ? (
                <ChogPortrait id={who} name={nameOf(who)} size="xs" />
              ) : (
                <SkillDot
                  skill={slot === 'any' ? 'any' : slot.anyOf[0]!}
                  size={36}
                  className="border-dashed"
                />
              )}
              <span className="min-w-0 flex-1 text-[14px] leading-tight">
                {who ? <strong>{nameOf(who)}</strong> : <span className="text-ink-soft">Open</span>}
                <span className="block text-[12px] text-ink-soft">Needs {need}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 font-mono text-[11px] text-ink-soft">
        Pays {offer.pay} total, split {job.slots.length} ways · +{job.turf} turf each · {job.jailChanceOnFail}
        % jail each if it fails
      </p>
      {children && <div className="mt-4 space-y-2">{children}</div>}
    </article>
  );
}
