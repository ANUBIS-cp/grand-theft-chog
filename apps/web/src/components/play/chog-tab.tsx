'use client';
import { getChog } from '@chog-city/data';
import {
  ARREST,
  BAIL_CASH_PER_HOUR,
  HOUR,
  ROB,
  arrestOdds,
  bailCost,
  infoOf,
  robOdds,
} from '@chog-city/game';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ChogPortrait } from '@/components/chog-portrait';
import { Countdown } from '@/components/countdown';
import { FeedList } from '@/components/feed-list';
import { GangTag } from '@/components/gang-tag';
import { Stars } from '@/components/stars';
import { Button } from '@/components/ui/button';
import { Label, Panel } from '@/components/ui/panel';
import { api, type FeedItem, type TargetRow } from '@/lib/api';
import { nameOf } from '@/lib/describe';
import type { ChogView } from '@/lib/views';

type Kind = 'rob' | 'arrest' | 'jailed';

function TargetList({ rows, cta }: { rows: TargetRow[] | null; cta: (t: TargetRow) => React.ReactNode }) {
  if (rows === null) return <div className="h-24 animate-pulse rounded-[8px] bg-ink-faint" />;
  if (!rows.length) return <p className="text-[14px] text-ink-soft">Nobody right now. Check back later.</p>;
  return (
    <ul className="divide-y-2 divide-dashed divide-ink-faint">
      {rows.map((t) => (
        <li key={t.id} className="flex items-center gap-3 py-2.5">
          <ChogPortrait id={t.id} name={nameOf(t.id)} size="xs" jailed={!!t.jailUntil} />
          <div className="min-w-0 flex-1">
            <Link
              href={`/chog/${t.id}`}
              className="text-[14px] font-semibold underline-offset-4 hover:underline"
            >
              {nameOf(t.id)}
            </Link>
            <p className="flex flex-wrap items-center gap-x-2 text-[12px] text-ink-soft">
              <span className="font-semibold text-cash">{t.cash} cash</span>
              {t.gang && <GangTag gang={t.gang} size="sm" tilt={false} className="!text-[11px]" />}
              {t.wanted > 0 && <Stars n={t.wanted} size={11} />}
              {!t.active && <span>owner hasn&apos;t played</span>}
            </p>
          </div>
          {cta(t)}
        </li>
      ))}
    </ul>
  );
}

