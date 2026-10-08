'use client';
import type { SkillId } from '@chog-city/data';
import type { Crew } from '@chog-city/game';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { Board } from '@/lib/api';
import { crewLink, offerFor, openSlotsFor } from '@/lib/crews';
import { nameOf } from '@/lib/describe';
import type { ChogView } from '@/lib/views';
import { CrewCard } from './crew-card';
import { FindSheet } from './find-sheet';

export function CrewsTab({
  chog,
  board,
  crews,
  busy,
  onJoin,
  onLeave,
  onGoJobs,
}: {
  chog: ChogView;
  board: Board;
  crews: { open: Crew[]; mine: Crew[] };
  busy: string | null;
  onJoin: (crew: Crew, slot: number) => void;
  onLeave: (crew: Crew) => void;
  onGoJobs: () => void;
}) {
  const [find, setFind] = useState<{ skill: SkillId; crew: Crew } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const current =
    crews.open.find((c) => c.slots.includes(chog.id)) ??
    crews.mine.find((c) => c.status === 'open' && c.slots.includes(chog.id));
  const earlier = crews.mine.filter((c) => c.id !== current?.id && c.slots.includes(chog.id));
  const others = crews.open.filter((c) => c.id !== current?.id);

  const copy = async (id: string) => {
    try {
      await navigator.clipboard.writeText(crewLink(id));
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  };

  return (
    <div className="space-y-8">
      <section aria-labelledby="crew-now">
        <h2 id="crew-now" className="font-display text-[34px] uppercase leading-none">
          {chog.name}&apos;s crew
        </h2>
        <p className="mt-1.5 text-[14px] text-ink-soft">
          Crew jobs pay much more. The job runs the moment the last slot fills.
        </p>
        {current ? (
          <CrewCard crew={current} offer={offerFor(board, current)} highlight={chog.id} className="mt-4">
            {current.slots.map((who, i) => {
              const slot = offerFor(board, current)?.job.slots[i];
              if (who !== null || !slot) return null;
              const skill = slot === 'any' ? null : slot.anyOf[0]!;
              return skill ? (
                <Button
                  key={i}
                  variant="secondary"
                  className="w-full"
                  onClick={() => setFind({ skill, crew: current })}
                >
                  Find a {skill[0]!.toUpperCase() + skill.slice(1)} Chog
                </Button>
              ) : null;
            })}
            <div className="flex flex-wrap gap-2">
              <Button className="flex-1" onClick={() => copy(current.id)}>
                {copied === current.id ? 'Link copied' : 'Copy invite link'}
              </Button>
              <Button
                variant="ghost"
                loading={busy === `leave:${current.id}`}
                onClick={() => onLeave(current)}
              >
                {current.leaderId === chog.id ? 'Cancel crew' : 'Leave'}
              </Button>
            </div>
            <p className="text-[12px] text-ink-soft">
              {current.leaderId === chog.id
                ? 'Cancelling gives everyone their move back.'
                : 'Leaving gives you your move back.'}{' '}
              Open crews close at 18:00 UTC.
            </p>
          </CrewCard>
        ) : (
          <div className="mt-4 rounded-[8px] border-2 border-dashed border-ink-faint p-4">
            <p className="text-[14px]">{chog.name} isn&apos;t in a crew right now.</p>
            <p className="mt-1 text-[13px] text-ink-soft">
              Join one below, or start one from a crew job on the Jobs tab.
            </p>
            <Button className="mt-3" size="sm" variant="secondary" onClick={onGoJobs}>
              See crew jobs
            </Button>
          </div>
        )}
      </section>

      <section aria-labelledby="crew-open">
        <h2 id="crew-open" className="font-display text-[34px] uppercase leading-none">
          Open crews
        </h2>
        <p className="mt-1.5 text-[14px] text-ink-soft">
          Crews other players started today. Join a slot your Chog has the skill for.
        </p>
        {others.length === 0 ? (
          <p className="mt-4 rounded-[8px] border-2 border-dashed border-ink-faint p-4 text-[14px] text-ink-soft">
            No open crews right now. Start one and the city will see it here.
          </p>
        ) : (
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            {others.map((c) => {
              const offer = offerFor(board, c);
              if (!offer) return null;
              const slots = openSlotsFor(chog, c, offer.job);
              const blocked =
                chog.crewId && chog.crewId !== c.id
                  ? `${chog.name} is already in a crew.`
                  : chog.jailUntil
                    ? `${chog.name} is in jail.`
                    : chog.movesLeft <= 0
                      ? 'No moves left today.'
                      : chog.level < offer.job.minLevel
                        ? `Needs level ${offer.job.minLevel}. ${chog.name} is level ${chog.level}.`
                        : chog.doneToday.includes(offer.key)
                          ? `${chog.name} already did this job today.`
                          : slots.length === 0
                            ? `${chog.name} doesn't have a skill an open slot needs.`
                            : null;
              return (
                <CrewCard key={c.id} crew={c} offer={offer}>
                  {blocked ? (
                    <p className="text-[13px] font-semibold text-jail">{blocked}</p>
                  ) : (
                    <Button
                      className="w-full"
                      loading={busy === `join:${c.id}`}
                      onClick={() => onJoin(c, slots[0]!)}
                    >
                      Join as{' '}
                      {(offer.job.slots[slots[0]!] === 'any'
                        ? 'any Chog'
                        : (offer.job.slots[slots[0]!] as { anyOf: string[] }).anyOf[0]!
                      ).replace(/^./, (x) => x.toUpperCase())}
                    </Button>
                  )}
                  <p className="text-[12px] text-ink-soft">Started by {nameOf(c.leaderId)}</p>
                </CrewCard>
              );
            })}
          </div>
        )}
      </section>

      {earlier.length > 0 && (
        <section aria-labelledby="crew-earlier">
          <h2 id="crew-earlier" className="font-display text-[26px] uppercase leading-none">
            Earlier crews
          </h2>
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            {earlier.map((c) => (
              <CrewCard key={c.id} crew={c} offer={offerFor(board, c)} highlight={chog.id} />
            ))}
          </div>
        </section>
      )}

      {find && (
        <FindSheet
          skill={find.skill}
          jobName={offerFor(board, find.crew)?.job.name ?? 'a job'}
          link={crewLink(find.crew.id)}
          onClose={() => setFind(null)}
        />
      )}
    </div>
  );
}
