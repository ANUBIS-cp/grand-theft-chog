'use client';
import { GANGS, type GangId } from '@chog-city/data';
import type { Place } from '@chog-city/game/city';
import { FIRST_VAULT, POWERS, vaultDef, type PowerId } from '@chog-city/game/heist';
import {
  ArrowBendUpLeft,
  ArrowSquareOut,
  CurrencyDollarSimple,
  HandWaving,
  Lock,
  ShieldCheck,
  SignOut,
  SmileyAngry,
  SmileyWink,
  Trophy,
  Vault,
  X,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ConnectPanel } from '@/components/connect-panel';
import { HeistGame, type RealResult } from '@/components/heist/heist-game';
import { SkillIcon } from '@/components/skill-icons';
import { cn } from '@/lib/cn';
import { chogImage } from '@/lib/images';
import { useLive } from '@/lib/live';
import { GANG_COLOR } from '@/lib/theme';
import { ago, formatLeft } from '@/lib/time';
import { logOut } from '@/lib/wallet';
import type { Emote, PlaceLook } from './city-render';
import { CityView, type CityHandle, type Jailed, type Stroller, type Tapped } from './city-view';
import type { LiveStatus } from './live-city';

interface VaultRow {
  gang: GangId;
  cash: number;
  tier: number;
  vault: string;
  members: number;
  guards: number[];
}
interface Hit {
  id: string;
  chogId: number;
  gang: GangId;
  target: GangId;
  result: 'escaped' | 'busted';
  moved: number;
  caughtBy: number | null;
  revenge: boolean;
  at: number;
}
interface MyChog {
  id: number;
  name: string;
  gang: GangId | null;
  gangChoices: GangId[];
  jailedUntil: number | null;
  hitToday: GangId[];
  powers: PowerId[];
  record: { stolen: number; escapes: number; busts: number; catches: number; best: number };
}
interface Run {
  id: string;
  vault: string;
  tier: number;
  target: GangId;
  revenge: boolean;
  powers: PowerId[];
  guards: { id: number; name: string }[];
}
interface CityData {
  strollers: Stroller[];
  jailed: Jailed[];
  practice: { id: number; name: string; powers: PowerId[] };
}

const POWER_ICON: Record<PowerId, Parameters<typeof SkillIcon>[0]['skill']> = {
  hide: 'stealth',
  zap: 'laser',
  sprint: 'runner',
  distract: 'clown',
  hack: 'tech',
  tackle: 'muscle',
  bribe: 'smooth',
  magnet: 'money',
  blink: 'magic',
  scare: 'undead',
  lockpick: 'jailbird',
};

const START_ERRORS: Record<string, string> = {
  jailed: 'This Chog is in jail.',
  'done-today': 'This Chog already hit that vault today.',
  'own-gang': 'That’s your own gang’s vault.',
  'no-gang': 'Pick a gang first.',
  'not-yours': 'That Chog isn’t in your wallet any more.',
  'slow-down': 'Too fast. Wait a few seconds.',
};

const DEFENCE = ['No guards on the roof', 'Light', 'Strong', 'Maximum'];
const money = (n: number) => `$${n.toLocaleString('en-US')}`;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const GUEST = { color: '#8d89a6', ink: '#111111' };

async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const d = (await r.json().catch(() => ({}))) as T & { ok?: boolean; error?: string };
  if (!r.ok || d.ok === false)
    throw new Error(START_ERRORS[d.error ?? ''] ?? 'Something went wrong. Try again.');
  return d;
}

const btn =
  'inline-flex h-12 items-center justify-center gap-2 rounded-[8px] border-2 border-ink px-4 font-display text-[20px] uppercase leading-none shadow-[3px_3px_0_0_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-50';

