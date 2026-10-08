'use client';
import { Question, SignOut } from '@phosphor-icons/react';
import { DISTRICTS, type DistrictId, type GangId } from '@chog-city/data';
import type { Crew, MoveInput, Scores } from '@chog-city/game';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MapPing } from '@/components/city-map';
import { SiteHeader } from '@/components/site-header';
import { Button } from '@/components/ui/button';
import { Label, Panel } from '@/components/ui/panel';
import { api, errorText, type Board, type FeedItem, type GangRow, type MeChog } from '@/lib/api';
import { useLive } from '@/lib/live';
import type { Offer } from '@/lib/play';
import { logOut } from '@/lib/wallet';
import { ChogBar } from './chog-bar';
import { ChogTab } from './chog-tab';
import { CityTab } from './city-tab';
import { ConnectPanel } from './connect-panel';
import { CrewsTab } from './crews-tab';
import { HowToPlay } from './how-to-play';
import { JobBoard } from './job-board';
import { MyChogs } from './my-chogs';
import { ResultSheet } from './result-sheet';
import { SetupChog } from './setup-chog';
import { TabBar, type Tab } from './tab-bar';

type Me = { address: string | null; chogs: MeChog[] };
const SELECTED_KEY = 'chogcity.selected';
const SEEN_KEY = 'chogcity.inboxSeen';
const TABS: Tab[] = ['jobs', 'crews', 'city', 'chog'];

const store = {
  get(k: string): string | null {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {}
  },
};

