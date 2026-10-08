import { CHOGS, DISTRICT_IDS, GANG_IDS, SKILL_IDS, displayName, getChog } from '@chog-city/data';
import { addWanted, boardFor, dayOf, infoOf, jobOdds, newChogState, type Ctx } from '@chog-city/game';
import type { Metadata } from 'next';
import { ChogPortrait } from '@/components/chog-portrait';
import { DistrictPlate } from '@/components/district-plate';
import { GangTag } from '@/components/gang-tag';
import { JobPoster } from '@/components/job-poster';
import { OddsBreakdown } from '@/components/odds-breakdown';
import { ResultStamp } from '@/components/result-stamp';
import { SkillBadge, SkillDot } from '@/components/skill-badge';
import { SKILL_ICON } from '@/components/skill-icons';
import { Stars } from '@/components/stars';
import { Button } from '@/components/ui/button';
import { Label, Panel } from '@/components/ui/panel';
import { DISTRICT_COLOR, GANG_COLOR } from '@/lib/theme';

export const metadata: Metadata = { title: 'Design · Chog City', robots: { index: false } };

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="border-t-2 border-ink py-10">
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-4xl uppercase leading-none">{title}</h2>
        {note && <p className="max-w-md text-sm text-ink-soft">{note}</p>}
      </div>
      {children}
    </section>
  );
}

const swatch = (name: string, value: string, fg = '#111') => (
  <div key={name} className="overflow-hidden rounded-[6px] border-2 border-ink">
    <div
      className="grid h-16 place-items-end p-2 font-mono text-[11px]"
      style={{ background: value, color: fg }}
    >
      {value}
    </div>
    <div className="border-t-2 border-ink bg-paper-raised px-2 py-1 text-[12px] font-semibold">{name}</div>
  </div>
);

