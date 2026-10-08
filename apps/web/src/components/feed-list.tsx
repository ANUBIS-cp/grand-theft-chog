'use client';
import { useEffect, useState } from 'react';
import type { FeedItem } from '@/lib/api';
import { cn } from '@/lib/cn';
import { describe, nameOf } from '@/lib/describe';
import { ago } from '@/lib/time';
import { ChogPortrait } from './chog-portrait';

/** Crew jobs store one event per member; show them as one line naming the whole crew. */
export function groupFeed(items: FeedItem[]): { item: FeedItem; crew?: number[] }[] {
  const out: { item: FeedItem; crew?: number[] }[] = [];
  const seen = new Map<string, { item: FeedItem; crew?: number[] }>();
  for (const it of items) {
    const e = it.event;
    if (e.type === 'job' && e.crewId) {
      const key = `${e.crewId}:${e.jobId}`;
      const g = seen.get(key);
      if (g) {
        g.crew!.push(e.chogId);
        continue;
      }
      const entry = { item: it, crew: [e.chogId] };
      seen.set(key, entry);
      out.push(entry);
    } else if (e.type !== 'level' && e.type !== 'gang') out.push({ item: it });
  }
  return out;
}

export function FeedList({
  items,
  empty,
  max = 30,
  action,
  mine,
  className,
}: {
  items: FeedItem[];
  empty: string;
  max?: number;
  /** The viewer's Chogs: when one of them is the target, good and bad swap (a failed robbery on you is good news). */
  mine?: ReadonlySet<number>;
  /** An optional button for an item (for example "Rob back"). */
  action?: (item: FeedItem) => React.ReactNode;
  className?: string;
}) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const rows = groupFeed(items).slice(0, max);
  if (!rows.length)
    return (
      <p
        className={cn(
          'rounded-[8px] border-2 border-dashed border-ink-faint p-4 text-[14px] text-ink-soft',
          className,
        )}
      >
        {empty}
      </p>
    );
  return (
    <ol className={cn('divide-y-2 divide-dashed divide-ink-faint', className)}>
      {rows.map(({ item, crew }) => {
        const line = describe(item.event, item.id, crew);
        const e = item.event;
        const who = e.chogId;
        const againstMe = (e.type === 'rob' || e.type === 'arrest') && !!mine?.has(e.target);
        const tone = againstMe ? (e.success ? 'bad' : 'good') : line.tone;
        return (
          <li key={item.id} className="flex items-start gap-3 py-2.5">
            <ChogPortrait id={who} name={nameOf(who)} size="xs" />
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  'text-[14px] leading-snug',
                  tone === 'bad' && 'text-jail',
                  againstMe && tone === 'good' && 'text-cash',
                )}
              >
                {line.text}
              </p>
              {action?.(item)}
            </div>
            <time className="shrink-0 pt-0.5 font-mono text-[11px] text-ink-soft" suppressHydrationWarning>
              {now ? ago(item.at, now) : ''}
            </time>
          </li>
        );
      })}
    </ol>
  );
}
