import { CHOGS, GANG_IDS, displayName, getChog, type Chog } from '@chog-city/data';
import { boardFor, dayOf, infoOf } from '@chog-city/game';
import Link from 'next/link';
import { ChogPortrait } from '@/components/chog-portrait';
import { DistrictPlate } from '@/components/district-plate';
import { GangTag } from '@/components/gang-tag';
import { JobPoster } from '@/components/job-poster';
import { SiteHeader } from '@/components/site-header';
import { SkillBadge } from '@/components/skill-badge';
import { Label } from '@/components/ui/panel';

export const revalidate = 3600;

function pickChog(pred: (c: Chog) => boolean, fallback: number): Chog {
  return CHOGS.find(pred) ?? getChog(fallback)!;
}

const PlayLink = ({
  className = '',
  children = 'Play with my Chog',
}: {
  className?: string;
  children?: React.ReactNode;
}) => (
  <Link
    href="/play"
    className={`inline-flex h-14 items-center justify-center rounded-[6px] border-2 border-ink bg-pink px-6 pt-1 font-display text-[22px] uppercase leading-none tracking-wide text-ink shadow-hard transition-[transform,box-shadow,background-color,color] duration-150 hover:bg-pink-deep hover:text-white active:translate-x-[3px] active:translate-y-[3px] active:shadow-none ${className}`}
  >
    {children}
  </Link>
);