export default function DesignPage() {
  const now = Date.now();
  const day = dayOf(now);
  const ctx: Ctx = { now, seed: '00'.repeat(32), holders: { 'lemon-row': 'lazoor' }, events: new Set() };
  const laser = CHOGS.find((c) => infoOf(c).skills.includes('laser') && infoOf(c).skills.includes('muscle'))!;
  const blaze = CHOGS.find((c) => c.title === 'Blaze')!;
  const plain = getChog(683)!;
  const s0 = { ...newChogState(laser.id, now), xp: 300, gang: 'lazoor' as const };
  const lemon = boardFor(day, 'lemon-row', new Set());
  const store = lemon.find((o) => o.job.id === 'corner-store')!;
  const shake = lemon.find((o) => o.job.id === 'shake-down')!;
  const vault = boardFor(day, 'mon-square', new Set()).find((o) => o.job.id === 'mon-vault')!;
  const hot = lemon.find((o) => o.hot) ?? store;
  const odds = jobOdds(store.job, [{ info: infoOf(laser), state: addWanted(s0, 2, now) }], 'lemon-row', ctx);
  const sample = CHOGS.filter((_, i) => i % 211 === 7).slice(0, 5);

  return (
    <main className="mx-auto max-w-[1200px] px-4 pb-24 sm:px-6">
      <header className="py-8">
        <Label>Chog City · design system</Label>
        <h1 className="mt-2 font-display text-7xl uppercase leading-[0.85] sm:text-8xl">The street kit</h1>
        <p className="mt-3 max-w-xl text-ink-soft">
          Every part the game is built from, in every state, with real Chogs. If a screen needs something that
          isn&apos;t here, it gets added here first.
        </p>
      </header>

      <Section
        title="Colour"
        note="Base colours from chog.xyz. District colours are sampled from the Background traits in the art."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {swatch('Paper', '#d8d6c7')}
          {swatch('Paper raised', '#eeecdf')}
          {swatch('Ink', '#111111', '#eeecdf')}
          {swatch('Pink (actions)', '#d83e7e')}
          {swatch('Night', '#0f1a26', '#eeecdf')}
          {swatch('Cash', '#2f7d4f', '#fff')}
          {swatch('Jail', '#c23a2b', '#fff')}
          {swatch('Wanted', '#d99a1e')}
        </div>
        <h3 className="mb-3 mt-8 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-soft">
          Districts
        </h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {DISTRICT_IDS.map((d) => swatch(d, DISTRICT_COLOR[d].bg, DISTRICT_COLOR[d].fg))}
        </div>
        <h3 className="mb-3 mt-8 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-soft">Gangs</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {GANG_IDS.map((g) => swatch(g, GANG_COLOR[g].bg, GANG_COLOR[g].fg))}
        </div>
      </Section>

      <Section
        title="Type"
        note="Koulen for headings and big numbers (the chog.xyz face). Archivo for reading. JetBrains Mono for odds, timers and rolls."
      >
        <div className="space-y-4">
          <p className="font-display text-[88px] uppercase leading-[0.85]">Crack the vault</p>
          <p className="font-display text-[48px] uppercase leading-[0.9]">Lazoor Gang took Lemon Row</p>
          <p className="font-display text-[27px] uppercase leading-none">Rob the corner store</p>
          <p className="max-w-prose text-[17px] leading-relaxed">
            Your Chog&apos;s traits are its skills. Big jobs need skills you don&apos;t have, so you team up
            with other holders.
          </p>
          <p className="text-[14px] text-ink-soft">Secondary text: moves reset at 18:00 UTC.</p>
          <p className="font-mono text-[14px] tabular-nums">Roll 37 · needed 64 or under · 2h 14m left</p>
        </div>
      </Section>

      <Section
        title="Buttons"
        note="Pink is the one main action on a screen. Pressed buttons sink into their shadow."
      >
        <div className="flex flex-wrap items-center gap-4">
          <Button size="lg">Do the job</Button>
          <Button>Start a crew</Button>
          <Button variant="secondary">Invite a Chog</Button>
          <Button variant="ink">Connect wallet</Button>
          <Button variant="danger">Rob</Button>
          <Button variant="ghost">Cancel</Button>
          <Button loading>Working</Button>
          <Button disabled>No moves left</Button>
          <Button size="sm" variant="secondary">
            Small
          </Button>
        </div>
      </Section>

      <Section
        title="Skills"
        note="17 glyphs drawn for this game, same thick outline as the art. Shown at 16, 24 and 40 px."
      >
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6 lg:grid-cols-9">
          {SKILL_IDS.map((k) => {
            const Icon = SKILL_ICON[k];
            return (
              <Panel key={k} className="flex flex-col items-center gap-2 p-3 shadow-none">
                <div className="flex items-end gap-2">
                  <Icon width={16} height={16} />
                  <Icon width={24} height={24} />
                  <Icon width={40} height={40} />
                </div>
                <span className="text-[12px] font-semibold capitalize">{k}</span>
              </Panel>
            );
          })}
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          {SKILL_IDS.map((k, i) => (
            <SkillBadge key={k} skill={k} muted={i % 5 === 4} />
          ))}
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <SkillDot skill="laser" />
          <SkillDot skill="tech" filled />
          <SkillDot skill="any" />
        </div>
      </Section>

      <Section title="Places and gangs">
        <div className="flex flex-wrap gap-3">
          {DISTRICT_IDS.map((d) => (
            <DistrictPlate key={d} district={d} />
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <DistrictPlate district="lemon-row" size="sm" />
          <DistrictPlate district="lemon-row" size="lg" />
        </div>
        <div className="mt-8 flex flex-wrap gap-4">
          {GANG_IDS.map((g) => (
            <GangTag key={g} gang={g} />
          ))}
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <GangTag gang="mcga" size="lg" />
          <GangTag gang="lazoor" size="sm" />
        </div>
      </Section>

      <Section title="Chogs" note="The art is the hero. Overlays only in corners, except jail bars.">
        <div className="flex flex-wrap items-end gap-5">
          <ChogPortrait id={blaze.id} name={displayName(blaze)} size="xl" level={7} wanted={3} />
          <ChogPortrait id={laser.id} name={displayName(laser)} size="lg" level={4} />
          <ChogPortrait id={plain.id} name={displayName(plain)} size="lg" jailed wanted={0} />
          <ChogPortrait id={plain.id} name={displayName(plain)} size="md" wanted={5} level={2} />
          <ChogPortrait id={laser.id} name={displayName(laser)} size="sm" />
          <ChogPortrait id={blaze.id} name={displayName(blaze)} size="xs" />
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          {sample.map((c) => (
            <ChogPortrait key={c.id} id={c.id} name={displayName(c)} size="sm" />
          ))}
        </div>
      </Section>

      <Section
        title="Jobs"
        note="A job is a poster on the wall. Odds are for the Chog you picked; a dash means it can't take the job."
      >
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <JobPoster job={store.job} district="lemon-row" pay={store.pay} hot={store.hot} odds={odds.odds}>
            <Button className="w-full">Do it</Button>
          </JobPoster>
          <JobPoster
            job={shake.job}
            district="lemon-row"
            pay={shake.pay}
            odds={58}
            slots={[
              { slot: shake.job.slots[0]!, chog: { id: laser.id, name: displayName(laser) } },
              { slot: shake.job.slots[1]! },
              { slot: shake.job.slots[2]! },
            ]}
          >
            <Button variant="secondary" className="w-full">
              Join · 2 slots open
            </Button>
          </JobPoster>
          <JobPoster
            job={vault.job}
            district="mon-square"
            pay={vault.pay}
            odds={null}
            reason="Needs level 5. Your Chog is level 4."
          >
            <Button className="w-full" disabled>
              Start a crew
            </Button>
          </JobPoster>
          <JobPoster job={hot.job} district="lemon-row" pay={hot.pay} hot odds={71} done>
            <p className="text-center font-mono text-[12px] text-ink-soft">Done today</p>
          </JobPoster>
        </div>
      </Section>

      <Section title="Odds and results" note="Every roll shows its number and the number it needed.">
        <div className="grid gap-8 sm:grid-cols-2">
          <Panel className="p-5">
            <OddsBreakdown odds={odds} />
          </Panel>
          <Panel className="relative grid min-h-[220px] place-items-center overflow-hidden p-5">
            <div className="flex flex-wrap items-center justify-center gap-6">
              <ResultStamp kind="done" />
              <ResultStamp kind="busted" />
            </div>
            <p className="mt-4 font-mono text-[13px] tabular-nums text-ink-soft">
              Roll 37 · needed 64 or under
            </p>
          </Panel>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-6">
          <Stars n={0} />
          <Stars n={2} />
          <Stars n={5} size={22} />
        </div>
      </Section>

      <Section title="States" note="Empty, loading and error are designed, not left blank.">
        <div className="grid gap-6 sm:grid-cols-3">
          <Panel className="p-5">
            <Label>Empty</Label>
            <p className="mt-2 font-display text-2xl uppercase leading-none">No open crews</p>
            <p className="mt-2 text-sm text-ink-soft">
              Nobody is hiring right now. Start one and the city will see it.
            </p>
            <Button className="mt-4" size="sm">
              Start a crew
            </Button>
          </Panel>
          <Panel className="p-5" aria-busy="true">
            <Label>Loading</Label>
            <div className="mt-3 space-y-2">
              <div className="h-5 w-2/3 animate-pulse rounded bg-ink-faint" />
              <div className="h-4 w-full animate-pulse rounded bg-ink-faint" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-ink-faint" />
            </div>
          </Panel>
          <Panel className="border-jail p-5">
            <Label className="text-jail">Error</Label>
            <p className="mt-2 font-semibold">That move didn&apos;t go through.</p>
            <p className="mt-1 text-sm text-ink-soft">
              Your Chog is in jail for another 1h 40m. Bail it out or wait.
            </p>
            <Button className="mt-4" size="sm" variant="secondary">
              See bail options
            </Button>
          </Panel>
        </div>
      </Section>
    </main>
  );
}
