'use client';
import { DISTRICTS, GANGS } from '@chog-city/data';
import type { GameEvent } from '@chog-city/game';
import { Countdown } from '@/components/countdown';
import { ResultStamp } from '@/components/result-stamp';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import type { FeedItem } from '@/lib/api';
import { describe } from '@/lib/describe';

type JobEvent = Extract<GameEvent, { type: 'job' }>;

/** What just happened, in plain words: the stamp, the story, the roll, and what changed. */
export function ResultSheet({
  items,
  chogId,
  onClose,
}: {
  items: FeedItem[] | null;
  chogId: number;
  onClose: () => void;
}) {
  const job = items?.find((i) => i.event.type === 'job' && i.event.chogId === chogId) as
    (FeedItem & { event: JobEvent }) | undefined;
  const level = items?.find((i) => i.event.type === 'level' && i.event.chogId === chogId)?.event as
    Extract<GameEvent, { type: 'level' }> | undefined;
  if (!job) return null;
  const e = job.event;
  const story = describe(e, job.id);
  const changes: { text: string; tone: 'good' | 'bad' | 'neutral' }[] = [];
  if (e.pay > 0) changes.push({ text: `+${e.pay} cash`, tone: 'good' });
  if (e.turf > 0 && e.gang)
    changes.push({
      text: `+${e.turf} turf points for ${GANGS[e.gang].name} in ${DISTRICTS[e.district].name}`,
      tone: 'good',
    });
  if (e.turf > 0 && !e.gang)
    changes.push({ text: 'No turf points: your Chog has no gang yet', tone: 'neutral' });
  changes.push({ text: `+${e.xp} XP`, tone: 'neutral' });
  if (level) changes.push({ text: `Level up: level ${level.level}`, tone: 'good' });

  return (
    <Sheet
      open={!!items}
      onOpenChange={(o) => !o && onClose()}
      title={e.success ? 'Job done' : 'It went wrong'}
    >
      <div className="grid place-items-center py-3">
        <ResultStamp kind={e.success ? 'done' : e.jailedUntil ? 'jailed' : 'busted'} />
      </div>
      <p className="mt-3 text-center text-[17px] font-semibold leading-snug">{story.text}</p>
      <p className="mt-2 text-center font-mono text-[13px] tabular-nums text-ink-soft">
        Rolled {e.roll}. It needed {e.odds} or less.
      </p>
      <ul className="mt-5 space-y-2 border-t-2 border-dashed border-ink-faint pt-4 text-[15px]">
        {changes.map((c) => (
          <li key={c.text} className={c.tone === 'good' ? 'font-semibold text-cash' : 'text-ink'}>
            {c.text}
          </li>
        ))}
        {e.wanted > 0 && !e.jailedUntil && (
          <li>Wanted stars now: {e.wanted} of 5. They wear off one every 6 hours.</li>
        )}
        {e.jailedUntil > 0 && (
          <li className="font-semibold text-jail">
            Jailed. Out in <Countdown to={e.jailedUntil} />. Going to jail clears your Wanted stars.
          </li>
        )}
      </ul>
      <Button className="mt-6 w-full" size="lg" onClick={onClose}>
        {e.jailedUntil ? 'OK' : 'Next job'}
      </Button>
    </Sheet>
  );
}