export default function Home() {
  const t = (c: Chog, type: keyof Chog['traits']) => c.traits[type];
  const laser = pickChog((c) => /laser/i.test(c.traits.Eyes ?? '') && infoOf(c).skills.length === 2, 2);
  const tux = pickChog((c) => c.traits.Body === 'Tuxedo' && !/laser/i.test(c.traits.Eyes ?? ''), 3);
  const guard = pickChog((c) => c.traits.Body === 'Squid Game Guard', 4);
  const demo = pickChog(
    (c) => infoOf(c).skills.includes('muscle') && infoOf(c).skills.includes('stealth'),
    5,
  );
  const store = boardFor(dayOf(Date.now()), 'lemon-row', new Set()).find((o) => o.job.id === 'corner-store')!;

  const heroes = [
    {
      c: laser,
      from: `${t(laser, 'Eyes')} eyes`,
      skill: 'laser' as const,
      does: 'cuts open vaults',
      tilt: '-rotate-3',
    },
    { c: tux, from: 'Tuxedo', skill: 'smooth' as const, does: 'talks its way in', tilt: 'rotate-2' },
    {
      c: guard,
      from: 'Squid Game Guard',
      skill: 'guard' as const,
      does: 'arrests crooks',
      tilt: '-rotate-1',
    },
  ];

  return (
    <main className="mx-auto max-w-[1180px] px-4 pb-20 sm:px-6">
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

      {/* Hero */}
      <section className="grid items-center gap-10 py-10 sm:py-14 lg:grid-cols-[1.05fr_1fr]">
        <div>
          <Label>A game for the 1,969 Chog NFTs on Monad</Label>
          <h1 className="mt-3 font-display text-[64px] uppercase leading-[0.82] sm:text-[104px]">
            Put your
            <br />
            Chog to work
          </h1>
          <p className="mt-5 max-w-[34ch] text-[19px] leading-snug">
            Your Chog&apos;s traits are its skills. Use them on jobs, team up with other holders for big
            heists, and win the city for your gang.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-4">
            <PlayLink />
            <a href="#how" className="text-[15px] font-semibold underline decoration-2 underline-offset-4">
              How it works
            </a>
          </div>
          <p className="mt-4 text-[13px] text-ink-soft">
            Free to play. Log in by signing a message: no gas, no tokens move.
          </p>
        </div>

        <ul className="grid grid-cols-3 gap-3 sm:gap-5" aria-label="Examples: traits become skills">
          {heroes.map(({ c, from, skill, does, tilt }) => (
            <li key={c.id} className={`flex flex-col items-center text-center ${tilt}`}>
              <ChogPortrait
                id={c.id}
                name={displayName(c)}
                size="lg"
                className="!h-auto !w-full aspect-square"
                priority
              />
              <p className="mt-3 text-[12px] leading-tight text-ink-soft sm:text-[13px]">{from}</p>
              <span className="my-1 text-ink-soft" aria-hidden="true">
                ↓
              </span>
              <SkillBadge skill={skill} compact />
              <p className="mt-1.5 text-[12px] font-semibold leading-tight sm:text-[13px]">{does}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-4 border-t-2 border-ink py-12">
        <h2 className="font-display text-[44px] uppercase leading-none sm:text-[56px]">How it works</h2>
        <ol className="mt-8 grid gap-10 lg:grid-cols-3 lg:gap-8">
          <li>
            <Step
              n={1}
              title="Your traits are your skills"
              text="Every trait gives your Chog something it's good at. A Knife makes robberies safer, laser eyes cut vaults, a crown gets you into the gala."
            />
            <div className="mt-5 flex items-start gap-4 rounded-[8px] border-2 border-ink bg-paper-raised p-4 shadow-hard">
              <ChogPortrait id={demo.id} name={displayName(demo)} size="md" />
              <div className="min-w-0">
                <p className="font-display text-[22px] uppercase leading-none">{displayName(demo)}</p>
                <p className="mt-2 text-[12px] text-ink-soft">Its skills</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {infoOf(demo).skills.map((k) => (
                    <SkillBadge key={k} skill={k} compact />
                  ))}
                </div>
              </div>
            </div>
          </li>
          <li>
            <Step
              n={2}
              title="Pick a job your skills fit"
              text="Each day you get 5 moves. Small jobs you do alone and see the result in seconds. Big jobs need a crew with skills you don't have."
            />
            <JobPoster
              job={store.job}
              district="lemon-row"
              pay={store.pay}
              hot={store.hot}
              odds={64}
              className="mt-5"
            />
          </li>
          <li>
            <Step
              n={3}
              title="Win turf for your gang"
              text="Every job scores points for your gang in that district. At 18:00 UTC each district goes to the gang with the most points."
            />
            <div className="mt-5 space-y-3 rounded-[8px] border-2 border-ink bg-paper-raised p-4 shadow-hard">
              {(
                [
                  ['lemon-row', 'lazoor'],
                  ['mon-square', 'mcga'],
                  ['pink-strip', 'gangstas'],
                ] as const
              ).map(([d, g]) => (
                <div key={d} className="flex items-center justify-between gap-3">
                  <DistrictPlate district={d} size="sm" />
                  <GangTag gang={g} size="sm" />
                </div>
              ))}
            </div>
          </li>
        </ol>
      </section>

      {/* Gangs */}
      <section className="border-t-2 border-ink py-12">
        <div className="grid gap-8 lg:grid-cols-[1fr_1.4fr] lg:items-center">
          <div>
            <h2 className="font-display text-[44px] uppercase leading-none sm:text-[56px]">
              Your gang comes from your traits
            </h2>
            <p className="mt-4 max-w-[42ch] text-[17px] leading-snug">
              The same gangs you already put in your Discord name. An MCGA cap puts you in MCGA Gang, laser
              eyes in Lazoor Gang. No gang trait? You&apos;re a free agent and any gang can have you.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {GANG_IDS.map((g) => (
              <GangTag key={g} gang={g} />
            ))}
          </div>
        </div>
      </section>

      {/* Risk + record */}
      <section className="grid gap-8 border-t-2 border-ink py-12 lg:grid-cols-2">
        <div>
          <h2 className="font-display text-[36px] uppercase leading-none">Crime has risk</h2>
          <p className="mt-3 max-w-[46ch] text-[16px] leading-snug">
            Crimes add Wanted stars. Fail a job and your Chog can land in jail for a few hours. Other Chogs
            can rob you, and you get one free shot back.
          </p>
        </div>
        <div>
          <h2 className="font-display text-[36px] uppercase leading-none">Your Chog keeps a record</h2>
          <p className="mt-3 max-w-[46ch] text-[16px] leading-snug">
            Level, cash, jobs, arrests, crewmates, rivals and titles. The record belongs to the NFT: sell the
            Chog and the buyer gets it too.
          </p>
        </div>
      </section>

      <section className="border-t-2 border-ink py-12 text-center">
        <p className="font-display text-[40px] uppercase leading-none sm:text-[56px]">
          Your Chog is already in the city.
        </p>
        <PlayLink className="mt-6">Find my Chog</PlayLink>
      </section>

      <footer className="border-t-2 border-ink pt-6 text-[13px] text-ink-soft">
        Built for Chogathon 2026. Chog art belongs to Chog. Every roll in the game can be checked against
        seeds published on Monad.
      </footer>
    </main>
  );
}

function Step({ n, title, text }: { n: number; title: string; text: string }) {
  return (
    <div>
      <span className="inline-grid h-9 w-9 place-items-center rounded-full border-2 border-ink bg-ink pt-1 font-display text-[20px] leading-none text-paper-raised">
        {n}
      </span>
      <h3 className="mt-3 font-display text-[28px] uppercase leading-none">{title}</h3>
      <p className="mt-2 max-w-[44ch] text-[15px] leading-snug text-ink-soft">{text}</p>
    </div>
  );
}
