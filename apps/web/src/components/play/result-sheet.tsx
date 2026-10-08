'use client';
import { DISTRICTS, GANGS } from '@chog-city/data';
import type { GameEvent } from '@chog-city/game';
import { Countdown } from '@/components/countdown';
import { ResultStamp, type StampKind } from '@/components/result-stamp';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import type { FeedItem } from '@/lib/api';
import { describe, listNames } from '@/lib/describe';

type Change = { text: string; tone: 'good' | 'bad' | 'neutral' };

/**
 * What just happened, in plain words: the stamp, the story, the roll, and every change.
 * Works for jobs (solo and crew), robberies and arrests.
 */
export function ResultSheet({
  items,
  chogId,
  onClose,
}: {
  items: FeedItem[] | null;
  chogId: number;
  onClose: () => void;
}) {
  const main = items?.find(
    (i) =>
      (i.event.type === 'job' || i.event.type === 'rob' || i.event.type === 'arrest') &&
      i.event.chogId === chogId,
  );
  if (!items || !main) return null;
  const e = main.event;
  const level = items.find((i) => i.event.type === 'level' && i.event.chogId === chogId)?.event as
    Extract<GameEvent, { type: 'level' }> | undefined;
  const crew =
    e.type === 'job' && e.crewId
      ? items.filter((i) => i.event.type === 'job' && i.event.crewId === e.crewId).map((i) => i.event.chogId)
      : undefined;
  const story = describe(e, main.id, crew);
  const changes: Change[] = [];
  let stamp: StampKind;
  let title: string;
  let jailedUntil = 0;
  let wanted: number | null = null;

  if (e.type === 'job') {
    stamp = e.success ? 'done' : e.jailedUntil ? 'jailed' : 'busted';
    title = e.success ? (crew ? 'Crew job done' : 'Job done') : 'It went wrong';
    if (e.pay > 0) changes.push({ text: `+${e.pay} cash${crew ? ' (your share)' : ''}`, tone: 'good' });
    if (e.turf > 0 && e.gang)
      changes.push({
        text: `+${e.turf} turf points for ${GANGS[e.gang].name} in ${DISTRICTS[e.district].name}`,
        tone: 'good',
      });
    if (e.turf > 0 && !e.gang)
      changes.push({ text: 'No turf points: your Chog has no gang yet', tone: 'neutral' });
    changes.push({ text: `+${e.xp} XP`, tone: 'neutral' });
    if (crew) changes.push({ text: `Crew: ${listNames(crew)}`, tone: 'neutral' });
    jailedUntil = e.jailedUntil;
    wanted = e.wanted;
  } else if (e.type === 'rob') {
    stamp = e.success ? 'done' : e.jailedUntil ? 'jailed' : 'busted';
    title = e.success ? (e.revenge ? 'Got even' : 'Robbed') : 'Robbery failed';
    if (e.success) changes.push({ text: `+${e.loot} cash`, tone: 'good' });
    else changes.push({ text: '+2 Wanted stars', tone: 'bad' });
    if (e.revenge) changes.push({ text: 'Revenge: this one was free', tone: 'neutral' });
    jailedUntil = e.jailedUntil;
  } else {
    // arrest (the type guard above leaves only this case)
    const a = e as Extract<GameEvent, { type: 'arrest' }>;
    stamp = a.success ? 'jailed' : 'got-away';
    title = a.success ? 'Arrested' : 'They got away';
    if (a.success) changes.push({ text: `+${a.bounty} cash bounty`, tone: 'good' });
  }
  if (level) changes.push({ text: `Level up: level ${level.level}`, tone: 'good' });

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={title}>
      <div className="grid place-items-center py-3">
        <ResultStamp kind={stamp} />
      </div>
      <p className="mt-3 text-center text-[17px] font-semibold leading-snug">{story.text}</p>
      <p className="mt-2 text-center font-mono text-[13px] tabular-nums text-ink-soft">
        Rolled {'roll' in e ? e.roll : 0}. It needed {'odds' in e ? e.odds : 0} or less.
      </p>
      <ul className="mt-5 space-y-2 border-t-2 border-dashed border-ink-faint pt-4 text-[15px]">
        {changes.map((c) => (
          <li
            key={c.text}
            className={
              c.tone === 'good'
                ? 'font-semibold text-cash'
                : c.tone === 'bad'
                  ? 'font-semibold text-jail'
                  : 'text-ink'
            }
          >
            {c.text}
          </li>
        ))}
        {wanted !== null && wanted > 0 && !jailedUntil && (
          <li>Wanted stars now: {wanted} of 5. They wear off one every 6 hours.</li>
        )}
        {jailedUntil > 0 && (
          <li className="font-semibold text-jail">
            Jailed. Out in <Countdown to={jailedUntil} />. Going to jail clears your Wanted stars.
          </li>
        )}
      </ul>
      <Button className="mt-6 w-full" size="lg" onClick={onClose}>
        OK
      </Button>
    </Sheet>
  );
}