export function ChogTab({
  chog,
  inbox,
  mine,
  busy,
  onRob,
  onArrest,
  onBail,
}: {
  chog: ChogView;
  inbox: FeedItem[];
  mine: ReadonlySet<number>;
  busy: string | null;
  onRob: (target: number) => void;
  onArrest: (target: number) => void;
  onBail: (target: number) => void;
}) {
  const [lists, setLists] = useState<Record<Kind, TargetRow[] | null>>({
    rob: null,
    arrest: null,
    jailed: null,
  });
  const info = infoOf(getChog(chog.id)!);
  const guard = info.wildcard || info.skills.includes('guard');
  const now = Date.now();

  const load = (k: Kind) =>
    api
      .targets(k)
      .then((r) => setLists((l) => ({ ...l, [k]: r.targets })))
      .catch(() => setLists((l) => ({ ...l, [k]: [] })));
  useEffect(() => {
    load('rob');
    load('jailed');
    if (guard) load('arrest');
  }, [chog.id, guard]);

  const blocked = chog.jailUntil ? 'In jail' : chog.movesLeft <= 0 ? 'No moves' : null;
  const cost = chog.jailUntil ? bailCost(chog.raw, now) : 0;

  return (
    <div className="space-y-8">
      {chog.jailUntil > 0 && (
        <Panel className="border-jail p-5">
          <Label className="text-jail">In jail</Label>
          <p className="mt-2 font-display text-[34px] uppercase leading-none">
            Out in <Countdown to={chog.jailUntil} />
          </p>
          <p className="mt-2 text-[14px] text-ink-soft">
            A jailed Chog can&apos;t make moves. Three ways out:
          </p>
          <ol className="mt-3 space-y-3 text-[14px]">
            <li>
              <strong>Pay bail:</strong> {cost} cash ({BAIL_CASH_PER_HOUR} for every hour left).
              <Button
                className="ml-0 mt-2 block"
                size="sm"
                disabled={chog.cash < cost}
                loading={busy === `bail:${chog.id}`}
                onClick={() => onBail(chog.id)}
              >
                {chog.cash < cost ? `Not enough cash (${chog.cash})` : `Pay ${cost} cash`}
              </Button>
            </li>
            <li>
              <strong>Ask a friend:</strong> anyone can pay your bail from their own Chog, or start a
              Jailbreak crew job for you.
            </li>
            <li>
              <strong>Wait it out.</strong> Going to jail already cleared your Wanted stars.
            </li>
          </ol>
        </Panel>
      )}

      {chog.revenge.length > 0 && (
        <section aria-labelledby="revenge-title">
          <h2 id="revenge-title" className="font-display text-[30px] uppercase leading-none">
            Revenge
          </h2>
          <p className="mt-1.5 text-[14px] text-ink-soft">
            These Chogs robbed you. One rob back each is free (no move) and gets +10%.
          </p>
          <ul className="mt-3 space-y-2">
            {chog.revenge.map((r) => {
              const odds = robOdds(info, infoOf(getChog(r.against)!), true).odds;
              return (
                <li
                  key={r.against}
                  className="flex items-center gap-3 rounded-[8px] border-2 border-ink bg-paper-raised p-2.5"
                >
                  <ChogPortrait id={r.against} name={nameOf(r.against)} size="xs" />
                  <span className="min-w-0 flex-1 text-[14px] font-semibold">
                    {nameOf(r.against)}
                    <span className="block text-[12px] font-normal text-ink-soft">
                      Free shot ends in <Countdown to={r.until} />
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={!!chog.jailUntil}
                    loading={busy === `rob:${r.against}`}
                    onClick={() => onRob(r.against)}
                  >
                    Rob back · {odds}%
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-labelledby="rob-title">
        <h2 id="rob-title" className="font-display text-[30px] uppercase leading-none">
          Rob a Chog
        </h2>
        <p className="mt-1.5 text-[14px] text-ink-soft">
          Win: take {ROB.lootShare * 100}% of their cash (up to {ROB.lootMax}). Lose: +{ROB.wantedOnFail}{' '}
          Wanted stars and a {ROB.jailChanceOnFail}% chance of jail. Muscle, Blade and Stealth help you; their
          Muscle, Guard and Blade help them. Uses 1 move.
        </p>
        <div className="mt-3">
          <TargetList
            rows={lists.rob}
            cta={(t) => {
              const odds = robOdds(info, infoOf(getChog(t.id)!), false).odds;
              return (
                <Button
                  size="sm"
                  variant="danger"
                  disabled={!!blocked}
                  loading={busy === `rob:${t.id}`}
                  onClick={() => onRob(t.id)}
                >
                  {blocked ?? `Rob · ${odds}%`}
                </Button>
              );
            }}
          />
        </div>
      </section>

      {guard && (
        <section aria-labelledby="arrest-title">
          <h2 id="arrest-title" className="font-display text-[30px] uppercase leading-none">
            Arrest
          </h2>
          <p className="mt-1.5 text-[14px] text-ink-soft">
            {chog.name} has the Guard skill. Arrest Chogs with 3 or more Wanted stars for a bounty of{' '}
            {ARREST.bountyPerStar} cash per star. Uses 1 move.
          </p>
          <div className="mt-3">
            <TargetList
              rows={lists.arrest}
              cta={(t) => (
                <Button
                  size="sm"
                  disabled={!!blocked}
                  loading={busy === `arrest:${t.id}`}
                  onClick={() => onArrest(t.id)}
                >
                  {blocked ?? `Arrest · ${arrestOdds(chog.raw).odds}%`}
                </Button>
              )}
            />
          </div>
        </section>
      )}

      <section aria-labelledby="jail-title">
        <h2 id="jail-title" className="font-display text-[30px] uppercase leading-none">
          In jail now
        </h2>
        <p className="mt-1.5 text-[14px] text-ink-soft">
          Pay a Chog&apos;s bail from {chog.name}&apos;s cash. Free move: it doesn&apos;t use one.
        </p>
        <div className="mt-3">
          <TargetList
            rows={lists.jailed?.filter((t) => t.id !== chog.id) ?? null}
            cta={(t) => {
              const c = Math.ceil(Math.max(0, t.jailUntil - now) / HOUR) * BAIL_CASH_PER_HOUR;
              return (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={chog.cash < c}
                  loading={busy === `bail:${t.id}`}
                  onClick={() => onBail(t.id)}
                >
                  Bail · {c}
                </Button>
              );
            }}
          />
        </div>
      </section>

      <section aria-labelledby="news-title">
        <h2 id="news-title" className="font-display text-[30px] uppercase leading-none">
          What happened to your Chogs
        </h2>
        <FeedList
          items={inbox}
          mine={mine}
          empty="Nothing yet. If someone robs, arrests or bails out one of your Chogs, it shows up here."
          className="mt-3"
        />
      </section>

      <p className="text-center text-[13px] text-ink-soft">
        <Link href={`/chog/${chog.id}`} className="underline underline-offset-4">
          {chog.name}&apos;s public page and full record
        </Link>
      </p>
    </div>
  );
}