export function CityApp() {
  const [board, setBoard] = useState<{ board: VaultRow[]; hits: Hit[]; resetAt: number } | null>(null);
  const [me, setMe] = useState<{
    address: string | null;
    chogs: MyChog[];
    revenge: Record<string, GangId[]>;
  } | null>(null);
  const [city, setCity] = useState<CityData | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [practice, setPractice] = useState(false);
  const [door, setDoor] = useState<Place | null>(null);
  const [sheet, setSheet] = useState<'gangs' | 'me' | 'connect' | null>(null);
  const [peek, setPeek] = useState<Tapped | null>(null);
  const [live, setLive] = useState<{ status: LiveStatus; online: number }>({
    status: 'connecting',
    online: 0,
  });
  const [welcome, setWelcome] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const view = useRef<CityHandle>(null);

  const loadBoard = useCallback(async () => {
    const r = await fetch('/api/war', { cache: 'no-store' });
    if (r.ok) setBoard(await r.json());
  }, []);
  const loadMe = useCallback(async () => {
    const r = await fetch('/api/war/me', { cache: 'no-store' });
    if (r.ok) setMe(await r.json());
  }, []);
  const loadCity = useCallback(async () => {
    const r = await fetch('/api/city', { cache: 'no-store' });
    if (r.ok) setCity(await r.json());
  }, []);

  useEffect(() => {
    void loadBoard();
    void loadMe();
    void loadCity();
    try {
      setWelcome(localStorage.getItem('city-welcome') !== '1');
    } catch {
      setWelcome(true);
    }
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [loadBoard, loadMe, loadCity]);
  useLive(() => {
    void loadBoard();
    void loadCity();
  });

  const chogs = me?.chogs ?? [];
  const chog = chogs.find((c) => c.id === picked) ?? chogs[0] ?? null;
  const revenge = chog?.gang ? (me?.revenge[chog.gang] ?? []) : [];
  const jailedNow = !!chog?.jailedUntil && chog.jailedUntil > now;

  const looks = useMemo(() => {
    const out: Record<string, PlaceLook> = {};
    (board?.board ?? []).forEach((v, i) => {
      out[v.gang] = {
        name: GANGS[v.gang].name,
        color: GANG_COLOR[v.gang].bg,
        ink: GANG_COLOR[v.gang].fg,
        tier: v.tier,
        cash: v.cash,
        rank: i + 1,
        alarm: false,
        mine: chog?.gang === v.gang,
      };
    });
    return out;
  }, [board, chog?.gang]);
  const screen = useMemo(
    () => ({
      lines: (board?.board ?? [])
        .slice(0, 3)
        .map((v) => ({ name: GANGS[v.gang].name, cash: v.cash, color: GANG_COLOR[v.gang].bg })),
    }),
    [board],
  );
  const meLook = useMemo(
    () =>
      chog
        ? {
            chog: chog.id,
            jail: chog.jailedUntil,
            name: chog.name,
            color: chog.gang ? GANG_COLOR[chog.gang].bg : GUEST.color,
            ink: chog.gang ? GANG_COLOR[chog.gang].fg : GUEST.ink,
          }
        : { chog: null, name: 'Guest', jail: null, ...GUEST },
    [chog],
  );

  function closeWelcome() {
    setWelcome(false);
    try {
      localStorage.setItem('city-welcome', '1');
    } catch {}
  }

  async function pickGang(gang: GangId) {
    if (!chog) return;
    setBusy('gang');
    setNotice(null);
    try {
      await post('/api/war/gang', { chogId: chog.id, gang });
      await Promise.all([loadMe(), loadBoard()]);
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function rob(target: GangId) {
    if (!chog) return;
    setBusy(target);
    setNotice(null);
    try {
      const d = await post<{ run: Run }>('/api/heist/start', { chogId: chog.id, target });
      setRun(d.run);
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const backTo = (place: string) => {
    setRun(null);
    setPractice(false);
    // The city remounts after the heist; put your Chog back at the door it went in by.
    requestAnimationFrame(() => view.current?.appearAt(place));
  };

  if (run && chog) {
    const def = vaultDef(run.vault)!;
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-[#0b0918]">
        <HeistGame
          key={run.id}
          vault={def}
          tier={run.tier}
          player={{
            id: chog.id,
            name: chog.name,
            gang: chog.gang ? GANGS[chog.gang].name : null,
            powers: run.powers,
          }}
          guards={run.guards}
          owner={{
            name: GANGS[run.target].name,
            color: GANG_COLOR[run.target].bg,
            ink: GANG_COLOR[run.target].fg,
          }}
          real={{
            myGang: chog.gang ? GANGS[chog.gang].name : 'your gang',
            finish: async (inputs) =>
              (await post<{ result: RealResult }>('/api/heist/finish', { runId: run.id, inputs })).result,
            onLeave: () => {
              backTo(run.target);
              void loadMe();
              void loadBoard();
              void loadCity();
            },
          }}
        />
      </div>
    );
  }

  if (practice && city) {
    const player = chog ? { id: chog.id, name: chog.name, powers: chog.powers } : city.practice;
    const guards = city.strollers.slice(0, 3).map((s) => ({ id: s.id, name: s.name }));
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-[#0b0918]">
        <HeistGame
          vault={FIRST_VAULT}
          player={{ ...player, gang: chog?.gang ? GANGS[chog.gang].name : null }}
          guards={guards}
          owner={{ name: 'Practice vault', color: '#7cf0c4', ink: '#111111' }}
          onLeave={() => backTo('training')}
        />
      </div>
    );
  }

  const latest = board?.hits[0];
  const anyCard = !!(door || sheet || peek || (chog && !chog.gang) || (welcome && !me?.address));

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#07060d] text-white">
      <CityView
        ref={view}
        me={meLook}
        strollers={city?.strollers ?? []}
        jailed={city?.jailed ?? []}
        places={looks}
        board={screen}
        paused={!!sheet || !!peek || (!!chog && !chog.gang)}
        onDoor={setDoor}
        onPerson={setPeek}
        onLive={(status, online) =>
          setLive((l) => (l.status === status && l.online === online ? l : { status, online }))
        }
      />

      {/* Top bar */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 p-3">
        <div className="pointer-events-auto flex flex-col gap-2">
          <Link
            href="/"
            className="font-display text-[26px] uppercase leading-none text-white [text-shadow:2px_2px_0_#000]"
          >
            Chog City
          </Link>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-black/50 px-2 py-0.5 text-[12px] font-semibold text-white/85">
            <span
              className={cn(
                'h-2 w-2 rounded-full',
                live.status === 'live'
                  ? 'bg-[#3ddc84]'
                  : live.status === 'elsewhere'
                    ? 'bg-jail'
                    : 'bg-white/40',
              )}
            />
            {live.status === 'live'
              ? `${live.online} playing now`
              : live.status === 'elsewhere'
                ? 'Open in another window'
                : 'Connecting…'}
          </span>
        </div>
        {latest && (
          <button
            onClick={() => setSheet('gangs')}
            className="pointer-events-auto hidden max-w-[440px] items-center gap-2 truncate rounded-full border-2 border-ink bg-[#151229]/90 py-1 pl-1 pr-3 text-[13px] shadow-[2px_2px_0_0_#000] md:flex"
          >
            <img
              src={chogImage(latest.chogId, 96)}
              alt=""
              className="h-6 w-6 shrink-0 rounded-full border border-ink"
            />
            <span className="truncate">
              <HitLine h={latest} /> · <span className="text-white/50">{ago(latest.at, now)}</span>
            </span>
          </button>
        )}
        <div className="pointer-events-auto flex items-center gap-2">
          {me?.address ? (
            chog ? (
              <button
                onClick={() => setSheet('me')}
                className="flex items-center gap-2 rounded-full border-2 border-ink bg-[#151229] py-1 pl-1 pr-3 shadow-[2px_2px_0_0_#000]"
              >
                <img
                  src={chogImage(chog.id, 96)}
                  alt=""
                  className="h-8 w-8 rounded-full border-2 border-ink"
                />
                <span className="hidden font-display text-[16px] uppercase leading-none sm:inline">
                  {chog.name}
                </span>
                {jailedNow && <Lock size={14} weight="fill" className="text-jail" />}
              </button>
            ) : (
              <button
                onClick={() => setSheet('me')}
                className="rounded-full border-2 border-ink bg-[#151229] px-3 py-1.5 text-[13px] shadow-[2px_2px_0_0_#000]"
              >
                {short(me.address)}
              </button>
            )
          ) : (
            <button
              onClick={() => setSheet('connect')}
              className={cn(btn, 'h-10 bg-[#ffd666] px-3 text-[17px] text-ink')}
            >
              <span className="pt-0.5">Connect wallet</span>
            </button>
          )}
        </div>
      </header>

      {/* Bottom left: gangs and emotes */}
      {!anyCard && (
        <div className="absolute bottom-3 left-3 z-20 flex flex-col items-start gap-2">
          <Emotes onEmote={(k) => view.current?.emote(k)} />
          <button
            onClick={() => setSheet('gangs')}
            className={cn(btn, 'h-11 bg-[#ffd666] text-[18px] text-ink')}
          >
            <Trophy size={18} weight="fill" />
            <span className="pt-0.5">Gangs</span>
          </button>
        </div>
      )}

      {notice && (
        <div className="absolute inset-x-0 top-16 z-40 flex justify-center px-4">
          <button
            onClick={() => setNotice(null)}
            role="alert"
            className="rounded-[8px] border-2 border-ink bg-jail px-3 py-2 text-[14px] font-semibold shadow-[3px_3px_0_0_#000]"
          >
            {notice}
          </button>
        </div>
      )}

      {/* At a door */}
      {door && !sheet && !peek && (
        <Card onClose={() => setDoor(null)}>
          <DoorCard
            place={door}
            row={board?.board.find((v) => v.gang === door.gang)}
            rank={(board?.board.findIndex((v) => v.gang === door.gang) ?? -1) + 1}
            chog={chog}
            loggedIn={!!me?.address}
            jailed={city?.jailed ?? []}
            revenge={!!door.gang && revenge.includes(door.gang)}
            jailedNow={jailedNow}
            busy={busy}
            now={now}
            onRob={(g) => void rob(g)}
            onPractice={() => setPractice(true)}
            onConnect={() => setSheet('connect')}
          />
        </Card>
      )}

      {/* First visit */}
      {welcome && me && !me.address && !door && !sheet && !peek && (
        <Card onClose={closeWelcome}>
          <h1 className="font-display text-[32px] uppercase leading-[0.95]">Welcome to Chog City</h1>
          <p className="mt-2 text-[15px] leading-snug text-white/80">
            Every gang has a building with a vault full of cash. Walk your Chog to a rival’s door to rob it,
            and bring the cash home.
          </p>
          <p className="mt-2 text-[14px] text-white/60">
            Walk with the arrow keys or WASD, or tap where you want to go.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              onClick={() => setSheet('connect')}
              className={cn(btn, 'bg-[#ffd666] text-[18px] text-ink')}
            >
              <span className="pt-0.5">Connect wallet</span>
            </button>
            <button onClick={closeWelcome} className={cn(btn, 'bg-[#2a2545] text-[18px] text-white')}>
              <span className="pt-0.5">Look around</span>
            </button>
          </div>
        </Card>
      )}

      {/* A Chog's gang is picked once */}
      {chog && !chog.gang && !sheet && (
        <Card>
          <h2 className="font-display text-[28px] uppercase leading-none">Pick {chog.name}’s gang</h2>
          <p className="mt-1.5 text-[14px] text-white/70">
            From its traits. This is for good: a Chog reps one gang.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {chog.gangChoices.map((g) => (
              <button
                key={g}
                disabled={busy === 'gang'}
                onClick={() => void pickGang(g)}
                className="rounded-[10px] border-2 border-ink px-3 pb-2 pt-3 text-left font-display text-[20px] uppercase leading-none shadow-[3px_3px_0_0_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                style={{ background: GANG_COLOR[g].bg, color: GANG_COLOR[g].fg }}
              >
                {GANGS[g].name}
              </button>
            ))}
          </div>
          {chogs.length > 1 && (
            <button onClick={() => setSheet('me')} className="mt-3 text-[14px] text-white/70 underline">
              Use another Chog
            </button>
          )}
        </Card>
      )}

      {peek !== null && (
        <Card onClose={() => setPeek(null)}>
          <Peek who={peek} jailed={city?.jailed ?? []} now={now} />
        </Card>
      )}

      {sheet === 'connect' && (
        <Sheet title="Connect wallet" onClose={() => setSheet(null)}>
          <p className="mb-3 text-[14px] text-white/70">
            Walk in as your own Chog. Logging in is free and moves no tokens.
          </p>
          <div className="rounded-[12px] bg-paper text-ink">
            <ConnectPanel
              onLoggedIn={() => {
                setSheet(null);
                closeWelcome();
                void loadMe();
              }}
            />
          </div>
        </Sheet>
      )}

      {sheet === 'me' && (
        <Sheet title="Your Chogs" onClose={() => setSheet(null)}>
          {chogs.length === 0 && (
            <p className="text-[15px] text-white/70">
              No Chogs in this wallet. You can still walk around as a guest and try the practice vault.
            </p>
          )}
          {chogs.length > 1 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {chogs.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setPicked(c.id)}
                  className={cn(
                    'rounded-full border-2',
                    c.id === chog?.id
                      ? 'border-[#ffd666]'
                      : 'border-transparent opacity-60 hover:opacity-100',
                  )}
                  aria-label={c.name}
                >
                  <img
                    src={chogImage(c.id, 96)}
                    alt=""
                    className="h-11 w-11 rounded-full border-2 border-ink"
                  />
                </button>
              ))}
            </div>
          )}
          {chog && <ChogCard chog={chog} now={now} />}
          {me?.address && (
            <button
              className="mt-5 inline-flex items-center gap-1.5 text-[13px] text-white/60 hover:text-white"
              onClick={async () => {
                await logOut();
                setMe({ address: null, chogs: [], revenge: {} });
                setSheet(null);
              }}
            >
              <SignOut size={14} /> Log out {short(me.address)}
            </button>
          )}
        </Sheet>
      )}

      {sheet === 'gangs' && (
        <Sheet title="Gangs" onClose={() => setSheet(null)}>
          {board && (
            <p className="-mt-1 mb-3 text-[13px] text-white/60">
              Richest first. Hits reset in {formatLeft(board.resetAt - now)}.
            </p>
          )}
          <ol className="grid gap-2">
            {(board?.board ?? []).map((v, i) => (
              <li key={v.gang}>
                <button
                  onClick={() => {
                    setSheet(null);
                    view.current?.walkTo(v.gang);
                  }}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-[12px] border-2 border-ink bg-[#1d1838] p-2.5 text-left shadow-[2px_2px_0_0_#000] hover:bg-[#262046]',
                    chog?.gang === v.gang && 'outline outline-2 outline-offset-1 outline-[#ffd666]',
                  )}
                >
                  <span className="w-5 text-center font-display text-[18px] text-white/50">{i + 1}</span>
                  <span
                    className="h-8 w-2 shrink-0 rounded-full border border-ink"
                    style={{ background: GANG_COLOR[v.gang].bg }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-[18px] uppercase leading-none">
                      {GANGS[v.gang].name}
                    </span>
                    <span className="text-[12px] text-white/60">{plural(v.members, 'member')}</span>
                  </span>
                  {revenge.includes(v.gang) && (
                    <span className="inline-flex items-center gap-1 rounded-[4px] bg-pink px-1.5 py-0.5 text-[11px] font-bold uppercase text-ink">
                      <ArrowBendUpLeft size={12} weight="bold" /> Revenge
                    </span>
                  )}
                  <span className="font-display text-[20px] leading-none text-[#ffd666] tabular-nums">
                    {money(v.cash)}
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-[12px] text-white/50">Tap a gang to walk to its building.</p>
          <h3 className="mt-6 font-display text-[24px] uppercase leading-none">Latest hits</h3>
          {board && board.hits.length === 0 && (
            <p className="mt-2 text-[14px] text-white/60">No hits yet. Be the first.</p>
          )}
          <ul className="mt-2 divide-y divide-white/10">
            {(board?.hits ?? []).slice(0, 15).map((h) => (
              <li key={h.id} className="flex items-center gap-3 py-2 text-[14px]">
                <img
                  src={chogImage(h.chogId, 96)}
                  alt=""
                  className="h-8 w-8 shrink-0 rounded-full border-2 border-ink"
                />
                <p className="min-w-0 flex-1 leading-snug">
                  <HitLine h={h} />
                </p>
                <span className="shrink-0 text-[12px] text-white/50">{ago(h.at, now)}</span>
              </li>
            ))}
          </ul>
        </Sheet>
      )}
    </div>
  );
}

function HitLine({ h }: { h: Hit }) {
  const gang = (g: GangId) => (
    <span
      style={{ color: GANG_COLOR[g].bg === '#141414' ? GANG_COLOR[g].fg : GANG_COLOR[g].bg }}
      className="font-semibold"
    >
      {GANGS[g].name}
    </span>
  );
  return h.result === 'escaped' ? (
    <>
      {gang(h.gang)} robbed {gang(h.target)} of <strong className="text-[#ffd666]">{money(h.moved)}</strong>
      {h.revenge ? ' (revenge)' : ''}
    </>
  ) : (
    <>
      {gang(h.gang)} got caught robbing {gang(h.target)}
    </>
  );
}

const EMOTES: { kind: Emote; label: string; Icon: typeof HandWaving }[] = [
  { kind: 'wave', label: 'Wave', Icon: HandWaving },
  { kind: 'laugh', label: 'Laugh', Icon: SmileyWink },
  { kind: 'angry', label: 'Angry', Icon: SmileyAngry },
  { kind: 'cash', label: 'Show the cash', Icon: CurrencyDollarSimple },
];

function Emotes({ onEmote }: { onEmote: (k: Emote) => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      const i = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
      if (i >= 0) onEmote(EMOTES[i]!.kind);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onEmote]);
  return (
    <div className="flex gap-1.5">
      {EMOTES.map((e, i) => (
        <button
          key={e.kind}
          onClick={() => onEmote(e.kind)}
          aria-label={e.label}
          title={`${e.label} (${i + 1})`}
          className="grid h-10 w-10 place-items-center rounded-full border-2 border-ink bg-white font-display text-[18px] text-ink shadow-[2px_2px_0_0_#000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
        >
          <e.Icon size={20} weight="bold" />
        </button>
      ))}
    </div>
  );
}

/** A card at the bottom of the screen (phones) or bottom left (wider screens). */
function Card({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
  return (
    <div className="absolute inset-x-0 bottom-0 z-30 p-3 sm:bottom-3 sm:left-3 sm:right-auto sm:w-[400px] sm:p-0">
      <div className="relative rounded-[16px] border-2 border-ink bg-[#151229]/95 p-4 shadow-[4px_4px_0_0_#000] backdrop-blur">
        {onClose && (
          <button
            onClick={onClose}
            className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full text-white/60 hover:text-white"
            aria-label="Close"
          >
            <X size={18} weight="bold" />
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

/** A panel from the right (wider screens) or the bottom (phones). */
function Sheet({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div
      className="absolute inset-0 z-40 flex items-end justify-end bg-black/40 sm:items-stretch"
      onClick={onClose}
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85dvh] w-full overflow-y-auto rounded-t-[18px] border-2 border-ink bg-[#151229] p-4 shadow-[-4px_0_0_0_#000] sm:max-h-none sm:w-[420px] sm:rounded-none sm:border-y-0 sm:border-r-0"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-[30px] uppercase leading-none">{title}</h2>
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full text-white/60 hover:text-white"
            aria-label="Close"
          >
            <X size={20} weight="bold" />
          </button>
        </div>
        {children}
      </aside>
    </div>
  );
}

function ChogCard({ chog, now }: { chog: MyChog; now: number }) {
  return (
    <div className="rounded-[14px] border-2 border-ink bg-[#1d1838] p-3 shadow-[3px_3px_0_0_#000]">
      <div className="flex items-center gap-3">
        <img
          src={chogImage(chog.id, 256)}
          alt=""
          className="h-20 w-20 shrink-0 rounded-[10px] border-2 border-ink"
        />
        <div className="min-w-0">
          <Link
            href={`/chog/${chog.id}`}
            className="inline-flex items-center gap-1 font-display text-[24px] uppercase leading-none hover:underline"
          >
            {chog.name} <ArrowSquareOut size={16} />
          </Link>
          {chog.gang && (
            <div
              className="mt-1 inline-block rounded-[5px] border-2 border-ink px-1.5 pt-1 font-display text-[14px] uppercase leading-none"
              style={{ background: GANG_COLOR[chog.gang].bg, color: GANG_COLOR[chog.gang].fg }}
            >
              {GANGS[chog.gang].name}
            </div>
          )}
        </div>
      </div>
      <p className="mt-3 text-[13px] text-white/75">
        Stole <strong className="text-[#ffd666]">{money(chog.record.stolen)}</strong> ·{' '}
        {plural(chog.record.escapes, 'escape')} · busted {chog.record.busts} · caught{' '}
        {plural(chog.record.catches, 'robber')}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {chog.powers.map((p) => (
          <span
            key={p}
            title={POWERS[p].does}
            className="inline-flex items-center gap-1 rounded-full bg-white/10 py-0.5 pl-1 pr-2 text-[12px]"
          >
            <SkillIcon skill={POWER_ICON[p]} width={16} height={16} />
            {POWERS[p].name}
          </span>
        ))}
      </div>
      {chog.jailedUntil && chog.jailedUntil > now && (
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-[6px] bg-jail px-2 py-1 text-[13px] font-semibold">
          <Lock size={14} weight="fill" /> In jail, out in {formatLeft(chog.jailedUntil - now)}
        </p>
      )}
    </div>
  );
}

function DoorCard(props: {
  place: Place;
  row: VaultRow | undefined;
  rank: number;
  chog: MyChog | null;
  loggedIn: boolean;
  jailed: Jailed[];
  revenge: boolean;
  jailedNow: boolean;
  busy: string | null;
  now: number;
  onRob: (g: GangId) => void;
  onPractice: () => void;
  onConnect: () => void;
}) {
  const { place, row, chog } = props;
  if (place.kind === 'training')
    return (
      <>
        <h2 className="font-display text-[28px] uppercase leading-none text-[#7cf0c4]">Practice vault</h2>
        <p className="mt-2 text-[15px] leading-snug text-white/80">
          A safe place to learn: no wallet, no jail, no real cash.
        </p>
        <button onClick={props.onPractice} className={cn(btn, 'mt-4 w-full bg-[#7cf0c4] text-ink')}>
          <span className="pt-0.5">Start practice</span>
        </button>
      </>
    );
  if (place.kind === 'jail') {
    const inside = props.jailed.filter((j) => j.until > props.now);
    return (
      <>
        <h2 className="font-display text-[28px] uppercase leading-none text-[#ff5a4f]">Jail</h2>
        <p className="mt-1.5 text-[14px] text-white/70">Chogs caught robbing sit here for 30 minutes.</p>
        {inside.length === 0 ? (
          <p className="mt-3 text-[15px]">Nobody inside right now.</p>
        ) : (
          <ul className="mt-3 max-h-[180px] space-y-1.5 overflow-y-auto">
            {inside.map((j) => (
              <li key={j.id} className="flex items-center gap-2 text-[14px]">
                <img src={chogImage(j.id, 96)} alt="" className="h-7 w-7 rounded-full border-2 border-ink" />
                <span className="flex-1 truncate">{j.name}</span>
                <span className="text-white/60">out in {formatLeft(j.until - props.now)}</span>
              </li>
            ))}
          </ul>
        )}
      </>
    );
  }
  const gang = place.gang!;
  const mine = chog?.gang === gang;
  const done = chog?.hitToday.includes(gang);
  let block: string | null = null;
  if (!props.loggedIn) block = 'connect';
  else if (!chog) block = 'You need a Chog to rob vaults.';
  else if (!chog.gang) block = 'Pick a gang first.';
  else if (props.jailedNow) block = 'Your Chog is in jail.';
  else if (done) block = 'Your Chog already robbed this vault today.';
  return (
    <>
      <div className="flex items-start gap-3 pr-8">
        <span
          className="mt-0.5 h-9 w-2.5 shrink-0 rounded-full border border-ink"
          style={{ background: GANG_COLOR[gang].bg }}
        />
        <div className="min-w-0">
          <Link
            href={`/gangs/${gang}`}
            className="block truncate font-display text-[28px] uppercase leading-none hover:underline"
          >
            {GANGS[gang].name}
          </Link>
          <p className="mt-1 text-[13px] text-white/60">
            {mine ? 'Your gang’s building' : `#${props.rank} richest`} · {plural(row?.members ?? 0, 'member')}
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <div className="text-[12px] uppercase tracking-wide text-white/50">In the vault</div>
          <div className="font-display text-[34px] leading-none text-[#ffd666] tabular-nums">
            {money(row?.cash ?? 0)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[12px] uppercase tracking-wide text-white/50">Guards</div>
          <div className="mt-1 flex -space-x-2">
            {(row?.guards ?? []).slice(0, 4).map((g) => (
              <img
                key={g}
                src={chogImage(g, 96)}
                alt=""
                className="h-8 w-8 rounded-full border-2 border-ink"
              />
            ))}
          </div>
        </div>
      </div>
      <p className="mt-2 inline-flex items-center gap-1.5 text-[13px] text-white/70">
        <ShieldCheck size={15} weight="fill" /> Defence: {DEFENCE[row?.tier ?? 0]}
      </p>
      {mine ? (
        <p className="mt-3 rounded-[8px] bg-white/5 px-3 py-2 text-[14px] text-white/80">
          This is home. Rivals rob this vault; every escape you make from theirs adds to it.
        </p>
      ) : block === 'connect' ? (
        <button onClick={props.onConnect} className={cn(btn, 'mt-4 w-full bg-[#ffd666] text-ink')}>
          <span className="pt-0.5">Connect wallet to rob it</span>
        </button>
      ) : (
        <>
          {props.revenge && !block && (
            <p className="mt-3 inline-flex items-center gap-1 rounded-[4px] bg-pink px-1.5 py-0.5 text-[12px] font-bold uppercase text-ink">
              <ArrowBendUpLeft size={12} weight="bold" /> Revenge: they robbed you. +25%
            </p>
          )}
          <button
            disabled={!!block || props.busy !== null}
            onClick={() => props.onRob(gang)}
            className={cn(
              btn,
              'mt-3 w-full',
              block ? 'bg-white/10 text-white/50 shadow-none' : 'bg-pink text-ink',
            )}
          >
            <Vault size={20} weight="fill" />
            <span className="pt-0.5">{props.busy === gang ? 'Opening…' : 'Rob the vault'}</span>
          </button>
          {block && <p className="mt-2 text-center text-[13px] text-white/60">{block}</p>}
        </>
      )}
    </>
  );
}

function Peek({ who, jailed, now }: { who: Tapped; jailed: Jailed[]; now: number }) {
  const j = jailed.find((x) => x.id === who.chog && x.until > now);
  return (
    <div className="flex items-center gap-3 pr-8">
      <img
        src={chogImage(who.chog, 256)}
        alt=""
        className="h-20 w-20 shrink-0 rounded-[10px] border-2 border-ink"
      />
      <div className="min-w-0">
        <div className="truncate font-display text-[24px] uppercase leading-none">{who.name}</div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {who.gang && (
            <span
              className="rounded-[5px] border-2 border-ink px-1.5 pt-1 font-display text-[13px] uppercase leading-none"
              style={{ background: GANG_COLOR[who.gang].bg, color: GANG_COLOR[who.gang].fg }}
            >
              {GANGS[who.gang].name}
            </span>
          )}
          {who.player && (
            <span className="rounded-full bg-[#3ddc84] px-1.5 py-0.5 text-[11px] font-bold uppercase text-ink">
              Playing now
            </span>
          )}
        </div>
        {j && <p className="mt-1 text-[13px] text-[#ff8a80]">In jail, out in {formatLeft(j.until - now)}</p>}
        <Link
          href={`/chog/${who.chog}`}
          className="mt-2 flex items-center gap-1 text-[14px] font-semibold underline"
        >
          See its record <ArrowSquareOut size={14} />
        </Link>
      </div>
    </div>
  );
}
