'use client';
import { GANGS, type GangId } from '@chog-city/data';
import type { Place } from '@chog-city/game/city';
import { FIRST_VAULT, GUARD_PRICE, POWERS, vaultDef, type PowerId } from '@chog-city/game/heist';
import {
  ArrowBendUpLeft,
  ArrowSquareOut,
  CurrencyDollarSimple,
  DoorOpen,
  HandGrabbing,
  HandWaving,
  Lock,
  LockKeyOpen,
  Play,
  ShieldCheck,
  SignOut,
  SmileyAngry,
  SmileyWink,
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
import {
  Banner,
  type BannerData,
  type Duty,
  EmoteButton,
  GangsButton,
  MapButton,
  MiniMap,
  RoleCard,
  RoundButton,
} from './hud';
import type { LiveStatus } from './live-city';

interface VaultRow {
  gang: GangId;
  cash: number;
  tier: number;
  boughtUntil: number | null;
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
  prisoner: number | null;
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
  /** Set on a break-out. */
  prisoner?: number;
  vault: string;
  tier: number;
  target: GangId;
  revenge: boolean;
  powers: PowerId[];
  guards: { id: number; name: string }[];
}
interface Robbing {
  target: GangId;
  gang: GangId;
  chog: number;
  since: number;
}
interface GangInfo {
  members: { id: number; name: string; stolen: number; catches: number }[];
  hits: Hit[];
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
  'done-today': 'This Chog already did that today. Try again tomorrow.',
  'own-gang': 'That’s your own gang’s vault.',
  'no-gang': 'Pick a gang first.',
  'not-yours': 'That Chog isn’t in your wallet any more.',
  'slow-down': 'Too fast. Wait a few seconds.',
  already: 'Your vault already has that much defence.',
  'too-poor': 'Not enough cash in your vault for that.',
  'not-in-jail': 'They’re not in jail any more.',
};

const DEFENCE = ['Light', 'Guarded', 'Heavy', 'Fortress'];
const money = (n: number) => `$${n.toLocaleString('en-US')}`;
/** "Clowns are", "MCGA Gang is". */
const verb = (g: GangId) => (GANGS[g].name.endsWith('s') ? 'are' : 'is');
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
  const [board, setBoard] = useState<{
    board: VaultRow[];
    hits: Hit[];
    robbing: Robbing[];
    resetAt: number;
  } | null>(null);
  const [alarms, setAlarms] = useState<Record<string, Robbing>>({});
  const [raid, setRaid] = useState<Robbing | null>(null);
  const [gangInfo, setGangInfo] = useState<{ gang: GangId; data: GangInfo } | null>(null);
  const [me, setMe] = useState<{
    address: string | null;
    chogs: MyChog[];
    revenge: Record<string, GangId[]>;
  } | null>(null);
  const [city, setCity] = useState<CityData | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [practice, setPractice] = useState(false);
  /** The door you're standing at, and whether its card is open. */
  const [door, setDoor] = useState<Place | null>(null);
  const [doorOpen, setDoorOpen] = useState(false);
  const [area, setArea] = useState('plaza');
  const [mapOpen, setMapOpen] = useState(false);
  const [emoteOpen, setEmoteOpen] = useState(false);
  const [banner, setBanner] = useState<BannerData | null>(null);
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
  useLive((e) => {
    if (e?.alarm && e.gang && e.chog) {
      const r: Robbing = {
        target: e.alarm as GangId,
        gang: e.gang as GangId,
        chog: e.chog,
        since: Date.now(),
      };
      setAlarms((a) => ({ ...a, [r.target]: r }));
      if (r.target === myGang.current) setRaid(r);
    }
    if (e?.war && e.target) {
      const t = e.target;
      setAlarms((a) => {
        const n = { ...a };
        delete n[t];
        return n;
      });
      setRaid((r) => (r?.target === t ? null : r));
    }
    void loadBoard();
    void loadCity();
  });
  useEffect(() => {
    if (board) setAlarms(Object.fromEntries(board.robbing.map((r) => [r.target, r])));
  }, [board]);
  // A comic banner when a hit lands (only ones that just happened, not the history on load).
  const lastHit = useRef<string | null>(null);
  useEffect(() => {
    const h = board?.hits[0];
    if (!h) return;
    if (lastHit.current === null) {
      lastHit.current = h.id;
      return;
    }
    if (h.id === lastHit.current) return;
    lastHit.current = h.id;
    if (Date.now() - h.at > 120_000) return;
    const mine = myGang.current;
    const name = (g: GangId) => GANGS[g].name;
    let b: BannerData;
    if (h.prisoner !== null)
      b =
        h.result === 'escaped'
          ? {
              id: h.id,
              title: 'Jail break!',
              line: `${name(h.gang)} broke a gang-mate out`,
              chog: h.chogId,
              tone: 'win',
            }
          : {
              id: h.id,
              title: 'Caught!',
              line: `${name(h.gang)} got caught at the jail`,
              chog: h.chogId,
              tone: 'lose',
            };
    else if (h.result === 'escaped')
      b = {
        id: h.id,
        title: h.target === mine ? 'You got robbed!' : 'Robbed!',
        line: `${name(h.gang)} took ${money(h.moved)} from ${name(h.target)}`,
        chog: h.chogId,
        tone: h.target === mine ? 'lose' : 'win',
      };
    else
      b = {
        id: h.id,
        title: 'Busted!',
        line: `${name(h.gang)} got caught robbing ${name(h.target)}`,
        chog: h.chogId,
        tone: 'lose',
      };
    setBanner(b);
  }, [board]);
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 5000);
    return () => clearTimeout(t);
  }, [banner]);

  useEffect(() => {
    if (!raid) return;
    const t = setTimeout(() => setRaid(null), 25_000);
    return () => clearTimeout(t);
  }, [raid]);
  // The card at a gang's door shows its best robbers and latest hits.
  const doorGang = door?.gang ?? null;
  useEffect(() => {
    if (!doorGang) return;
    let gone = false;
    void fetch(`/api/gangs/${doorGang}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: GangInfo | null) => !gone && d && setGangInfo({ gang: doorGang, data: d }));
    return () => {
      gone = true;
    };
  }, [doorGang, board]);

  const chogs = me?.chogs ?? [];
  const chog = chogs.find((c) => c.id === picked) ?? chogs[0] ?? null;
  const revenge = chog?.gang ? (me?.revenge[chog.gang] ?? []) : [];
  const jailedNow = !!chog?.jailedUntil && chog.jailedUntil > now;
  const myGang = useRef<GangId | null>(null);
  myGang.current = chog?.gang ?? null;

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
        alarm: !!alarms[v.gang] && alarms[v.gang]!.since > now - 180_000,
        mine: chog?.gang === v.gang,
      };
    });
    return out;
  }, [board, chog?.gang, alarms, now]);
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

  async function defendVault(level: number) {
    if (!chog) return;
    setBusy('defend');
    setNotice(null);
    try {
      await post('/api/war/defend', { chogId: chog.id, level });
      await loadBoard();
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function breakOut(prisoner: number) {
    if (!chog) return;
    setBusy(`free${prisoner}`);
    setNotice(null);
    try {
      const d = await post<{ run: Run }>('/api/heist/breakout', { chogId: chog.id, prisoner });
      setRun(d.run);
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

  // ---------- heads-up display ----------
  const myRow = chog?.gang ? board?.board.find((v) => v.gang === chog.gang) : undefined;
  const myRank = myRow && board ? board.board.indexOf(myRow) + 1 : 0;
  const walk = (id: string) => () => view.current?.walkTo(id);
  const duties: Duty[] = [];
  if (!me?.address) {
    duties.push(
      {
        key: 'connect',
        label: 'Connect your wallet',
        sub: 'Walk in as your own Chog',
        onGo: () => setSheet('connect'),
      },
      { key: 'practice', label: 'Try the practice vault', onGo: walk('training') },
    );
  } else if (!chog) {
    duties.push({
      key: 'practice',
      label: 'Try the practice vault',
      sub: 'No Chog in this wallet',
      onGo: walk('training'),
    });
  } else if (chog.gang) {
    const gang = chog.gang;
    if (jailedNow)
      duties.push({
        key: 'jail',
        label: 'Sit out your jail time',
        sub: `Out in ${formatLeft(chog.jailedUntil! - now)}`,
      });
    const hit = chog.hitToday;
    const next = board?.board.find((v) => v.gang !== gang && !hit.includes(v.gang));
    duties.push({
      key: 'rob',
      label: hit.length ? `Robbed ${plural(hit.length, 'vault')} today` : 'Rob a rival vault',
      sub: next ? `Richest left: ${GANGS[next.gang].name} ${money(next.cash)}` : 'Every vault hit today',
      done: hit.length > 0,
      onGo: next && !jailedNow ? walk(next.gang) : undefined,
    });
    for (const g of revenge.filter((r) => !hit.includes(r)).slice(0, 2))
      duties.push({
        key: `rev${g}`,
        label: `Hit back at ${GANGS[g].name}`,
        sub: 'They robbed you: revenge pays 25% more',
        onGo: jailedNow ? undefined : walk(g),
      });
    const mates = (city?.jailed ?? []).filter((j) => j.gang === gang && j.id !== chog.id && j.until > now);
    if (mates.length)
      duties.push({
        key: 'free',
        label: `Free ${mates[0]!.name} from jail`,
        sub: mates.length > 1 ? `${mates.length} gang-mates locked up` : undefined,
        onGo: jailedNow ? undefined : walk('jail'),
      });
    if (myRow) {
      const guarded = !!myRow.boughtUntil && myRow.boughtUntil > now;
      duties.push({
        key: 'guard',
        label: guarded ? 'Guards on duty' : 'Guard your vault',
        sub: `Defence: ${DEFENCE[myRow.tier]}`,
        done: guarded,
        onGo: jailedNow ? undefined : walk(gang),
      });
    }
  }
  const areaName =
    area === 'plaza'
      ? 'Plaza'
      : area === 'street'
        ? 'Streets'
        : area === 'jail'
          ? 'Jail'
          : area === 'training'
            ? 'Practice vault'
            : (GANGS[area as GangId]?.name ?? 'Streets');
  const useLook = !door
    ? { icon: HandGrabbing, label: 'Use' }
    : door.kind === 'jail'
      ? { icon: LockKeyOpen, label: 'Jail', tone: '#ff8a80' }
      : door.kind === 'training'
        ? { icon: Play, label: 'Practice', tone: '#7cf0c4' }
        : door.gang === chog?.gang
          ? { icon: Vault, label: 'Vault', tone: '#ffd666' }
          : { icon: DoorOpen, label: 'Rob', tone: '#ff5a4f' };
  const openDoor = () => door && setDoorOpen(true);

  // Keys: E / Space use a door, G gangs, M map, T emotes, 1-4 an emote, Esc closes things.
  const keyState = useRef({ door, doorOpen, sheet, peek, mapOpen, inHeist: !!run || practice });
  keyState.current = { door, doorOpen, sheet, peek, mapOpen, inHeist: !!run || practice };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const st = keyState.current;
      if (st.inHeist) return;
      if (e.code === 'Escape') {
        setMapOpen(false);
        setEmoteOpen(false);
        setDoorOpen(false);
        return;
      }
      if (st.sheet || st.peek) return;
      if (e.code === 'KeyM') return setMapOpen((o) => !o);
      if (st.mapOpen) return;
      if ((e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter') && st.door && !st.doorOpen) {
        if (e.code === 'Enter' && el?.tagName === 'BUTTON') return;
        e.preventDefault();
        return setDoorOpen(true);
      }
      if (e.code === 'KeyG') return setSheet('gangs');
      if (e.code === 'KeyT') return setEmoteOpen((o) => !o);
      const i = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
      if (i >= 0) {
        view.current?.emote(EMOTES[i]!.kind);
        setEmoteOpen(false);
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

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
          owner={
            run.prisoner
              ? { name: 'The jail', color: '#ff5a4f', ink: '#111111' }
              : {
                  name: GANGS[run.target].name,
                  color: GANG_COLOR[run.target].bg,
                  ink: GANG_COLOR[run.target].fg,
                }
          }
          rescue={
            run.prisoner
              ? {
                  id: run.prisoner,
                  name: city?.jailed.find((j) => j.id === run.prisoner)?.name ?? 'your gang-mate',
                }
              : undefined
          }
          real={{
            myGang: chog.gang ? GANGS[chog.gang].name : 'your gang',
            replayHref: `/replay/${run.id}`,
            finish: async (inputs) =>
              (await post<{ result: RealResult }>('/api/heist/finish', { runId: run.id, inputs })).result,
            onLeave: () => {
              backTo(run.prisoner ? 'jail' : run.target);
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

  const anyCard = !!(
    (door && doorOpen) ||
    sheet ||
    peek ||
    mapOpen ||
    (chog && !chog.gang) ||
    (welcome && !me?.address)
  );

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#07060d] text-white">
      <CityView
        ref={view}
        me={meLook}
        strollers={city?.strollers ?? []}
        jailed={city?.jailed ?? []}
        places={looks}
        board={screen}
        paused={!!sheet || !!peek || mapOpen || (!!chog && !chog.gang)}
        onDoor={(p, asked) => {
          setDoor(p);
          setDoorOpen(!!p && asked);
        }}
        onArea={setArea}
        mapOpen={mapOpen}
        onCloseMap={() => setMapOpen(false)}
        onPerson={setPeek}
        onLive={(status, online) =>
          setLive((l) => (l.status === status && l.online === online ? l : { status, online }))
        }
      />

      {/* Top left: who you are and today's jobs */}
      <div className="pointer-events-none absolute left-3 top-3 z-20 flex flex-col items-start gap-2">
        <RoleCard
          chog={chog?.id ?? null}
          name={chog?.name ?? 'Guest'}
          gang={chog?.gang ? GANGS[chog.gang].name : null}
          color={meLook.color}
          ink={meLook.ink}
          vault={myRow ? `Vault ${money(myRow.cash)} · #${myRank} of ${board?.board.length ?? 0}` : undefined}
          duties={duties}
          footer={board && chog?.gang ? `New day in ${formatLeft(board.resetAt - now)}` : undefined}
          onPortrait={() => setSheet(me?.address ? 'me' : 'connect')}
        />
      </div>

      {/* Top right: the minimap */}
      <div className="pointer-events-none absolute right-3 top-3 z-20 flex items-start gap-2">
        {!me?.address && (
          <div className="hidden sm:block">
            <button
              onClick={() => setSheet('connect')}
              className={cn(btn, 'pointer-events-auto h-10 bg-[#ffd666] px-3 text-[17px] text-ink')}
            >
              <span className="pt-0.5">Connect wallet</span>
            </button>
          </div>
        )}
        <MiniMap
          area={areaName}
          online={
            live.status === 'live'
              ? `${live.online} playing now`
              : live.status === 'elsewhere'
                ? 'Open in another window'
                : 'Connecting…'
          }
          dot={live.status === 'live' ? '#3ddc84' : live.status === 'elsewhere' ? '#ff5a4f' : '#ffffff66'}
          onOpen={() => setMapOpen(true)}
        />
      </div>

      {/* Top middle: comic banners */}
      <div className="pointer-events-none absolute inset-x-0 top-[148px] z-30 flex justify-center px-3 sm:top-4">
        {raid ? (
          <Banner
            b={{
              id: `raid${raid.since}`,
              title: 'Raid!',
              line: `${GANGS[raid.gang].name} ${verb(raid.gang)} robbing your vault. Tap to go there.`,
              chog: raid.chog,
              tone: 'alarm',
            }}
            onClick={() => {
              view.current?.walkTo(raid.target);
              setRaid(null);
            }}
          />
        ) : (
          banner && <Banner b={banner} onClick={() => setBanner(null)} />
        )}
      </div>

      {/* Bottom right: action buttons */}
      {!anyCard && (
        <div className="pointer-events-none absolute bottom-4 right-3 z-20 flex items-end gap-3 sm:bottom-5 sm:right-5 sm:gap-4">
          <div className="relative flex flex-col items-center gap-3">
            {emoteOpen && (
              <div className="pointer-events-auto absolute bottom-[calc(100%+8px)] flex flex-col gap-2">
                {EMOTES.map((e, i) => (
                  <button
                    key={e.kind}
                    onClick={() => {
                      view.current?.emote(e.kind);
                      setEmoteOpen(false);
                    }}
                    aria-label={e.label}
                    title={`${e.label} (${i + 1})`}
                    className="relative grid h-12 w-12 place-items-center rounded-full border-[3px] border-ink bg-white text-ink shadow-[0_4px_0_0_#000] active:translate-y-[2px] active:shadow-[0_2px_0_0_#000]"
                  >
                    <e.Icon size={22} weight="fill" />
                    <span className="absolute -left-1 -top-1 grid h-5 w-5 place-items-center rounded-[5px] border-2 border-ink bg-[#17132b] font-display text-[11px] leading-none text-white">
                      {i + 1}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <EmoteButton onClick={() => setEmoteOpen((o) => !o)} />
          </div>
          <div className="flex flex-col items-center gap-3">
            <MapButton onClick={() => setMapOpen(true)} />
            <GangsButton onClick={() => setSheet('gangs')} />
          </div>
          <RoundButton big {...useLook} hotkey="E" disabled={!door} lit={!!door} onClick={openDoor} />
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
      {door && doorOpen && !sheet && !peek && (
        <Card onClose={() => setDoorOpen(false)}>
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
            onDefend={(l) => void defendVault(l)}
            onBreakOut={(id) => void breakOut(id)}
            info={gangInfo && gangInfo.gang === door.gang ? gangInfo.data : undefined}
            robbing={door.gang ? alarms[door.gang] : undefined}
          />
        </Card>
      )}

      {/* First visit */}
      {welcome && me && !me.address && !(door && doorOpen) && !sheet && !peek && (
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
              <li key={h.id}>
                <Link href={`/replay/${h.id}`} className="group flex items-center gap-3 py-2 text-[14px]">
                  <img
                    src={chogImage(h.chogId, 96)}
                    alt=""
                    className="h-8 w-8 shrink-0 rounded-full border-2 border-ink"
                  />
                  <p className="min-w-0 flex-1 leading-snug">
                    <HitLine h={h} />
                  </p>
                  <span className="shrink-0 text-right text-[12px] text-white/50">
                    {ago(h.at, now)}
                    <span className="flex items-center justify-end gap-0.5 font-semibold text-white/80 group-hover:text-white">
                      <Play size={11} weight="fill" /> Watch
                    </span>
                  </span>
                </Link>
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
  if (h.prisoner !== null)
    return h.result === 'escaped' ? (
      <>{gang(h.gang)} broke a gang-mate out of jail</>
    ) : (
      <>{gang(h.gang)} got caught breaking into the jail</>
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

/** A card at the bottom of the screen (phones) or bottom left (wider screens). */
function Card({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
  return (
    <div className="absolute inset-x-0 bottom-0 z-30 p-3 sm:bottom-6 sm:left-1/2 sm:right-auto sm:w-[440px] sm:-translate-x-1/2 sm:p-0">
      <div className="relative max-h-[72dvh] animate-[sheet-in_220ms_ease-out] overflow-y-auto rounded-[18px] border-[3px] border-ink bg-[#17132b]/97 p-4 shadow-[0_6px_0_0_#000] backdrop-blur">
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
  onDefend: (level: number) => void;
  onBreakOut: (prisoner: number) => void;
  info?: GangInfo;
  robbing?: Robbing;
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
        <p className="mt-1.5 text-[14px] text-white/70">
          Chogs caught robbing sit here for 30 minutes. Sneak in and open a gang-mate’s cell to get them out
          early.
        </p>
        {inside.length === 0 ? (
          <p className="mt-3 text-[15px]">Nobody inside right now.</p>
        ) : (
          <ul className="mt-3 max-h-[180px] space-y-1.5 overflow-y-auto">
            {inside.map((j) => (
              <li key={j.id} className="flex items-center gap-2 text-[14px]">
                <img src={chogImage(j.id, 96)} alt="" className="h-7 w-7 rounded-full border-2 border-ink" />
                <span className="flex-1 truncate">{j.name}</span>
                <span className="text-white/60">{formatLeft(j.until - props.now)}</span>
                {chog?.gang === j.gang && chog.id !== j.id && !props.jailedNow && (
                  <button
                    disabled={props.busy !== null}
                    onClick={() => props.onBreakOut(j.id)}
                    className="rounded-[6px] border-2 border-ink bg-pink px-2 pb-0.5 pt-1 font-display text-[14px] uppercase leading-none text-ink shadow-[2px_2px_0_0_#000] disabled:opacity-50"
                  >
                    {props.busy === `free${j.id}` ? '…' : 'Break out'}
                  </button>
                )}
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
      {props.robbing && props.robbing.since > props.now - 180_000 && (
        <p className="mt-2 flex items-center gap-2 rounded-[8px] bg-[#ff2d55] px-2.5 py-1.5 text-[13px] font-semibold text-ink">
          <span className="h-2 w-2 animate-pulse rounded-full bg-ink" />
          {GANGS[props.robbing.gang].name} {verb(props.robbing.gang)} {mine ? 'robbing you' : 'inside'} right
          now
        </p>
      )}
      {mine ? (
        <>
          <Defend
            row={row}
            jailed={props.jailedNow}
            busy={props.busy}
            now={props.now}
            onDefend={props.onDefend}
          />
          <HomeInfo gang={gang} info={props.info} now={props.now} />
        </>
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

/** Spend vault cash on more guards, cameras and lasers for a day. */
function Defend(props: {
  row?: VaultRow;
  jailed: boolean;
  busy: string | null;
  now: number;
  onDefend: (l: number) => void;
}) {
  const { row } = props;
  if (!row) return null;
  const options = [1, 2, 3].filter((l) => l > row.tier);
  return (
    <div className="mt-3 rounded-[10px] border-2 border-white/10 p-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[12px] uppercase tracking-wide text-white/50">Add defence for 24 hours</div>
        {row.boughtUntil && (
          <div className="text-[12px] text-white/60">{formatLeft(row.boughtUntil - props.now)} left</div>
        )}
      </div>
      {options.length === 0 ? (
        <p className="mt-1 text-[13px] text-white/75">Your vault is at Fortress, the most there is.</p>
      ) : (
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {options.map((l) => {
            const price = GUARD_PRICE[l as 1 | 2 | 3];
            const poor = row.cash < price;
            return (
              <button
                key={l}
                disabled={poor || props.jailed || props.busy !== null}
                onClick={() => props.onDefend(l)}
                className="rounded-[8px] border-2 border-ink bg-[#2a2545] px-2 pb-1.5 pt-2 text-left shadow-[2px_2px_0_0_#000] hover:bg-[#342d55] disabled:opacity-40 disabled:shadow-none"
              >
                <span className="block font-display text-[16px] uppercase leading-none">{DEFENCE[l]}</span>
                <span className="mt-0.5 block text-[12px] text-[#ffd666]">{money(price)}</span>
              </button>
            );
          })}
        </div>
      )}
      <p className="mt-1.5 text-[12px] leading-snug text-white/55">
        Paid from your vault. More guards, cameras and lasers for anyone who tries to rob it.
      </p>
    </div>
  );
}

function HomeInfo({ gang, info, now }: { gang: GangId; info?: GangInfo; now: number }) {
  if (!info) return <div className="mt-3 h-24 animate-pulse rounded-[8px] bg-white/5" />;
  const robbed = info.hits.filter((h) => h.target === gang && h.result === 'escaped').slice(0, 3);
  return (
    <div className="mt-3 grid gap-3 text-[13px]">
      <div>
        <div className="text-[12px] uppercase tracking-wide text-white/50">Best robbers</div>
        {info.members.length === 0 ? (
          <p className="mt-1 text-white/70">Nobody has robbed for this gang yet. Be the first.</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {info.members.slice(0, 3).map((m) => (
              <li key={m.id} className="flex items-center gap-2">
                <img src={chogImage(m.id, 96)} alt="" className="h-6 w-6 rounded-full border border-ink" />
                <span className="flex-1 truncate">{m.name}</span>
                <span className="font-semibold text-[#ffd666]">{money(m.stolen)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <div className="text-[12px] uppercase tracking-wide text-white/50">Robbed lately</div>
        {robbed.length === 0 ? (
          <p className="mt-1 text-white/70">Nobody has got out of your vault with cash yet.</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {robbed.map((h) => (
              <li key={h.id}>
                <Link href={`/replay/${h.id}`} className="flex items-center gap-2 hover:underline">
                  <img
                    src={chogImage(h.chogId, 96)}
                    alt=""
                    className="h-6 w-6 rounded-full border border-ink"
                  />
                  <span className="flex-1 truncate">
                    {GANGS[h.gang].name} took <strong className="text-[#ffd666]">{money(h.moved)}</strong>
                  </span>
                  <Play size={11} weight="fill" className="text-white/70" />
                  <span className="text-white/50">{ago(h.at, now)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
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