export function PlayApp() {
  const [me, setMe] = useState<Me | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [tab, setTabState] = useState<Tab>('jobs');
  const [district, setDistrict] = useState<DistrictId | 'all'>('all');
  const [crews, setCrews] = useState<{ open: Crew[]; mine: Crew[] }>({ open: [], mine: [] });
  const [inbox, setInbox] = useState<FeedItem[]>([]);
  const [seen, setSeen] = useState(0);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [turf, setTurf] = useState<{ scores: Scores; holders: Partial<Record<DistrictId, GangId>> }>({
    scores: {},
    holders: {},
  });
  const [gangs, setGangs] = useState<GangRow[] | null>(null);
  const [pings, setPings] = useState<MapPing[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<{ items: FeedItem[]; chogId: number } | null>(null);
  const [help, setHelp] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const mineRef = useRef<Set<number>>(new Set());

  const loadSideRef = useRef<() => void>(() => {});
  const setTab = useCallback((t: Tab) => {
    setTabState(t);
    window.history.replaceState(null, '', t === 'jobs' ? '/play' : `/play?tab=${t}`);
    window.scrollTo({ top: 0 });
    if (t === 'city' || t === 'chog') loadSideRef.current();
  }, []);

  const loadSide = useCallback(async () => {
    const [c, i, f, t, g] = await Promise.allSettled([
      api.crews(),
      api.inbox(),
      api.feed(),
      api.turf(),
      api.gangs(),
    ]);
    if (c.status === 'fulfilled') setCrews(c.value);
    if (i.status === 'fulfilled') setInbox(i.value.items);
    if (f.status === 'fulfilled') setFeed(f.value.events);
    if (t.status === 'fulfilled') setTurf({ scores: t.value.scores, holders: t.value.holders });
    if (g.status === 'fulfilled') setGangs(g.value.gangs);
  }, []);

  loadSideRef.current = loadSide;

  const load = useCallback(async () => {
    try {
      const [m, b] = await Promise.all([api.me(), api.board()]);
      setMe(m);
      setBoard(b);
      setNow(Date.now());
      setLoadError(false);
      mineRef.current = new Set(m.chogs.map((c) => c.id));
      setSelected((cur) => {
        if (cur && m.chogs.some((c) => c.id === cur)) return cur;
        const saved = Number(store.get(SELECTED_KEY)) || null;
        return (
          m.chogs.find((c) => c.id === saved)?.id ??
          m.chogs.find((c) => c.active)?.id ??
          m.chogs[0]?.id ??
          null
        );
      });
      loadSide();
    } catch {
      setLoadError(true);
    }
  }, [loadSide]);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab') as Tab | null;
    if (t && TABS.includes(t)) setTabState(t);
    setSeen(Number(store.get(SEEN_KEY)) || 0);
    load();
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    const onVis = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(tick);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [load]);

  // Reload when the day turns over (new board, new turf).
  useEffect(() => {
    if (!board) return;
    const t = setTimeout(() => load(), Math.max(1000, board.nextReset - Date.now() + 2000));
    return () => clearTimeout(t);
  }, [board, load]);

  // Opening "My Chog" marks the news as read.
  useEffect(() => {
    if (tab !== 'chog' || !inbox[0]) return;
    setSeen(inbox[0].id);
    store.set(SEEN_KEY, String(inbox[0].id));
  }, [tab, inbox]);

  // The live feed: new events from anyone in the city.
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useLive((items, crewId) => {
    if (items.length) {
      setFeed((f) => [...items.filter((i) => !f.some((x) => x.id === i.id)).reverse(), ...f].slice(0, 200));
      const fresh = items.flatMap((i) =>
        i.event.type === 'job'
          ? [{ id: i.id, district: i.event.district, u: Math.random(), v: Math.random() }]
          : [],
      );
      if (fresh.length) {
        setPings((p) => [...p, ...fresh].slice(-30));
        setTimeout(() => setPings((p) => p.filter((x) => !fresh.some((f) => f.id === x.id))), 2600);
      }
    }
    const touchesMe = items.some(
      (i) =>
        mineRef.current.has(i.event.chogId) || ('target' in i.event && mineRef.current.has(i.event.target)),
    );
    // Batch refreshes: many events can arrive at once.
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      if (touchesMe) {
        api
          .me()
          .then((m) => setMe(m))
          .catch(() => {});
        api
          .inbox()
          .then((r) => setInbox(r.items))
          .catch(() => {});
      }
      if (crewId || touchesMe)
        api
          .crews()
          .then(setCrews)
          .catch(() => {});
      api
        .turf()
        .then((t) => setTurf({ scores: t.scores, holders: t.holders }))
        .catch(() => {});
    }, 600);
  });

  function select(id: number) {
    setSelected(id);
    store.set(SELECTED_KEY, String(id));
  }

  function mergeChogs(chogs: { id: number }[]) {
    setMe((m) =>
      m ? { ...m, chogs: m.chogs.map((c) => ({ ...c, ...(chogs.find((x) => x.id === c.id) ?? {}) })) } : m,
    );
  }

  async function move(input: MoveInput, busyKey: string) {
    setBusy(busyKey);
    setNotice(null);
    const r = await api.move(input);
    setBusy(null);
    if (!r.ok) {
      setNotice(errorText(r.error));
      if (r.error === 'NOT_LOGGED_IN') load();
      if (r.error === 'SLOT_TAKEN' || r.error === 'CREW_NOT_OPEN')
        api
          .crews()
          .then(setCrews)
          .catch(() => {});
      return null;
    }
    mergeChogs(r.chogs);
    // Turf, gangs, the feed and the news all change after a move; don't wait for the live feed.
    loadSide();
    return r;
  }

  const showResult = (items: FeedItem[], chogId: number) => items.length && setResult({ items, chogId });

  async function doJob(chogId: number, offer: Offer) {
    const r = await move({ action: 'job', chogId, offerKey: offer.key }, offer.key);
    if (r) showResult(r.events, chogId);
  }

  async function startCrew(chogId: number, offer: Offer, slot: number, jailbreakTarget?: number) {
    const r = await move(
      {
        action: 'crew.open',
        chogId,
        offerKey: offer.key,
        slot,
        ...(jailbreakTarget ? { jailbreakTarget } : {}),
      },
      `start:${offer.key}`,
    );
    if (!r) return;
    await api
      .crews()
      .then(setCrews)
      .catch(() => {});
    setTab('crews');
    setNotice('Crew started. Share the invite link, or find players with the skills you still need.');
  }

  async function joinCrew(chogId: number, crew: Crew, slot: number) {
    const r = await move({ action: 'crew.join', chogId, crewId: crew.id, slot }, `join:${crew.id}`);
    if (!r) return;
    await api
      .crews()
      .then(setCrews)
      .catch(() => {});
    if (r.events.length) showResult(r.events, chogId);
    else
      setNotice(
        `Joined. The job runs when the last ${crew.slots.filter((x) => x === null).length - 1 === 1 ? 'slot fills' : 'slots fill'}.`,
      );
  }

  async function leaveCrew(chogId: number, crew: Crew) {
    const r = await move({ action: 'crew.leave', chogId, crewId: crew.id }, `leave:${crew.id}`);
    if (!r) return;
    await api
      .crews()
      .then(setCrews)
      .catch(() => {});
    setNotice(
      crew.leaderId === chogId
        ? 'Crew cancelled. Everyone got their move back.'
        : 'You left the crew and got your move back.',
    );
  }

  async function act(chogId: number, action: 'rob' | 'arrest' | 'bail', target: number) {
    const r = await move({ action, chogId, target }, `${action}:${target}`);
    if (!r) return;
    if (action === 'bail') {
      setNotice(target === chogId ? 'Bail paid. Your Chog is out.' : 'Bail paid. That Chog is out.');
      api
        .inbox()
        .then((x) => setInbox(x.items))
        .catch(() => {});
    } else showResult(r.events, chogId);
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
  let bar: React.ReactNode = null;
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
    const unread = inbox.filter((i) => i.id > seen).length;
    const closed = (d: DistrictId) => !board.offers.some((o) => o.district === d);
    if (chog.gang)
      bar = (
        <TabBar tab={tab} onTab={setTab} chog={chog} badges={{ chog: unread, crews: chog.crewId ? 1 : 0 }} />
      );
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
          <SetupChog
            key={chog.id}
            chog={chog}
            busy={busy === 'gang'}
            onPickGang={(g) => move({ action: 'gang', chogId: chog.id, gang: g }, 'gang')}
          />
        ) : (
          <>
            <ChogBar chog={chog} nextReset={board.nextReset} />
            <div className="hidden sm:block">{bar}</div>
            {tab === 'jobs' && (
              <>
                {chog.stats.jobsWon + chog.stats.jobsLost === 0 && (
                  <p className="rounded-[8px] border-2 border-ink bg-pink/25 p-3 text-[14px] font-semibold">
                    Step 3 of 3 · Pick a job below and tap &ldquo;Do it&rdquo;. The result shows right away.
                  </p>
                )}
                {district !== 'all' && (
                  <p className="text-[13px] text-ink-soft">
                    Showing jobs in {DISTRICTS[district].name}.{' '}
                    <button
                      className="font-semibold underline underline-offset-4"
                      onClick={() => setDistrict('all')}
                    >
                      Show all
                    </button>
                  </p>
                )}
                <JobBoard
                  chog={chog}
                  board={board}
                  crews={crews.open}
                  now={now}
                  busyKey={busy}
                  district={district}
                  onDistrict={setDistrict}
                  onDo={(o) => doJob(chog.id, o)}
                  onStartCrew={(o, slot, jb) => startCrew(chog.id, o, slot, jb)}
                  onJoin={(c, slot) => joinCrew(chog.id, c, slot)}
                />
              </>
            )}
            {tab === 'crews' && (
              <CrewsTab
                chog={chog}
                board={board}
                crews={crews}
                busy={busy}
                onJoin={(c, slot) => joinCrew(chog.id, c, slot)}
                onLeave={(c) => leaveCrew(chog.id, c)}
                onGoJobs={() => setTab('jobs')}
              />
            )}
            {tab === 'city' && (
              <CityTab
                holders={turf.holders}
                scores={turf.scores}
                nextReset={board.nextReset}
                closed={closed}
                myGang={chog.gang}
                gangs={gangs}
                feed={feed}
                mine={mineRef.current}
                pings={pings}
                onSeeJobs={(d) => {
                  setDistrict(d);
                  setTab('jobs');
                }}
              />
            )}
            {tab === 'chog' && (
              <ChogTab
                chog={chog}
                inbox={inbox}
                mine={mineRef.current}
                busy={busy}
                onRob={(t) => act(chog.id, 'rob', t)}
                onArrest={(t) => act(chog.id, 'arrest', t)}
                onBail={(t) => act(chog.id, 'bail', t)}
              />
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-[1180px] px-4 pb-28 sm:px-6 sm:pb-16">
      {header}
      <div className="pt-6">{body}</div>
      <div className="sm:hidden">{bar}</div>
      {notice && (
        <div
          role="alert"
          className="fixed inset-x-4 bottom-20 z-30 mx-auto max-w-[460px] rounded-[8px] border-2 border-ink bg-ink p-3.5 text-[14px] font-semibold text-paper-raised shadow-[3px_3px_0_0_var(--color-pink)] sm:bottom-6"
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
