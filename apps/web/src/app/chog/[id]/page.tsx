import { SKILLS, getChog } from '@chog-city/data';
import { newChogState } from '@chog-city/game';
import { events as eventsTable } from '@chog-city/server/db';
import { getStates, isChogId, ownerOf } from '@chog-city/server';
import { desc, eq, or } from 'drizzle-orm';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChogPortrait } from '@/components/chog-portrait';
import { DistrictPlate } from '@/components/district-plate';
import { GangTag } from '@/components/gang-tag';
import { SiteHeader } from '@/components/site-header';
import { SkillIcon } from '@/components/skill-icons';
import { Stars } from '@/components/stars';
import { Label, Panel } from '@/components/ui/panel';
import { describe } from '@/lib/describe';
import { ago } from '@/lib/time';
import { chogView } from '@/lib/views';
import { db } from '@/server/db';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = Number((await params).id);
  const c = isChogId(id) ? getChog(id) : undefined;
  if (!c) return { title: 'Chog not found · Chog City' };
  const name = c.title ?? `Chog #${c.metadataId}`;
  return { title: `${name} · Chog City`, description: `${name}'s skills, gang and record in Chog City.` };
}

export default async function ChogPage({ params }: Props) {
  const id = Number((await params).id);
  if (!isChogId(id)) notFound();
  const now = Date.now();
  const d = await db();
  const [states, owner, recent] = await Promise.all([
    getStates(d, [id]),
    ownerOf(d, id),
    d
      .select()
      .from(eventsTable)
      .where(or(eq(eventsTable.chogId, id), eq(eventsTable.target, id)))
      .orderBy(desc(eventsTable.id))
      .limit(30),
  ]);
  const c = chogView(states.get(id) ?? newChogState(id, now), now);
  const s = c.stats;
  const record: [string, number][] = [
    ['Jobs done', s.jobsWon],
    ['Jobs failed', s.jobsLost],
    ['Cash earned', s.cashEarned],
    ['Biggest payout', s.biggestPayout],
    ['Crew jobs', s.crewJobs],
    ['Robbed others', s.robWins],
    ['Got robbed', s.timesRobbed],
    ['Arrests made', s.arrestsMade],
    ['Times arrested', s.timesArrested],
    ['Hours in jail', s.jailHours],
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
      <div className="grid gap-8 pt-8 lg:grid-cols-[auto_1fr]">
        <div className="mx-auto w-full max-w-[340px] lg:mx-0">
          <ChogPortrait
            id={c.id}
            name={c.name}
            size="xl"
            className="!h-auto !w-full aspect-square"
            jailed={!!c.jailUntil}
            priority
          />
          <p className="mt-3 font-mono text-[12px] text-ink-soft">
            Token {c.id} · owner {owner ? `${owner.slice(0, 6)}…${owner.slice(-4)}` : 'unknown'}
          </p>
        </div>

        <div className="min-w-0">
          <Label>{c.active ? 'Playing in Chog City' : "Its owner hasn't played yet"}</Label>
          <h1 className="mt-2 font-display text-[60px] uppercase leading-[0.85] sm:text-[84px]">{c.name}</h1>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {c.gang ? (
              <GangTag gang={c.gang} />
            ) : (
              <span className="text-[14px] text-ink-soft">No gang yet</span>
            )}
            {c.home !== 'any' && <DistrictPlate district={c.home} />}
            <span className="font-display text-[22px] uppercase leading-none pt-1">Level {c.level}</span>
            <span className="font-display text-[22px] uppercase leading-none text-cash pt-1">
              {c.cash.toLocaleString('en-US')} cash
            </span>
            {c.wanted > 0 && <Stars n={c.wanted} />}
            {c.jailUntil > 0 && (
              <span className="rounded-[4px] border-2 border-jail px-2 py-0.5 text-[13px] font-semibold text-jail">
                In jail
              </span>
            )}
          </div>

          <h2 className="mt-8 font-display text-[30px] uppercase leading-none">Skills</h2>
          {c.wildcard ? (
            <p className="mt-2 text-[15px]">A Legendary 1:1: it counts as any skill once per job.</p>
          ) : (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {c.skills.map((k) => (
                <li
                  key={k}
                  className="flex items-center gap-2.5 rounded-[8px] border-2 border-ink bg-paper-raised p-2.5"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-ink bg-white">
                    <SkillIcon skill={k} width={20} height={20} />
                  </span>
                  <span className="min-w-0 text-[14px] leading-tight">
                    <strong>{SKILLS[k].name}</strong>
                    <span className="block truncate text-[12px] text-ink-soft">
                      from {c.skillFrom[k]?.join(', ')}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <h2 className="mt-8 font-display text-[30px] uppercase leading-none">Titles</h2>
          {c.titles.length ? (
            <ul className="mt-3 flex flex-wrap gap-2">
              {c.titles.map((t) => (
                <li
                  key={t.id}
                  className="rounded-[6px] border-2 border-ink bg-white px-2.5 py-1.5"
                  title={t.how}
                >
                  <span className="font-display text-[18px] uppercase leading-none">{t.name}</span>
                  <span className="block text-[11px] text-ink-soft">{t.how}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[14px] text-ink-soft">
              No titles yet. They come from the record: big jobs, arrests, robberies and more.
            </p>
          )}
        </div>
      </div>

      <section className="mt-12 grid gap-8 border-t-2 border-ink pt-8 lg:grid-cols-2">
        <div>
          <h2 className="font-display text-[36px] uppercase leading-none">Record</h2>
          <p className="mt-1.5 text-[14px] text-ink-soft">
            It belongs to the NFT. If the Chog is sold, the record goes with it.
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {record.map(([k, v]) => (
              <Panel key={k} className="p-3 shadow-none">
                <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-soft">{k}</dt>
                <dd className="mt-1 font-display text-[30px] leading-none">{v.toLocaleString('en-US')}</dd>
              </Panel>
            ))}
          </dl>
        </div>
        <div>
          <h2 className="font-display text-[36px] uppercase leading-none">Latest</h2>
          {recent.length === 0 ? (
            <p className="mt-3 text-[14px] text-ink-soft">
              Nothing yet. When this Chog does a job or gets robbed, it shows up here.
            </p>
          ) : (
            <ol className="mt-4 space-y-2.5">
              {recent.map((e) => {
                const line = describe(e.data, e.id);
                return (
                  <li
                    key={e.id}
                    className="flex items-start justify-between gap-3 border-b-2 border-dashed border-ink-faint pb-2.5 text-[14px]"
                  >
                    <span className={line.tone === 'bad' ? 'text-jail' : ''}>{line.text}</span>
                    <time className="shrink-0 font-mono text-[11px] text-ink-soft">
                      {ago(e.at.getTime(), now)}
                    </time>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </section>
    </main>
  );
}
