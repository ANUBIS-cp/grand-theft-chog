'use client';
import { Question, SignOut } from '@phosphor-icons/react';
import type { GangId } from '@chog-city/data';
import type { MoveInput } from '@chog-city/game';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { SiteHeader } from '@/components/site-header';
import { Button } from '@/components/ui/button';
import { Label, Panel } from '@/components/ui/panel';
import { api, errorText, type Board, type FeedItem, type MeChog } from '@/lib/api';
import type { Offer } from '@/lib/play';
import { logOut } from '@/lib/wallet';
import { ChogBar } from './chog-bar';
import { ConnectPanel } from './connect-panel';
import { HowToPlay } from './how-to-play';
import { JobBoard } from './job-board';
import { MyChogs } from './my-chogs';
import { ResultSheet } from './result-sheet';
import { SetupChog } from './setup-chog';

type Me = { address: string | null; chogs: MeChog[] };
const SELECTED_KEY = 'chogcity.selected';

export function PlayApp() {
  const [me, setMe] = useState<Me | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<{ items: FeedItem[]; chogId: number } | null>(null);
  const [help, setHelp] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    try {
      const [m, b] = await Promise.all([api.me(), api.board()]);
      setMe(m);
      setBoard(b);
      setNow(Date.now());
      setLoadError(false);
      setSelected((cur) => {
        if (cur && m.chogs.some((c) => c.id === cur)) return cur;
        let saved: number | null = null;
        try {
          saved = Number(localStorage.getItem(SELECTED_KEY)) || null;
        } catch {}
        return (
          m.chogs.find((c) => c.id === saved)?.id ??
          m.chogs.find((c) => c.active)?.id ??
          m.chogs[0]?.id ??
          null
        );
      });
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => setNow(Date.now()), 30_000);
    // The board changes at the daily reset; refresh when the tab comes back.
    const onVis = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [load]);

  useEffect(() => {
    if (!board) return;
    const t = setTimeout(() => load(), Math.max(1000, board.nextReset - Date.now() + 2000));
    return () => clearTimeout(t);
  }, [board, load]);

  function select(id: number) {
    setSelected(id);
    try {
      localStorage.setItem(SELECTED_KEY, String(id));
    } catch {}
  }

  async function move(input: MoveInput, busyKey: string) {
    setBusy(busyKey);
    setNotice(null);
    const r = await api.move(input);
    setBusy(null);
    if (!r.ok) {
      setNotice(errorText(r.error));
      if (r.error === 'NOT_LOGGED_IN') load();
      return null;
    }
    setMe((m) =>
      m ? { ...m, chogs: m.chogs.map((c) => ({ ...c, ...(r.chogs.find((x) => x.id === c.id) ?? {}) })) } : m,
    );
    return r;
  }

  async function doJob(chogId: number, offer: Offer) {
    const r = await move({ action: 'job', chogId, offerKey: offer.key }, offer.key);
    if (r) setResult({ items: r.events, chogId });
  }

  async function pickGang(chogId: number, gang: GangId) {
    await move({ action: 'gang', chogId, gang }, 'gang');
  }

  const header = (
    <SiteHeader
      right={
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setHelp(true)}
            aria-label="How to play"
            className="whitespace-nowrap !px-2.5"
          >
            <Question size={18} weight="bold" className="sm:hidden" />
            <span className="hidden sm:inline">How to play</span>
          </Button>
          {me?.address && (
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                await logOut();
                setMe({ address: null, chogs: [] });
              }}
              aria-label="Log out"
            >
              <span className="whitespace-nowrap font-mono text-[12px]">
                {me.address.slice(0, 4)}…{me.address.slice(-4)}
              </span>
              <SignOut size={16} weight="bold" />
            </Button>
          )}
        </>
      }
    />
  );

  let body: React.ReactNode;
  if (loadError)
    body = (
      <Panel className="mx-auto max-w-[460px] p-5">
        <p className="font-semibold">Chog City didn&apos;t load.</p>
        <p className="mt-1 text-[14px] text-ink-soft">Check your connection and try again.</p>
        <Button className="mt-4" size="sm" onClick={load}>
          Try again
        </Button>
      </Panel>
    );
  else if (!me || !board)
    body = (
      <div className="space-y-4" aria-busy="true" aria-label="Loading">
        <div className="h-28 animate-pulse rounded-[8px] bg-ink-faint" />
        <div className="h-64 animate-pulse rounded-[8px] bg-ink-faint" />
      </div>
    );
  else if (!me.address) body = <ConnectPanel onLoggedIn={load} />;
  else if (me.chogs.length === 0)
    body = (
      <Panel className="mx-auto max-w-[460px] p-5 sm:p-6">
        <Label>Logged in</Label>
        <h1 className="mt-2 font-display text-[40px] uppercase leading-[0.9]">No Chogs in this wallet</h1>
        <p className="mt-3 text-[15px] leading-snug text-ink-soft">
          Chog City is played with Chog NFTs. Log in with the wallet that holds yours, or get one on OpenSea.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <a
            href="https://opensea.io/collection/chog-genesis"
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 items-center rounded-[6px] border-2 border-ink bg-pink px-4 font-semibold shadow-hard"
          >
            Chogs on OpenSea
          </a>
          <Button
            variant="secondary"
            onClick={async () => {
              await logOut();
              setMe({ address: null, chogs: [] });
            }}
          >
            Use another wallet
          </Button>
        </div>
      </Panel>
    );
  else {
    const chog = me.chogs.find((c) => c.id === selected) ?? me.chogs[0]!;
    const firstTime = !me.chogs.some((c) => c.active);
    body = (
      <div className="space-y-5">
        {firstTime && !chog.gang && (
          <Label>
            Step 2 of 3
            {me.chogs.length > 1
              ? ` · You have ${me.chogs.length} Chogs. Tap one to look at it, then pick its gang.`
              : ''}
          </Label>
        )}
        <MyChogs chogs={me.chogs} selected={chog.id} onSelect={select} />
        {!chog.gang ? (
          <>
            <SetupChog
              key={chog.id}
              chog={chog}
              busy={busy === 'gang'}
              onPickGang={(g) => pickGang(chog.id, g)}
            />
          </>
        ) : (
          <>
            <ChogBar chog={chog} nextReset={board.nextReset} />
            {!chog.active || chog.stats.jobsWon + chog.stats.jobsLost === 0 ? (
              <p className="rounded-[8px] border-2 border-ink bg-pink/25 p-3 text-[14px] font-semibold">
                Step 3 of 3 · Pick a job below and tap &ldquo;Do it&rdquo;. The result shows right away.
              </p>
            ) : null}
            <JobBoard chog={chog} board={board} now={now} busyKey={busy} onDo={(o) => doJob(chog.id, o)} />
            <p className="text-center text-[13px] text-ink-soft">
              <Link href={`/chog/${chog.id}`} className="underline underline-offset-4">
                See {chog.name}&apos;s public page and record
              </Link>
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-[1180px] px-4 pb-24 sm:px-6">
      {header}
      <div className="pt-6">{body}</div>
      {notice && (
        <div
          role="alert"
          className="fixed inset-x-4 bottom-4 z-30 mx-auto max-w-[460px] rounded-[8px] border-2 border-ink bg-ink p-3.5 text-[14px] font-semibold text-paper-raised shadow-[3px_3px_0_0_var(--color-pink)]"
        >
          {notice}
          <button className="ml-3 underline" onClick={() => setNotice(null)}>
            OK
          </button>
        </div>
      )}
      <ResultSheet
        items={result?.items ?? null}
        chogId={result?.chogId ?? 0}
        onClose={() => setResult(null)}
      />
      <HowToPlay open={help} onOpenChange={setHelp} />
    </main>
  );
}
