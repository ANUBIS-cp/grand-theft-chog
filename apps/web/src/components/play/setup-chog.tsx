'use client';
import { GANG_IDS, GANGS, SKILLS, type GangId } from '@chog-city/data';
import { useState } from 'react';
import { ChogPortrait } from '@/components/chog-portrait';
import { DistrictPlate } from '@/components/district-plate';
import { GangTag } from '@/components/gang-tag';
import { SkillIcon } from '@/components/skill-icons';
import { Button } from '@/components/ui/button';
import { Label, Panel } from '@/components/ui/panel';
import { cn } from '@/lib/cn';
import type { ChogView } from '@/lib/views';

/** First look at a Chog: what it can do, where it lives, and which gang it reps. */
export function SetupChog({
  chog,
  busy,
  onPickGang,
}: {
  chog: ChogView;
  busy: boolean;
  onPickGang: (g: GangId) => void;
}) {
  const options: GangId[] = chog.gangOptions.anyGang
    ? GANG_IDS.filter(
        (g) => g !== 'skulls' && g !== 'radioactive' && !chog.gangOptions.born.includes(g),
      ).concat(chog.gangOptions.born)
    : chog.gangOptions.born;
  const [gang, setGang] = useState<GangId | null>(chog.gangOptions.born[0] ?? null);

  return (
    <Panel className="p-5 sm:p-6">
      <Label>Meet your Chog</Label>
      <div className="mt-3 grid gap-6 sm:grid-cols-[auto_1fr]">
        <ChogPortrait id={chog.id} name={chog.name} size="lg" className="mx-auto sm:mx-0" priority />
        <div className="min-w-0">
          <h1 className="font-display text-[44px] uppercase leading-[0.9]">{chog.name}</h1>
          <h2 className="mt-4 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-soft">
            What it can do
          </h2>
          {chog.wildcard ? (
            <p className="mt-2 text-[15px] leading-snug">
              A Legendary 1:1. It counts as <strong>any skill</strong> once per job, and can join any gang.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {chog.skills.map((k) => (
                <li key={k} className="flex items-start gap-2.5">
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-ink bg-white">
                    <SkillIcon skill={k} width={18} height={18} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold leading-tight">
                      {SKILLS[k].name}{' '}
                      <span className="font-normal text-ink-soft">
                        · from {chog.skillFrom[k]?.join(', ')}
                      </span>
                    </p>
                    <p className="text-[13px] leading-snug text-ink-soft">{SKILLS[k].description}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <h2 className="mt-5 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-soft">Home</h2>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-[14px]">
            {chog.home === 'any' ? (
              'Every district counts as home.'
            ) : (
              <>
                <DistrictPlate district={chog.home} size="sm" />
                <span className="text-ink-soft">
                  from its {chog.traits.Background} background. Jobs here get +5% odds.
                </span>
              </>
            )}
          </p>
        </div>
      </div>

      <div className="mt-7 border-t-2 border-ink pt-5">
        <h2 className="font-display text-[30px] uppercase leading-none">Pick a gang</h2>
        <p className="mt-2 text-[14px] leading-snug text-ink-soft">
          {chog.gangOptions.anyGang
            ? chog.wildcard
              ? 'As a 1:1 your Chog can rep any gang.'
              : "Your Chog has no gang trait, so it's a free agent: pick any gang."
            : `Its traits let it join ${chog.gangOptions.born.length === 1 ? 'this gang' : 'these gangs'}.`}{' '}
          Every job you do scores turf for your gang. You can switch once a week.
        </p>
        <div className="mt-4 flex flex-wrap gap-2.5" role="radiogroup" aria-label="Gang">
          {options.map((g) => (
            <button
              key={g}
              role="radio"
              aria-checked={gang === g}
              onClick={() => setGang(g)}
              className={cn(
                'rounded-[7px] p-1 transition-transform',
                gang === g
                  ? 'ring-2 ring-ink ring-offset-2 ring-offset-paper-raised'
                  : 'opacity-75 hover:opacity-100',
              )}
            >
              <GangTag gang={g} tilt={false} />
            </button>
          ))}
        </div>
        <Button
          className="mt-6 w-full sm:w-auto"
          size="lg"
          disabled={!gang}
          loading={busy}
          onClick={() => gang && onPickGang(gang)}
        >
          {gang ? `Join ${GANGS[gang].name}` : 'Pick a gang'}
        </Button>
      </div>
    </Panel>
  );
}
