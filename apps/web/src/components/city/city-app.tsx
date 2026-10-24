'use client';
import { GANGS, GANG_IDS, metadataIdFor, type GangId } from '@chog-city/data';
import { CITY, EMOTES, HEAD_START, getawayTime, placeOf, type Emote, type Place } from '@chog-city/game/city';
import { encodeLock, lockFor, type LockKind } from '@chog-city/game/lock';
import { RUSH_BANK, rushRules, rushSeed } from '@chog-city/game/rush';
import { BUST_FINE, GUARD_PRICE, POWERS, SAFE_BY_TIER, type PowerId } from '@chog-city/game/heist';
import {
  ArrowBendUpLeft,
  ArrowSquareOut,
  DoorOpen,
  HandGrabbing,
  Lock,
  LockKeyOpen,
  Play,
  ShieldCheck,
  SignOut,
  Vault,
  X,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChogPass, type Peek as Pass } from '@/components/chog-pass';
import type { RealResult } from '@/components/heist/heist-game';
import { playMusic, type Track } from '@/components/heist/music';
import { prepareSound, Sound } from '@/components/heist/sound';
import { LockGame } from '@/components/lock/lock-game';
import { RaidLink } from '@/components/rush/raid-link';
import { RushGame } from '@/components/rush/rush-game';
import { SkillIcon } from '@/components/skill-icons';
import { cn } from '@/lib/cn';
import { possessive } from '@/lib/possessive';
import { useDragClose } from '@/components/ui/use-drag-close';
import { chogImage } from '@/lib/images';
import { useLive } from '@/lib/live';
import { GANG_COLOR } from '@/lib/theme';
import { ago, formatLeft } from '@/lib/time';
import { hasWalletConnectSession, logOut } from '@/lib/wallet';
import { BurnButton, PosterPicker, type Burns } from './burn';
import { ChatPanel } from './chat';
import { Director } from './director';
import { MusicButton } from './music-button';
import type { PlaceLook } from './city-render';
import { CityView, type CityHandle, type Jailed, type Stroller, type Tapped } from './city-view';
import {
  Banner,
  type BannerData,
  type Duty,
  ChatButton,
  EmoteButton,
  tap,
  GangsButton,
  MapButton,
  MiniMap,
  RoleCard,
  PhoneControls,
  RoundButton,
} from './hud';
import type { Chase, ChaseEnd, ChatMsg, LiveStatus } from './live-city';
import { useNoPageScroll } from '@/lib/no-page-scroll';
import { ViewportProbe } from './viewport-probe';

/** "Legends’ door", "MCGA Gang’s door". */
const doorOf = (name: string) => `${possessive(name)} door`;

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
  gangWhy?: Record<string, string[]>;
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
  /** The live raid room (defenders can join); missing if the live server can't be reached. */
  link?: RaidLink;
  /** Stage 1 (the lock on the door) or 2 (inside the vault). Break-outs skip the lock. */
  stage?: 'lock' | 'vault';
  /** The break-in was loud: the alarm is ringing inside. */
  loud?: boolean;
}
interface Robbing {
  target: GangId;
  gang: GangId;
  chog: number;
  since: number;
  /** The run, to defend or watch live. */
  run?: string;
}
interface GangInfo {
  members: { id: number; name: string; stolen: number; catches: number }[];
  hits: Hit[];
}
interface CityData {
  strollers: Stroller[];
  jailed: Jailed[];
  practice: { id: number; name: string; powers: PowerId[] };
  burns: Burns;
  events?: { key: string; screen: string; title: string; line: string }[];
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
  'bad-gang': 'That Chog already has its gang.',
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
const LOCK_NAME: Record<LockKind, string> = {
  tumbler: 'Pick the lock',
  wires: 'Cut the alarm',
  reels: 'Crack the slot lock',
  dial: 'Spin the safe dial',
};
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

/** The base for a big button; add a colour class (btn-primary, btn-gold, btn-glass). */
const btn = 'btn press';

export function CityApp() {
  useNoPageScroll();
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
    /** The owner (for the demo controls). */
    admin?: boolean;
  } | null>(null);
  const [city, setCity] = useState<CityData | null>(null);
  // Walking as your Chog from its wallet address alone (read from Monad, nothing signed): practice only until
  // the wallet is proved. Remembered in this browser.
  const [pass, setPassState] = useState<Pass | null>(null);
  const [verifyFirst, setVerifyFirst] = useState(false);
  const setPass = useCallback((p: Pass | null) => {
    setPassState(p);
    try {
      if (p) localStorage.setItem('cw-peek', JSON.stringify(p));
      else localStorage.removeItem('cw-peek');
    } catch {
      /* no storage */
    }
  }, []);
  useEffect(() => {
    try {
      const raw = localStorage.getItem('cw-peek');
      if (raw) setPassState(JSON.parse(raw) as Pass);
    } catch {
      /* none */
    }
  }, []);
  // The Chog you play as, remembered in this browser so a reload keeps it.
  const [picked, setPickedState] = useState<number | null>(null);
  const setPicked = useCallback((id: number | null) => {
    setPickedState(id);
    try {
      if (id === null) localStorage.removeItem('chog-world:picked');
      else localStorage.setItem('chog-world:picked', String(id));
    } catch {
      /* private window: just for this visit */
    }
  }, []);
  useEffect(() => {
    try {
      const v = Number(localStorage.getItem('chog-world:picked'));
      if (Number.isInteger(v) && v > 0) setPickedState(v);
    } catch {
      /* nothing saved */
    }
  }, []);
  const [run, setRun] = useState<Run | null>(null);
  const [chases, setChases] = useState<Chase[]>([]);
  const siren = useRef<Sound | null>(null);
  // Practice: a lock (a different gang's each time, so you meet every kind), the practice vault, then a
  // practice getaway through the city.
  const [practice, setPractice] = useState<{
    stage: 'lock' | 'vault';
    gang: GangId;
    seed: number;
    loud: boolean;
  } | null>(null);
  const [practiceRun, setPracticeRun] = useState<{
    since: number;
    until: number;
    to: string;
    /** The demo controls' chase reads like a real run home (the cash it's carrying). */
    bag?: number;
  } | null>(null);
  // Get the sound engine ready now, so the first tap anywhere switches sound on (see sound.ts).
  useEffect(() => prepareSound(), []);
  // Moments on demand, for filming (the owner's demo controls) and local testing: a practice chase home, the
  // "Got away!" banner. Practice only; nothing real moves.
  const chogRef = useRef<MyChog | null>(null);
  const demo = useRef({
    run: (bag?: number) => {
      // The same as leaving the practice vault with cash: the run bar, the police and the arrow home.
      const g = chogRef.current?.gang ?? 'mcga';
      const home = placeOf(g)!.door;
      setPracticeRun({ since: Date.now(), until: Date.now() + 40_000, to: doorOf(GANGS[g].name), bag });
      requestAnimationFrame(() => requestAnimationFrame(() => view.current?.practiceChase(home)));
    },
    stop: () => setPracticeRun(null),
    lock: () => startPracticeRef.current(),
    banner: (cash = 420) =>
      setBanner({
        id: `d${Date.now()}`,
        title: 'Got away!',
        line: `You ran ${money(cash)} home to your gang.`,
        tone: 'win',
      }),
  });
  useEffect(() => {
    if (location.hostname === 'localhost')
      (window as unknown as { __chogDemo: object }).__chogDemo = demo.current;
  }, []);
  // ?film=1: the city without buttons, map or cards, for a video (H brings them back); the owner also gets
  // the demo controls.
  const [film, setFilm] = useState(false);
  const [hudOff, setHudOff] = useState(true);
  const [hauntDemo, setHauntDemo] = useState(false);
  const [directorOff, setDirectorOff] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(location.search).get('film') !== '1') return;
    setFilm(true);
    const key = (e: KeyboardEvent) => {
      if (e.repeat || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      // H: the game's buttons and cards; B: the demo controls bar.
      if (e.code === 'KeyH') setHudOff((h) => !h);
      if (e.code === 'KeyB') setDirectorOff((d) => !d);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  const clean = film && hudOff;
  const [probe, setProbe] = useState(false);
  useEffect(() => setProbe(new URLSearchParams(location.search).get('vp') === '1'), []);
  // Filming: the owner's wallet pays 1 $CHOG for bail, a poster or a banner (the server checks it's the owner).
  const burnsShown = useMemo(
    () =>
      city?.burns && film && me?.admin
        ? { ...city.burns, prices: { bail: 1, poster: 1, banner: 1 } }
        : city?.burns,
    [city?.burns, film, me?.admin],
  );
  const startPracticeRef = useRef(() => {});
  const startPractice = () => {
    const pool = GANG_IDS.filter((g) => g !== chog?.gang);
    setPractice({
      stage: 'lock',
      gang: pool[Math.floor(Math.random() * pool.length)]!,
      seed: Math.floor(Math.random() * 1e9),
      loud: false,
    });
  };
  startPracticeRef.current = startPractice;
  // A first visit: a welcome, and the gold arrow to the practice warehouse until you've tried a robbery there.
  const [practiced, setPracticed] = useState(true);
  useEffect(() => {
    let done = true;
    try {
      done = localStorage.getItem('cw-practiced') === '1';
    } catch {
      /* no storage: no guide */
    }
    setPracticed(done);
    if (done) return;
    const t = setTimeout(
      () =>
        setBanner({
          id: 'welcome',
          title: 'Try a practice robbery',
          line: 'Follow the gold arrow to the practice vault. No wallet needed.',
          tone: 'win',
        }),
      1500,
    );
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!practice || practiced) return;
    setPracticed(true);
    try {
      localStorage.setItem('cw-practiced', '1');
    } catch {
      /* no storage */
    }
  }, [practice, practiced]);
  /** The door you're standing at, and whether its card is open. */
  const [door, setDoor] = useState<Place | null>(null);
  const [doorOpen, setDoorOpen] = useState(false);
  const [area, setArea] = useState('plaza');
  const [mapOpen, setMapOpen] = useState(false);
  const [emoteOpen, setEmoteOpen] = useState(false);
  // The chat: every message the live server sent, whether the window is open, and what's unread.
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatRefused, setChatRefused] = useState<string | null>(null);
  // The last message read, kept on this device so a reload doesn't show old messages as new.
  const [chatSeen, setChatSeen] = useState(() => {
    try {
      return Number(localStorage.getItem('cw-chat-seen')) || 0;
    } catch {
      return 0;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('cw-chat-seen', String(chatSeen));
    } catch {
      /* private window: only this visit remembers */
    }
  }, [chatSeen]);
  // Back from a phone wallet with it connected but the login not signed yet: pick up where it stopped.
  useEffect(() => {
    if (me && !me.address && hasWalletConnectSession()) setSheet((s) => s ?? 'connect');
  }, [me]);
  const chatOpenRef = useRef(false);
  // Phone-size screen: the action buttons go in one row and make room for the chat.
  const [small, setSmall] = useState(false);
  useEffect(() => {
    const m = matchMedia('(max-width: 639px)');
    const on = () => setSmall(m.matches);
    on();
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  chatOpenRef.current = chatOpen;
  useEffect(() => {
    const last = chat.at(-1)?.id ?? 0;
    if (chatOpen) setChatSeen((s) => Math.max(s, last));
    // The chat was cleared since (its numbers start again from 1): what's there now is all new.
    else if (chat.length) setChatSeen((s) => (s > last ? 0 : s));
  }, [chatOpen, chat]);
  const [banner, setBanner] = useState<BannerData | null>(null);
  const [boardTab, setBoardTab] = useState<'gangs' | 'hits'>('gangs');
  /** Defending your gang's vault, or watching a raid, live. */
  const [raidView, setRaidView] = useState<{
    link: RaidLink;
    role: 'defend' | 'watch';
    target: GangId;
  } | null>(null);
  const [, setRaidSeen] = useState(0);
  useEffect(() => {
    if (!raidView) return;
    const stop = raidView.link.listen(() => setRaidSeen((n) => n + 1));
    return () => {
      stop();
    };
  }, [raidView]);
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
  /** A $CHOG burn went through: fresh posters, banners and jail time. */
  const burned = useCallback(() => {
    void loadCity();
    void loadMe();
  }, [loadCity, loadMe]);

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
        run: e.run,
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
  // An event on now (the election, Halloween): its banner once a day, a moment after you arrive.
  const eventKey = city?.events?.map((e) => e.key).join(',') ?? '';
  useEffect(() => {
    const events = city?.events ?? [];
    const day = new Date().toISOString().slice(0, 10);
    const fresh = events.find((e) => {
      try {
        return localStorage.getItem(`cw-event-${e.key}`) !== day;
      } catch {
        return false;
      }
    });
    if (!fresh) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(`cw-event-${fresh.key}`, day);
      } catch {
        /* no storage */
      }
      setBanner({ id: `event-${fresh.key}`, title: fresh.title, line: fresh.line, tone: 'win' });
    }, 2500);
    return () => clearTimeout(t);
    // Once per set of events, not on every city refresh.
  }, [eventKey]);

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
  chogRef.current = chog;
  const revenge = chog?.gang ? (me?.revenge[chog.gang] ?? []) : [];
  const peekChog =
    !me?.address && pass ? (pass.chogs.find((c) => c.id === pass.picked) ?? pass.chogs[0] ?? null) : null;
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
        banner: !!city?.burns.banners.some((b) => b.gang === v.gang && b.until > now),
      };
    });
    return out;
  }, [board, chog?.gang, alarms, now, city?.burns]);
  // Halloween week, or ?halloween=1 to see it early: the ghosts are the Skulls' and Radioactive's own faces.
  const haunt = useMemo(() => {
    let preview = false;
    try {
      preview = new URLSearchParams(window.location.search).get('halloween') === '1';
    } catch {
      /* not in a browser */
    }
    const on = preview || hauntDemo || !!city?.events?.some((e) => e.key.startsWith('halloween'));
    if (!on) return null;
    const ids = (board?.board ?? [])
      .filter((v) => v.gang === 'skulls' || v.gang === 'radioactive')
      .flatMap((v) => v.guards);
    return ids.length ? ids : null;
  }, [city?.events, board, hauntDemo]);
  const screen = useMemo(
    () => ({
      lines: (board?.board ?? [])
        .slice(0, 3)
        .map((v) => ({ name: GANGS[v.gang].name, cash: v.cash, color: GANG_COLOR[v.gang].bg })),
      burned: city?.burns.burned ?? 0,
      events: city?.events?.map((e) => e.screen),
    }),
    [board, city?.burns.burned, city?.events],
  );
  const meLook = useMemo(
    () =>
      chog
        ? {
            chog: chog.id,
            jail: chog.jailedUntil,
            name: chog.name,
            gang: chog.gang,
            color: chog.gang ? GANG_COLOR[chog.gang].bg : GUEST.color,
            ink: chog.gang ? GANG_COLOR[chog.gang].fg : GUEST.ink,
          }
        : peekChog
          ? { chog: peekChog.id, name: peekChog.name, jail: null, ...GUEST, unverified: true }
          : { chog: null, name: 'Guest', jail: null, ...GUEST },
    [chog, peekChog],
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
      // Already picked (another tab, or a slow first try): just show what it is now.
      await loadMe();
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
      const d = await post<{ run: Run; pass?: string }>('/api/heist/breakout', { chogId: chog.id, prisoner });
      setRun({ ...d.run, link: d.pass ? new RaidLink({ t: 'raid', pass: d.pass }) : undefined });
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  /** Jump into a raid on your gang's vault as a guard. */
  async function defend(r: Robbing) {
    if (!chog || !r.run) return;
    setBusy('defend-raid');
    setNotice(null);
    try {
      const d = await post<{ pass: string }>('/api/raid/join', { runId: r.run, chogId: chog.id });
      setRaid(null);
      setRaidView({ link: new RaidLink({ t: 'raid', pass: d.pass }), role: 'defend', target: r.target });
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function watch(r: Robbing) {
    if (!r.run) return;
    setRaidView({ link: new RaidLink({ t: 'watch', run: r.run }), role: 'watch', target: r.target });
  }

  async function rob(target: GangId) {
    if (!chog) return;
    setBusy(target);
    setNotice(null);
    try {
      const d = await post<{ run: Run }>('/api/heist/start', { chogId: chog.id, target });
      setRun({ ...d.run, stage: 'lock' });
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  // Getaways: the siren plays while you carry a bag, and the end of any chase you're part of gets a banner.
  const chasesRef = useRef<Chase[]>([]);
  if (chases.length) chasesRef.current = chases;
  const myChase = chog ? chases.find((c) => c.chog === chog.id) : undefined;
  // The police cars bring their own siren now (city-view); the vault's alarm stays in the vault.
  useEffect(() => () => siren.current?.alarmOff(), []);
  const chaseEnded = (e: ChaseEnd) => {
    const c = chasesRef.current.find((x) => x.run === e.run);
    const myGang = chog?.gang;
    const mine = chog && e.chog === chog.id;
    view.current?.chaseAfter(null);
    if (mine) {
      siren.current?.alarmOff();
      if (e.outcome === 'home') siren.current?.escaped();
      else siren.current?.busted();
      setBanner(
        e.outcome === 'home'
          ? {
              id: `home${e.run}`,
              title: 'Home free!',
              line: `${money(e.bag)} landed in ${myGang ? possessive(GANGS[myGang].name) : 'your gang’s'} vault.`,
              chog: e.chog,
              tone: 'win',
            }
          : {
              id: `caught${e.run}`,
              title: 'Caught!',
              line:
                e.who === 'gang'
                  ? `They tagged you and took the bag back. ${money(BUST_FINE)} fine, 30 minutes in jail.`
                  : e.who === 'time'
                    ? `The police closed in. The bag went back: ${money(BUST_FINE)} fine, 30 minutes in jail.`
                    : `The police got you. The bag went back: ${money(BUST_FINE)} fine, 30 minutes in jail.`,
              chog: e.by ?? e.chog,
              tone: 'lose',
            },
      );
      void loadMe();
      void loadCity();
    } else if (chog && e.by === chog.id) {
      setBanner({
        id: `tag${e.run}`,
        title: 'Bag back!',
        line: `You caught them and took ${money(e.bag)} back to the vault.`,
        chog: e.chog,
        tone: 'win',
      });
      void loadMe();
    } else if (c && myGang && c.from === myGang) {
      setBanner(
        e.outcome === 'home'
          ? {
              id: `gone${e.run}`,
              title: 'They got away',
              line: `${c.name} made it home with ${money(e.bag)} of yours.`,
              chog: e.chog,
              tone: 'lose',
            }
          : {
              id: `saved${e.run}`,
              title: 'Bag back!',
              line: `${c.name} got caught. ${money(e.bag)} is back in your vault.`,
              chog: e.chog,
              tone: 'win',
            },
      );
    }
    void loadBoard();
  };
  // The getaway clock needs to tick faster than the city's once-a-second clock.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!chases.length && !practiceRun) return;
    const t = setInterval(() => setTick((n) => n + 1), 250);
    return () => clearInterval(t);
  }, [chases.length, practiceRun]);

  // ---------- heads-up display ----------
  const myRow = chog?.gang ? board?.board.find((v) => v.gang === chog.gang) : undefined;
  const myRank = myRow && board ? board.board.indexOf(myRow) + 1 : 0;
  const walk = (id: string) => () => view.current?.walkTo(id);
  const duties: Duty[] = [];
  if (!me?.address && peekChog) {
    duties.push(
      {
        key: 'verify',
        label: 'Verify to rob for real',
        sub: `Practising as ${peekChog.name}`,
        onGo: () => {
          setVerifyFirst(true);
          setSheet('connect');
        },
      },
      { key: 'practice', label: 'Try the practice vault', onGo: walk('training') },
    );
  } else if (!me?.address) {
    duties.push(
      {
        key: 'connect',
        label: 'Play as your Chog',
        sub: 'Just your wallet address, no signing',
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
        sub: `Out in ${formatLeft(chog.jailedUntil! - now)}, or bail out with $CHOG`,
        onGo: () => setSheet('me'),
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
    // Revenge you've already taken stays on the list, ticked, after the ones still to do.
    const owed = revenge.filter((r) => !hit.includes(r));
    for (const g of [...owed, ...revenge.filter((r) => hit.includes(r))].slice(0, 2)) {
      const done = hit.includes(g);
      duties.push({
        key: `rev${g}`,
        label: done ? `Got revenge on ${GANGS[g].name}` : `Hit back at ${GANGS[g].name}`,
        sub: done ? undefined : 'They robbed you: revenge pays 25% more',
        done,
        onGo: done || jailedNow ? undefined : walk(g),
      });
    }
    const mates = (city?.jailed ?? []).filter((j) => j.gang === gang && j.id !== chog.id && j.until > now);
    if (mates.length)
      duties.push({
        key: 'free',
        label: `Free ${mates[0]!.name} from jail`,
        sub: mates.length > 1 ? `${mates.length} gang-mates locked up` : undefined,
        onGo: jailedNow ? undefined : walk('jail'),
      });
    if (myRow) {
      // A vault rich enough for Fortress has nothing left to buy, so that counts as guarded too.
      const top = myRow.tier >= DEFENCE.length - 1;
      const guarded = top || (!!myRow.boughtUntil && myRow.boughtUntil > now);
      duties.push({
        key: 'guard',
        label: guarded ? 'Guards on duty' : 'Guard your vault',
        sub:
          top && !myRow.boughtUntil
            ? 'Fortress: your cash keeps it at the top'
            : `Defence: ${DEFENCE[myRow.tier]}`,
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

  // Keys: E / Space use a door, G gangs, M map, T emotes, 1-8 an emote, Esc closes things.
  const keyState = useRef({ door, doorOpen, sheet, peek, mapOpen, inHeist: !!run || !!practice });
  keyState.current = { door, doorOpen, sheet, peek, mapOpen, inHeist: !!run || !!practice };
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
      if ((e.code === 'KeyE' || e.code === 'Space') && st.door && !st.doorOpen) {
        e.preventDefault();
        return setDoorOpen(true);
      }
      if (e.code === 'Enter' && el?.tagName !== 'BUTTON') {
        e.preventDefault();
        return setChatOpen(true);
      }
      if (e.code === 'KeyG') return setSheet('gangs');
      if (e.code === 'KeyT') return setEmoteOpen((o) => !o);
      const i = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8'].indexOf(
        e.code,
      );
      if (i >= 0) {
        view.current?.emote(EMOTES[i]!);
        setEmoteOpen(false);
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  const backTo = (place: string) => {
    run?.link?.close();
    raidView?.link.close();
    setRaidView(null);
    setRun(null);
    setPractice(null);
    // The door's card was still open under the vault: close it, or it pops up over you as you run.
    setDoorOpen(false);
    // The city remounts after the heist; put your Chog back at the door it went in by.
    requestAnimationFrame(() => view.current?.appearAt(place));
  };

  // A robbery or practice runs over the city instead of replacing it, so the city stays connected and
  // drawn: coming out of the vault you're straight back on the street (no reconnect, no reloading).
  const heistScreen = (() => {
    if (run && chog && run.stage === 'lock') {
      const r = run;
      return (
        <LockGame
          key={r.id}
          gang={r.target}
          seed={rushSeed(r.id)}
          onDone={(inputs) => {
            post<{ loud: boolean; pass: string }>('/api/heist/lock', {
              runId: r.id,
              inputs: encodeLock(inputs),
            })
              .then((d) =>
                setRun({
                  ...r,
                  stage: 'vault',
                  loud: d.loud,
                  link: new RaidLink({ t: 'raid', pass: d.pass }),
                }),
              )
              .catch((e: unknown) => {
                setNotice(e instanceof Error ? e.message : 'Could not open the door.');
                backTo(r.target);
              });
          }}
        />
      );
    }

    if (run && chog) {
      return (
        <div className="fixed inset-0 z-50 flex flex-col bg-[#0b0918]">
          <RushGame
            key={run.id}
            mapId={run.vault}
            rules={rushRules(run.tier, !!run.prisoner, run.loud)}
            seed={rushSeed(run.id)}
            link={run.link}
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
              onLeave: (getawayPass) => {
                backTo(run.prisoner ? 'jail' : run.target);
                // Out with a bag: run it home through the city (the live server starts the chase).
                if (getawayPass) {
                  siren.current ??= new Sound();
                  siren.current.unlock();
                  requestAnimationFrame(() => view.current?.run(getawayPass));
                }
                void loadMe();
                void loadBoard();
                void loadCity();
              },
            }}
          />
        </div>
      );
    }

    if (practice?.stage === 'lock') {
      const pr = practice;
      return (
        <LockGame
          key={pr.seed}
          gang={pr.gang}
          seed={pr.seed}
          onDone={(_, quiet) => setPractice({ ...pr, stage: 'vault', loud: !quiet })}
        />
      );
    }

    if (practice && city) {
      const player = chog
        ? { id: chog.id, name: chog.name, powers: chog.powers }
        : peekChog
          ? { id: peekChog.id, name: peekChog.name, powers: peekChog.powers as PowerId[] }
          : city.practice;
      // The gang whose lock you just picked guards the practice vault too: its own faces.
      const own = board?.board.find((v) => v.gang === practice.gang)?.guards ?? [];
      const guards = own.length
        ? own.slice(0, 4).map((id) => ({ id, name: `Chog #${metadataIdFor(id)}` }))
        : city.strollers.slice(0, 4).map((s) => ({ id: s.id, name: s.name }));
      return (
        <div className="fixed inset-0 z-50 flex flex-col bg-[#0b0918]">
          <RushGame
            mapId={RUSH_BANK.id}
            rules={rushRules(1, false, practice.loud)}
            coach
            player={{ ...player, gang: chog?.gang ? GANGS[chog.gang].name : null }}
            guards={guards}
            owner={{ name: 'Practice vault', color: '#7cf0c4', ink: '#111111' }}
            onLeave={() => backTo('training')}
            onGetaway={() => {
              backTo('training');
              // Run it to your gang's door, or the fountain in the plaza if you haven't got one.
              const home = chog?.gang ? placeOf(chog.gang)!.door : { x: CITY.spawn.x, y: CITY.spawn.y - 2.2 };
              siren.current ??= new Sound();
              siren.current.unlock();
              const from = placeOf('training')!.door;
              setPracticeRun({
                since: Date.now(),
                until: Date.now() + getawayTime(from, home),
                to: chog?.gang ? doorOf(GANGS[chog.gang].name) : 'the fountain',
              });
              requestAnimationFrame(() => requestAnimationFrame(() => view.current?.practiceChase(home)));
            }}
          />
        </div>
      );
    }
    return null;
  })();
  // The music follows the scene: the vault (and its lock), the run home, or the city at night.
  const track: Track =
    heistScreen || raidView ? 'vault' : myChase || practiceRun ? 'chase' : haunt ? 'halloween' : 'city';
  useEffect(() => playMusic(track), [track]);

  // Defending or watching a raid: its own screen. Kept below every hook above, so the page runs the same hooks
  // each time (returning before the music's hook crashed the whole page when you tapped Defend).
  if (raidView) {
    const { link } = raidView;
    const st = link.setup;
    const leave = () => {
      backTo(raidView.target);
      void loadBoard();
    };
    if (!st)
      return (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#0b0918] p-6 text-center text-white">
          <div>
            <p className="font-display text-[25px] leading-none">
              {link.status === 'failed'
                ? 'That raid is over'
                : raidView.role === 'defend'
                  ? 'Joining the raid…'
                  : 'Finding the raid…'}
            </p>
            {link.status === 'failed' && (
              <button onClick={leave} className={cn(btn, 'mt-5 btn-gold')}>
                <span>Back to the city</span>
              </button>
            )}
          </div>
        </div>
      );
    const target = st.target as GangId;
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-[#0b0918]">
        <RushGame
          mapId={st.map}
          rules={st.rules}
          seed={st.seed}
          link={link}
          robber={{ id: st.robber.chog, name: st.robber.name }}
          player={{ id: st.robber.chog, name: st.robber.name, gang: null, powers: st.powers as PowerId[] }}
          guards={st.guards.map((id) => ({ id, name: '' }))}
          owner={{
            name: GANGS[target]?.name ?? 'The jail',
            color: GANG_COLOR[target]?.bg ?? '#ff5a4f',
            ink: GANG_COLOR[target]?.fg ?? '#111111',
          }}
          onLeave={leave}
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
    <div
      className="game-root fixed inset-x-0 top-0 overflow-hidden bg-[#07060d] text-white"
      data-film={clean ? '' : undefined}
    >
      {probe && <ViewportProbe />}
      {heistScreen && <div className="fixed inset-0 z-[70]">{heistScreen}</div>}
      {film && me?.admin && !directorOff && (
        <Director
          chasing={!!practiceRun}
          haunted={!!haunt}
          onChase={(c) => demo.current.run(c)}
          onStop={() => demo.current.stop()}
          onLock={() => demo.current.lock()}
          onBanner={(c) => demo.current.banner(c)}
          onHaunt={() => setHauntDemo((h) => !h)}
        />
      )}
      <CityView
        ref={view}
        me={meLook}
        hidden={!!heistScreen}
        strollers={city?.strollers ?? []}
        jailed={city?.jailed ?? []}
        places={looks}
        wanted={city?.burns.posters.map((p) => p.chog)}
        haunt={haunt}
        board={screen}
        paused={!!heistScreen || !!sheet || !!peek || mapOpen || (!!chog && !chog.gang)}
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
        onChase={setChases}
        onChaseEnd={chaseEnded}
        onChat={(all, fresh, refused) => {
          setChat([...all]);
          setChatRefused(refused ?? null);
          if (fresh && chatOpenRef.current) setChatSeen(fresh.id);
        }}
        guide={practiced || clean ? null : placeOf('training')!.door}
        onPracticeEnd={(outcome) => {
          setPracticeRun(null);
          // A guest who just got the bag home: now the real thing needs a Chog.
          if (outcome === 'home' && !me?.address) setTimeout(() => setSheet('connect'), 3500);
          siren.current?.alarmOff();
          if (outcome === 'home') siren.current?.escaped();
          else siren.current?.busted();
          setBanner(
            outcome === 'home'
              ? {
                  id: `ph${Date.now()}`,
                  title: 'Got away!',
                  line: 'That’s the whole robbery: break in, grab the cash, run it home. Now try it for real.',
                  tone: 'win',
                }
              : {
                  id: `pc${Date.now()}`,
                  title: outcome === 'time' ? 'Too slow!' : 'Caught!',
                  line: 'In a real robbery the bag goes back and you sit in jail. Try again at the practice vault.',
                  tone: 'lose',
                },
          );
        }}
      />

      {/* Top left: who you are and today's jobs */}
      <div
        className={cn(
          'film-hide pointer-events-none absolute left-3 top-[max(0.75rem,env(safe-area-inset-top))] z-20 flex flex-col items-start gap-2',
          (practiceRun || myChase) && 'max-sm:hidden',
        )}
      >
        <RoleCard
          chog={chog?.id ?? peekChog?.id ?? null}
          name={chog?.name ?? peekChog?.name ?? 'Guest'}
          gang={chog?.gang ? GANGS[chog.gang].name : peekChog ? 'Practice only · not verified' : null}
          color={meLook.color}
          ink={meLook.ink}
          vault={myRow ? `Vault ${money(myRow.cash)} · #${myRank} of ${board?.board.length ?? 0}` : undefined}
          duties={duties}
          footer={board && chog?.gang ? `New day in ${formatLeft(board.resetAt - now)}` : undefined}
          onPortrait={() => setSheet(me?.address ? 'me' : 'connect')}
        />
      </div>

      {/* Top right: the minimap */}
      <div className="film-hide pointer-events-none absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-20 flex items-start gap-2">
        {!me?.address && (
          <div className="hidden sm:block">
            <button
              onClick={() => setSheet('connect')}
              className={cn(btn, 'pointer-events-auto btn-sm btn-gold')}
            >
              <span>{peekChog ? 'Verify to rob' : 'Play as my Chog'}</span>
            </button>
          </div>
        )}
        {/* The music button sits beside the map; on a phone, under it, clear of your card. */}
        <div className="max-sm:hidden">
          <MusicButton />
        </div>
        <div className="flex flex-col items-end gap-2">
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
          <div className="sm:hidden">
            <MusicButton />
          </div>
        </div>
      </div>

      {/* Your run, other getaways and banners. On a phone they live along the top edge, out of the middle of
          the screen where your Chog is: your run takes the place of your card, banners drop in over the top like
          a notification. Bigger screens have them at the bottom middle, and at the top on a wide one. */}
      {(() => {
        const run = practiceRun
          ? {
              line:
                practiceRun.bag !== undefined
                  ? `${money(practiceRun.bag)} to ${practiceRun.to}. Dodge the police.`
                  : `Practice: get to ${practiceRun.to}. Dodge the police.`,
              since: practiceRun.since,
              until: practiceRun.until,
            }
          : myChase
            ? {
                line: `${money(myChase.bag)} to ${doorOf(GANGS[myChase.home].name)}. Dodge the police.`,
                since: myChase.since,
                until: myChase.until,
                go: myChase.go ?? null,
              }
            : null;
        const others = chases
          .filter((c) => c !== myChase && ((chog?.gang && c.from === chog.gang) || chases.length < 3))
          .sort((a, b) => Number(b.from === chog?.gang) - Number(a.from === chog?.gang));
        const chaseBar = (c: Chase) => (
          <ChaseBar
            key={c.run}
            c={c}
            ours={!!chog?.gang && c.from === chog.gang}
            canChase={!!chog && !jailedNow}
            onChase={() => {
              setDoorOpen(false);
              setSheet(null);
              view.current?.chaseAfter(c.id);
            }}
          />
        );
        const shown: BannerData | null = raid
          ? {
              id: `raid${raid.since}`,
              title: 'Raid!',
              line:
                raid.run && chog && !jailedNow
                  ? `${GANGS[raid.gang].name} ${verb(raid.gang)} robbing your vault. Tap to jump in and catch them!`
                  : `${GANGS[raid.gang].name} ${verb(raid.gang)} robbing your vault. Tap to go there.`,
              chog: raid.chog,
              tone: 'alarm',
            }
          : banner;
        const tapBanner = () => {
          if (raid) {
            if (raid.run && chog && !jailedNow) void defend(raid);
            else view.current?.walkTo(raid.target);
            setRaid(null);
          } else setBanner(null);
        };
        return (
          <>
            {/* Phone */}
            <div
              className={cn(
                'pointer-events-none absolute left-3 right-[112px] z-30 flex flex-col gap-2 sm:hidden',
                run ? 'top-[max(12px,env(safe-area-inset-top))]' : 'top-[84px]',
              )}
            >
              {run && <RunBar {...run} />}
              {others.slice(0, 1).map(chaseBar)}
            </div>
            {shown && (
              <div className="pointer-events-none absolute inset-x-3 top-[max(12px,env(safe-area-inset-top))] z-40 flex justify-center sm:hidden">
                <Banner b={shown} onClick={tapBanner} />
              </div>
            )}
            {/* Tablet and laptop: bottom middle; wide screens: top middle */}
            <div className="pointer-events-none absolute inset-x-0 bottom-6 z-30 hidden flex-col items-center gap-2 px-3 sm:flex xl:bottom-auto xl:top-[96px]">
              {shown && (
                <div className="xl:hidden">
                  <Banner b={shown} onClick={tapBanner} />
                </div>
              )}
              {run && <RunBar {...run} />}
              {others.slice(0, 2).map(chaseBar)}
            </div>
            {shown && (
              <div className="pointer-events-none absolute inset-x-0 top-4 z-30 hidden justify-center px-3 xl:flex">
                <Banner b={shown} onClick={tapBanner} />
              </div>
            )}
          </>
        );
      })()}

      {/* Bottom left: the chat (closed, the newest city messages float up for a moment) */}
      {!anyCard && (
        <div
          className={cn(
            'film-hide pointer-events-none absolute left-3 z-20 sm:bottom-5 sm:left-5',
            // On a phone: closed, the floating messages sit above the button row; open, it's a sheet.
            chatOpen
              ? 'bottom-[max(8px,env(safe-area-inset-bottom))] max-sm:right-3'
              : 'bottom-[104px] sm:bottom-5',
          )}
        >
          <ChatPanel
            open={chatOpen}
            onOpen={() => setChatOpen(true)}
            onClose={() => {
              setChatOpen(false);
              setChatSeen(chat.at(-1)?.id ?? 0);
            }}
            msgs={chat}
            me={{ chog: chog?.id ?? null, gang: chog?.gang ?? null }}
            refused={chatRefused}
            onSend={(room, text) => view.current?.say(room, text)}
            onConnect={() => setSheet('connect')}
            onPerson={(w) => setPeek({ ...w, player: true })}
          />
        </div>
      )}

      {/* Bottom right: action buttons */}
      {!anyCard && !(chatOpen && small) && (
        <div className="film-hide pointer-events-none absolute bottom-[max(14px,env(safe-area-inset-bottom))] right-3 z-20 flex items-end gap-2.5 sm:bottom-5 sm:right-5 sm:gap-4">
          {emoteOpen && (
            <div className="glass-strong pointer-events-auto absolute bottom-[calc(100%+14px)] right-0 z-30 w-max origin-bottom-right max-sm:bottom-[178px] animate-[pop-in_340ms_cubic-bezier(.2,.9,.3,1.2)] rounded-[26px] p-2">
              <div className="grid grid-cols-4 gap-1">
                {EMOTES.map((k, i) => (
                  <button
                    key={k}
                    {...tap(() => view.current?.emote(k))}
                    // The panel closes when the finger lifts, not under it (a phone would hand that finger's lift
                    // to whatever is underneath).
                    onPointerUp={() => setTimeout(() => setEmoteOpen(false), 0)}
                    onPointerCancel={() => setTimeout(() => setEmoteOpen(false), 0)}
                    onKeyUp={(e) => (e.key === 'Enter' || e.key === ' ') && setEmoteOpen(false)}
                    aria-label={EMOTE_LABEL[k]}
                    title={`${EMOTE_LABEL[k]} (${i + 1})`}
                    className="press group relative flex w-[66px] flex-col items-center gap-1 rounded-[18px] px-1 pb-1.5 pt-2 hover:bg-white/[0.08]"
                    style={{ animation: `pop-in 360ms ${i * 28}ms cubic-bezier(.2,.9,.3,1.3) both` }}
                  >
                    <img
                      src={`/emotes/${k}.webp`}
                      alt=""
                      className="h-11 w-11 drop-shadow-[0_4px_8px_rgba(0,0,0,0.45)] transition-transform duration-300 ease-[cubic-bezier(.2,.9,.3,1.6)] group-hover:-translate-y-1 group-hover:scale-110"
                    />
                    <span className="text-[11px] font-medium text-label-2">{EMOTE_LABEL[k]}</span>
                    <span className="absolute right-1.5 top-1.5 text-[10px] font-semibold text-label-3">
                      {i + 1}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {small ? (
            <PhoneControls
              use={{ ...useLook, ready: !!door }}
              onUse={openDoor}
              unread={chat.filter((m) => m.id > chatSeen && m.chog !== chog?.id).length}
              onChat={() => setChatOpen((o) => !o)}
              onEmote={() => setEmoteOpen((o) => !o)}
              onMap={() => setMapOpen(true)}
              onGangs={() => setSheet('gangs')}
            />
          ) : (
            <>
              <div className="relative flex items-end gap-2 sm:flex-col sm:items-center sm:gap-3">
                <ChatButton
                  unread={chat.filter((m) => m.id > chatSeen && m.chog !== chog?.id).length}
                  onClick={() => setChatOpen((o) => !o)}
                />
                <EmoteButton onClick={() => setEmoteOpen((o) => !o)} />
              </div>
              <div className="flex items-end gap-2 sm:flex-col sm:items-center sm:gap-3">
                <MapButton onClick={() => setMapOpen(true)} />
                <GangsButton onClick={() => setSheet('gangs')} />
              </div>
              <RoundButton big {...useLook} hotkey="E" disabled={!door} lit={!!door} onClick={openDoor} />
            </>
          )}
        </div>
      )}

      {notice && (
        <div className="absolute inset-x-0 top-16 z-40 flex justify-center px-4">
          <button
            onClick={() => setNotice(null)}
            role="alert"
            className="rounded-[8px] bg-jail px-3 py-2 text-[14px] font-semibold"
          >
            {notice}
          </button>
        </div>
      )}

      {/* At a door */}
      {/* No building cards while you're running a bag home: nothing should cover you on a getaway. */}
      {door && doorOpen && !sheet && !peek && !practiceRun && !myChase && (
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
            onPractice={startPractice}
            onConnect={() => setSheet('connect')}
            onDefend={(l) => void defendVault(l)}
            onBreakOut={(id) => void breakOut(id)}
            onWatch={(r) => watch(r)}
            onDefendRaid={(r) => void defend(r)}
            info={gangInfo && gangInfo.gang === door.gang ? gangInfo.data : undefined}
            robbing={door.gang ? alarms[door.gang] : undefined}
            burns={burnsShown}
            address={me?.address ?? null}
            onBurned={burned}
            onPoster={(who) => {
              setDoorOpen(false);
              setPeek(who);
            }}
            myChogs={chogs}
            onSwitch={(id) => setPicked(id)}
          />
        </Card>
      )}

      {/* First visit */}
      {welcome && me && !me.address && !(door && doorOpen) && !sheet && !peek && (
        <Card onClose={closeWelcome}>
          <h1 className="font-display text-[24px] leading-[0.95]">Welcome to Grand Theft Chog</h1>
          <p className="mt-2 text-[15px] leading-snug text-white/80">
            Every gang has a building with a vault full of cash. Walk your Chog to a rival’s door to rob it,
            and bring the cash home.
          </p>
          <p className="mt-2 text-[14px] text-white/60">
            <span className="sm:hidden">Drag anywhere to walk. </span>
            <span className="max-sm:hidden">
              Walk with the arrow keys or WASD, or tap where you want to go.{' '}
            </span>
            No wallet? Follow the gold arrow to the practice vault.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button onClick={() => setSheet('connect')} className={cn(btn, 'btn-gold whitespace-nowrap')}>
              <span>Play as my Chog</span>
            </button>
            <button onClick={closeWelcome} className={cn(btn, 'btn-glass')}>
              <span>Look around</span>
            </button>
          </div>
        </Card>
      )}

      {/* A Chog's gang is picked once */}
      {chog && !chog.gang && !sheet && (
        <Card>
          <h2 className="font-display text-[21px] leading-none">Pick {possessive(chog.name)} gang</h2>
          <p className="mt-1.5 text-[14px] text-white/70">
            Its gang comes from what it wears. Pick carefully: a Chog reps one gang for good.
          </p>
          <div className={cn('mt-4 grid gap-2.5', chog.gangChoices.length > 1 && 'grid-cols-2')}>
            {chog.gangChoices.map((g, i) => (
              <button
                key={g}
                disabled={busy === 'gang'}
                onClick={() => void pickGang(g)}
                className="press group relative overflow-hidden rounded-[22px] p-3 text-left ring-1 ring-inset ring-white/10 hover:ring-white/30 disabled:opacity-50"
                style={{
                  background: `linear-gradient(165deg, ${GANG_COLOR[g].bg}66, ${GANG_COLOR[g].bg}14)`,
                  animation: `glass-in 420ms ${i * 60}ms cubic-bezier(.2,.9,.3,1) both`,
                }}
              >
                <img
                  src={`/art/city/gang-${g}.webp`}
                  alt=""
                  className="mx-auto h-[74px] w-full object-contain drop-shadow-[0_8px_12px_rgba(0,0,0,0.45)] transition-transform duration-500 ease-[cubic-bezier(.2,.9,.3,1.2)] group-hover:scale-105"
                />
                <span className="mt-2 block font-display text-[17px] leading-tight">{GANGS[g].name}</span>
                <span className="mt-0.5 block truncate text-[12px] text-label-2">
                  {(chog.gangWhy?.[g] ?? []).map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join(', ')}
                </span>
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
          <Peek
            who={peek}
            jailed={city?.jailed ?? []}
            now={now}
            burns={burnsShown}
            address={me?.address ?? null}
            mine={!!me?.chogs.some((c) => c.id === peek.chog)}
            onBurned={burned}
          />
        </Card>
      )}

      {sheet === 'connect' && (
        <Sheet
          title={verifyFirst ? 'Verify your wallet' : 'Play as your Chog'}
          onClose={() => {
            setSheet(null);
            setVerifyFirst(false);
          }}
        >
          <ChogPass
            peek={pass}
            verifyFirst={verifyFirst}
            onPeek={(p) => {
              setPass(p);
              setSheet(null);
              setVerifyFirst(false);
              closeWelcome();
            }}
            onLoggedIn={() => {
              setSheet(null);
              setVerifyFirst(false);
              setPass(null);
              closeWelcome();
              void loadMe();
            }}
          />
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
                  <img src={chogImage(c.id, 96)} alt="" className="h-11 w-11 rounded-full" />
                </button>
              ))}
            </div>
          )}
          {chog && (
            <ChogCard
              chog={chog}
              now={now}
              address={me?.address ?? null}
              burns={burnsShown}
              onBurned={burned}
            />
          )}
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
        <Board onClose={() => setSheet(null)}>
          <div className="flex flex-wrap items-end justify-between gap-2 pr-12">
            <h2 className="font-display text-[25px] leading-none sm:text-[31px]">Gang board</h2>
            <div className="relative grid grid-cols-2 rounded-[11px] bg-fill-2 p-[3px]">
              <span
                className="absolute bottom-[3px] left-[3px] top-[3px] w-[calc(50%-3px)] rounded-[9px] bg-white/[0.16] shadow-[0_3px_8px_rgba(0,0,0,0.25)] transition-transform duration-300 ease-[cubic-bezier(.2,.9,.3,1.1)]"
                style={{ transform: `translateX(${boardTab === 'hits' ? '100%' : '0'})` }}
              />
              {(['gangs', 'hits'] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setBoardTab(k)}
                  className={cn(
                    'relative h-8 px-4 text-[14px] font-semibold transition-colors',
                    boardTab === k ? 'text-white' : 'text-label-2 hover:text-white',
                  )}
                >
                  {k === 'gangs' ? 'Richest' : 'Latest hits'}
                </button>
              ))}
            </div>
          </div>
          {board && (
            <p className="mt-1 text-[13px] text-white/60">
              Hits reset in {formatLeft(board.resetAt - now)}. Tap a gang to walk to its building.
            </p>
          )}
          {boardTab === 'gangs' ? (
            <ol className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {(board?.board ?? []).map((v, i) => {
                const c = GANG_COLOR[v.gang];
                const mine = chog?.gang === v.gang;
                const hit = chog?.hitToday.includes(v.gang);
                return (
                  <li
                    key={v.gang}
                    style={{ animation: `glass-in 420ms ${i * 22}ms cubic-bezier(.2,.9,.3,1) both` }}
                  >
                    <button
                      onClick={() => {
                        setSheet(null);
                        view.current?.walkTo(v.gang);
                      }}
                      className={cn(
                        'press group relative flex h-full w-full flex-col overflow-hidden rounded-[22px] text-left ring-1 ring-inset ring-white/[0.08] transition-shadow hover:ring-white/20',
                        mine && 'ring-2 ring-sys-pink hover:ring-sys-pink',
                      )}
                      style={{
                        background: `linear-gradient(170deg, ${c.bg}55 0%, ${c.bg}18 45%, rgba(255,255,255,0.03) 100%)`,
                      }}
                    >
                      {/* The gang's building, as the card's picture. */}
                      <span className="relative block h-[88px] px-3 pt-3">
                        <img
                          src={`/art/city/gang-${v.gang}.webp`}
                          alt=""
                          className="h-full w-full object-contain object-bottom drop-shadow-[0_8px_14px_rgba(0,0,0,0.45)] transition-transform duration-500 ease-[cubic-bezier(.2,.9,.3,1.2)] group-hover:scale-[1.05]"
                          onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
                        />
                        <span
                          className={cn(
                            'absolute left-2.5 top-2.5 grid h-7 min-w-7 place-items-center rounded-full px-1.5 text-[13px] font-bold tabular-nums shadow-[0_2px_8px_rgba(0,0,0,0.4)]',
                            i === 0 ? 'bg-sys-gold text-black' : 'bg-black/55 text-white backdrop-blur-md',
                          )}
                        >
                          {i + 1}
                        </span>
                      </span>
                      <span className="flex flex-1 flex-col px-3 pb-3 pt-2">
                        <span className="flex items-center gap-1.5">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.bg }} />
                          <span className="min-w-0 truncate font-display text-[16px] leading-tight">
                            {GANGS[v.gang].name}
                          </span>
                        </span>
                        <span className="mt-1 font-display text-[22px] leading-none tabular-nums text-sys-gold">
                          {money(v.cash)}
                        </span>
                        <span className="mt-2 flex items-center gap-2">
                          <span className="flex -space-x-2">
                            {v.guards.slice(0, 4).map((id) => (
                              <img
                                key={id}
                                src={chogImage(id, 96)}
                                alt=""
                                className="h-7 w-7 rounded-full object-cover ring-2 ring-[#1a1828]"
                              />
                            ))}
                          </span>
                          <span className="text-[12px] text-label-2">
                            {plural(v.members, 'member')} · {DEFENCE[v.tier]}
                          </span>
                        </span>
                        <span className="mt-2 flex flex-wrap gap-1">
                          {mine && (
                            <span className="rounded-full bg-sys-pink px-2 py-0.5 text-[11px] font-semibold text-white">
                              Your gang
                            </span>
                          )}
                          {revenge.includes(v.gang) && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-sys-orange/20 px-2 py-0.5 text-[11px] font-semibold text-sys-orange">
                              <ArrowBendUpLeft size={11} weight="bold" /> Revenge
                            </span>
                          )}
                          {hit && (
                            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-label-2">
                              Hit today
                            </span>
                          )}
                          {alarms[v.gang] && alarms[v.gang]!.since > now - 180_000 && (
                            <span className="animate-pulse rounded-full bg-sys-red px-2 py-0.5 text-[11px] font-semibold text-white">
                              Being robbed
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          ) : (
            <>
              {board && board.hits.length === 0 && (
                <p className="mt-4 text-[14px] text-white/60">No hits yet. Be the first.</p>
              )}
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {(board?.hits ?? []).slice(0, 20).map((h) => (
                  <li key={h.id}>
                    <Link
                      href={`/replay/${h.id}`}
                      className="press group flex items-center gap-3 rounded-[18px] bg-white/[0.05] p-2.5 text-[14px] ring-1 ring-inset ring-white/[0.06] hover:bg-white/[0.08]"
                    >
                      <img
                        src={chogImage(h.chogId, 96)}
                        alt=""
                        className="h-12 w-12 shrink-0 rounded-[14px] object-cover"
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
            </>
          )}
        </Board>
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

const EMOTE_LABEL: Record<Emote, string> = {
  wave: 'Wave',
  laugh: 'Laugh',
  angry: 'Angry',
  cash: 'Money',
  cool: 'Cool',
  scream: 'Scared',
  cry: 'Cry',
  fire: 'Fire',
};

/** A card at the bottom of the screen (phones) or bottom left (wider screens). */
function Card({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
  const drag = useDragClose(onClose);
  // On a phone it's a sheet docked to the bottom edge that you pull down to close; bigger screens float it.
  return (
    <div className="absolute inset-x-0 bottom-0 z-30 sm:bottom-6 sm:left-1/2 sm:right-auto sm:w-[440px] sm:-translate-x-1/2">
      <div
        style={drag.style}
        className="glass-strong relative max-h-[72dvh] animate-[slide-up_420ms_cubic-bezier(.32,.72,0,1)] overflow-y-auto rounded-t-[30px] px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-5 text-white sm:animate-[glass-in_380ms_cubic-bezier(.2,.9,.3,1)] sm:rounded-[28px] sm:pb-5"
      >
        {onClose && (
          <div {...drag.bind} className="absolute inset-x-0 top-0 h-9 touch-none sm:hidden">
            <div className="mx-auto mt-2 h-[5px] w-9 rounded-full bg-white/25" />
          </div>
        )}
        {onClose && (
          <button
            onClick={onClose}
            className="hit press absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-fill text-label-2 hover:text-white"
            aria-label="Close"
          >
            <X size={14} weight="bold" />
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

/** A big board in the middle of the screen, like the game's meeting screen. */
function Board({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div
      className="absolute inset-0 z-40 grid animate-[fade-in_200ms] place-items-center bg-black/55 p-2 backdrop-blur-[6px] sm:p-6"
      onClick={onClose}
    >
      <section
        onClick={(e) => e.stopPropagation()}
        className="glass-strong relative max-h-full w-full max-w-[1040px] animate-[glass-in_380ms_cubic-bezier(.2,.9,.3,1)] overflow-y-auto rounded-[30px] p-4 text-white sm:p-6"
      >
        <button
          onClick={onClose}
          className="hit press absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full bg-fill text-label-2 hover:text-white"
          aria-label="Close"
        >
          <X size={14} weight="bold" />
        </button>
        {children}
      </section>
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
  const drag = useDragClose(onClose);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div
      className="absolute inset-0 z-40 flex animate-[fade-in_200ms] items-end justify-end bg-black/45 sm:items-stretch sm:p-3"
      onClick={onClose}
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        style={drag.style}
        className="glass-strong max-h-[88dvh] w-full animate-[slide-up_420ms_cubic-bezier(.32,.72,0,1)] overflow-y-auto rounded-t-[30px] px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-5 text-white sm:max-h-none sm:w-[420px] sm:animate-[glass-in_380ms_cubic-bezier(.2,.9,.3,1)] sm:rounded-[28px] sm:pb-5"
      >
        {/* The grabber and title: pull down to close, like an iOS sheet. */}
        <div {...drag.bind} className="-mx-5 -mt-5 mb-1 touch-none px-5 pt-2 sm:contents">
          <div className="mx-auto mb-3 h-[5px] w-9 rounded-full bg-white/25 sm:hidden" />
        </div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-[26px] leading-none">{title}</h2>
          <button
            onClick={onClose}
            className="hit press relative grid h-8 w-8 place-items-center rounded-full bg-fill text-label-2 hover:text-white"
            aria-label="Close"
          >
            <X size={14} weight="bold" />
          </button>
        </div>
        {children}
      </aside>
    </div>
  );
}

function ChogCard(props: {
  chog: MyChog;
  now: number;
  address: string | null;
  burns?: Burns;
  onBurned: () => void;
}) {
  const { chog, now } = props;
  return (
    <div className="rounded-[20px] bg-white/[0.05] p-3.5 ring-1 ring-inset ring-white/[0.06]">
      <div className="flex items-center gap-3">
        <img src={chogImage(chog.id, 256)} alt="" className="h-20 w-20 shrink-0 rounded-[10px]" />
        <div className="min-w-0">
          <Link
            href={`/chog/${chog.id}`}
            className="inline-flex items-center gap-1 font-display text-[18px] leading-none hover:underline"
          >
            {chog.name} <ArrowSquareOut size={16} />
          </Link>
          {chog.gang && (
            <div
              className="mt-1 inline-block rounded-[5px] px-1.5 pt-1 font-display text-[12px] leading-none"
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
      {chog.jailedUntil && chog.jailedUntil > now && props.burns && (
        <BurnButton
          kind="bail"
          chogId={chog.id}
          address={props.address}
          price={props.burns.prices.bail}
          label="Bail out now"
          className="mt-2"
          onDone={props.onBurned}
        />
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
  onWatch: (r: Robbing) => void;
  onDefendRaid: (r: Robbing) => void;
  info?: GangInfo;
  robbing?: Robbing;
  burns?: Burns;
  address: string | null;
  onBurned: () => void;
  onPoster: (who: Tapped) => void;
  myChogs: MyChog[];
  onSwitch: (id: number) => void;
}) {
  const { place, row, chog } = props;
  if (place.kind === 'training')
    return (
      <>
        <h2 className="font-display text-[21px] leading-none text-[#7cf0c4]">Practice vault</h2>
        <p className="mt-2 text-[15px] leading-snug text-white/80">
          A safe place to learn: no wallet, no jail, no real cash.
        </p>
        <button
          onClick={props.onPractice}
          className={cn(
            btn,
            'mt-4 w-full btn-gold !bg-[linear-gradient(180deg,#7cf0c4,#34c79a)] !text-[#032a1e]',
          )}
        >
          <span>Start practice</span>
        </button>
      </>
    );
  if (place.kind === 'jail') {
    const inside = props.jailed.filter((j) => j.until > props.now);
    return (
      <>
        <h2 className="font-display text-[21px] leading-none text-[#ff5a4f]">Jail</h2>
        <p className="mt-1.5 text-[14px] text-white/70">
          Chogs caught robbing sit here for 30 minutes. A free Chog of the same gang can sneak in and open the
          cell to get them out early (one try a day).
        </p>
        {chog && props.jailedNow && (
          <div className="mt-3 rounded-[20px] bg-sys-red/10 p-3.5 ring-1 ring-inset ring-sys-red/25">
            <p className="text-[15px] font-semibold">
              {chog.name} is inside: out in {formatLeft((chog.jailedUntil ?? 0) - props.now)}
            </p>
            {(() => {
              const mate = props.myChogs.find(
                (c) =>
                  c.id !== chog.id && c.gang === chog.gang && !(c.jailedUntil && c.jailedUntil > props.now),
              );
              return mate ? (
                <button
                  onClick={() => props.onSwitch(mate.id)}
                  className="btn btn-sm press btn-glass mt-2.5 w-full"
                >
                  Switch to {mate.name} and break it out
                </button>
              ) : (
                <p className="mt-1 text-[13px] leading-snug text-label-2">
                  A free gang-mate can break it out from here, or bail it out with $CHOG now.
                </p>
              );
            })()}
            {props.burns && (
              <BurnButton
                kind="bail"
                chogId={chog.id}
                address={props.address}
                price={props.burns.prices.bail}
                label="Bail out now"
                className="mt-2.5"
                onDone={props.onBurned}
              />
            )}
          </div>
        )}
        {chog?.gang && !props.jailedNow && (
          <p className="mt-3 text-[14px] leading-snug text-label-2">
            {inside.some((j) => j.gang === chog.gang && j.id !== chog.id)
              ? 'Tap Break out next to a gang-mate to sneak in.'
              : `Nobody from ${GANGS[chog.gang].name} is in here, so there's nobody for ${chog.name} to break out.`}
          </p>
        )}
        {/* Your own Chogs inside that this one can't free (another gang): say why, and offer bail. */}
        {!props.jailedNow &&
          inside
            .filter((j) => props.myChogs.some((c) => c.id === j.id) && j.gang !== chog?.gang)
            .slice(0, 2)
            .map((j) => (
              <div
                key={j.id}
                className="mt-3 rounded-[20px] bg-white/[0.05] p-3.5 ring-1 ring-inset ring-white/[0.06]"
              >
                <p className="text-[14px] leading-snug">
                  Your <strong>{j.name}</strong> is in here. Only a {GANGS[j.gang].name} Chog can break it out
                  {props.myChogs.some((c) => c.id !== j.id && c.gang === j.gang)
                    ? ': switch to one of yours.'
                    : ', or bail it out now.'}
                </p>
                {props.myChogs
                  .filter(
                    (c) =>
                      c.id !== j.id && c.gang === j.gang && !(c.jailedUntil && c.jailedUntil > props.now),
                  )
                  .slice(0, 1)
                  .map((c) => (
                    <button
                      key={c.id}
                      onClick={() => props.onSwitch(c.id)}
                      className="btn btn-sm press btn-glass mt-2.5 w-full"
                    >
                      Switch to {c.name}
                    </button>
                  ))}
                {props.burns && (
                  <BurnButton
                    kind="bail"
                    chogId={j.id}
                    address={props.address}
                    price={props.burns.prices.bail}
                    label={`Bail out ${j.name}`}
                    className="mt-2.5"
                    onDone={props.onBurned}
                  />
                )}
              </div>
            ))}
        {inside.length === 0 ? (
          <p className="mt-3 text-[15px]">Nobody inside right now.</p>
        ) : (
          <ul className="mt-3 max-h-[180px] space-y-1.5 overflow-y-auto">
            {inside.map((j) => (
              <li key={j.id} className="flex items-center gap-2 text-[14px]">
                <img src={chogImage(j.id, 96)} alt="" className="h-7 w-7 rounded-full" />
                <span className="flex-1 truncate">{j.name}</span>
                <span className="text-white/60">{formatLeft(j.until - props.now)}</span>
                {chog?.gang === j.gang && chog.id !== j.id && !props.jailedNow && (
                  <button
                    disabled={props.busy !== null}
                    onClick={() => props.onBreakOut(j.id)}
                    className="btn btn-sm press btn-primary disabled:opacity-50"
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
          className="mt-0.5 h-9 w-2.5 shrink-0 rounded-full"
          style={{ background: GANG_COLOR[gang].bg }}
        />
        <div className="min-w-0">
          <Link
            href={`/gangs/${gang}`}
            className="block truncate font-display text-[21px] leading-none hover:underline"
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
          <div className="section-label">In the vault</div>
          <div className="font-display text-[25px] leading-none text-[#ffd666] tabular-nums">
            {money(row?.cash ?? 0)}
          </div>
        </div>
        <div className="text-right">
          <div className="section-label">Guards</div>
          <div className="mt-1 flex -space-x-2">
            {(row?.guards ?? []).slice(0, 4).map((g) => (
              <img key={g} src={chogImage(g, 96)} alt="" className="h-8 w-8 rounded-full" />
            ))}
          </div>
        </div>
      </div>
      <p className="mt-2 inline-flex items-center gap-1.5 text-[13px] text-white/70">
        <ShieldCheck size={15} weight="fill" /> Defence: {DEFENCE[row?.tier ?? 0]}
      </p>
      {!mine && (
        <>
          <ol className="mt-2 grid grid-cols-3 gap-1.5 text-center text-[12px] font-semibold leading-tight">
            {[
              ['1', LOCK_NAME[lockFor(props.place.gang!)]],
              ['2', `Grab the cash (safe ${money(SAFE_BY_TIER[row?.tier ?? 0] ?? 0)})`],
              ['3', 'Run it home past the police'],
            ].map(([n, label]) => (
              <li key={n} className="rounded-[8px] bg-white/10 px-1.5 py-1.5">
                <span className="block font-display text-[13px] leading-none text-[#ffd666]">{n}</span>
                {label}
              </li>
            ))}
          </ol>
          <p className="mt-1.5 text-[12px] text-white/60">
            Caught: the cash goes back, your gang pays {money(BUST_FINE)}, and 30 min in jail.
          </p>
        </>
      )}
      {props.robbing && props.robbing.since > props.now - 180_000 && (
        <p className="mt-2 flex items-center gap-2 rounded-[14px] bg-sys-red/15 px-3 py-2 text-[13px] font-semibold text-sys-red">
          <span className="h-2 w-2 animate-pulse rounded-full bg-ink" />
          {GANGS[props.robbing.gang].name} {verb(props.robbing.gang)} {mine ? 'robbing you' : 'inside'} right
          now
        </p>
      )}
      {props.robbing && props.robbing.run && props.robbing.since > props.now - 180_000 && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          {mine && props.loggedIn && !props.jailedNow && (
            <button onClick={() => props.onDefendRaid(props.robbing!)} className={cn(btn, 'btn-primary')}>
              <span>Defend</span>
            </button>
          )}
          <button
            onClick={() => props.onWatch(props.robbing!)}
            className={cn(btn, 'btn-glass', !(mine && props.loggedIn) && 'col-span-2')}
          >
            <span>Watch live</span>
          </button>
        </div>
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
          {chog && props.burns && (
            <GangBanner
              gang={gang}
              chogId={chog.id}
              burns={props.burns}
              address={props.address}
              now={props.now}
              onDone={props.onBurned}
            />
          )}
          <HomeInfo gang={gang} info={props.info} now={props.now} onPoster={props.onPoster} />
        </>
      ) : block === 'connect' ? (
        <button onClick={props.onConnect} className={cn(btn, 'mt-4 w-full btn-gold')}>
          <span>Verify your wallet to rob it</span>
        </button>
      ) : (
        <>
          {props.revenge && !block && (
            <p className="mt-3 inline-flex items-center gap-1 rounded-full bg-sys-orange/20 px-2 py-0.5 text-[12px] font-semibold text-sys-orange">
              <ArrowBendUpLeft size={12} weight="bold" /> Revenge: they robbed you. +25%
            </p>
          )}
          <button
            disabled={!!block || props.busy !== null}
            onClick={() => props.onRob(gang)}
            className={cn(
              btn,
              'mt-3 w-full',
              block ? 'bg-white/10 text-white/50 shadow-none' : 'btn-primary',
            )}
          >
            <Vault size={20} weight="fill" />
            <span>{props.busy === gang ? 'Opening…' : 'Rob the vault'}</span>
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
    <div className="mt-3 rounded-[20px] bg-white/[0.05] p-3.5 ring-1 ring-inset ring-white/[0.06]">
      <div className="flex items-baseline justify-between gap-2">
        <div className="section-label">Add defence for 24 hours</div>
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
                className="press rounded-[14px] bg-white/[0.07] px-3 py-2.5 text-left ring-1 ring-inset ring-white/[0.06] hover:bg-white/[0.11] disabled:opacity-40"
              >
                <span className="block font-display text-[12px] leading-none">{DEFENCE[l]}</span>
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

/** Fly your gang's banner over its building for a day ($CHOG). */
function GangBanner(props: {
  gang: GangId;
  chogId: number;
  burns: Burns;
  address: string | null;
  now: number;
  onDone: () => void;
}) {
  const up = props.burns.banners.find((b) => b.gang === props.gang && b.until > props.now);
  return (
    <div className="mt-3 rounded-[20px] bg-white/[0.05] p-3.5 ring-1 ring-inset ring-white/[0.06]">
      <div className="flex items-baseline justify-between gap-2">
        <div className="section-label">Gang banner for 24 hours</div>
        {up && <div className="text-[12px] text-white/60">{formatLeft(up.until - props.now)} left</div>}
      </div>
      <p className="mt-1 text-[12px] leading-snug text-white/55">
        A big flag over {possessive(GANGS[props.gang].name)} building that the whole city sees.
      </p>
      <BurnButton
        kind="banner"
        chogId={props.chogId}
        address={props.address}
        price={props.burns.prices.banner}
        label={up ? 'Another day' : 'Fly the banner'}
        className="mt-2"
        onDone={props.onDone}
      />
    </div>
  );
}

function HomeInfo({
  gang,
  info,
  now,
  onPoster,
}: {
  gang: GangId;
  info?: GangInfo;
  now: number;
  onPoster: (who: Tapped) => void;
}) {
  if (!info) return <div className="mt-3 h-24 animate-pulse rounded-[8px] bg-white/5" />;
  const robbed = info.hits.filter((h) => h.target === gang && h.result === 'escaped').slice(0, 3);
  return (
    <div className="mt-3 grid gap-3 text-[13px]">
      <div>
        <div className="section-label">Best robbers</div>
        {info.members.length === 0 ? (
          <p className="mt-1 text-white/70">Nobody has robbed for this gang yet. Be the first.</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {info.members.slice(0, 3).map((m) => (
              <li key={m.id} className="flex items-center gap-2">
                <img src={chogImage(m.id, 96)} alt="" className="h-6 w-6 rounded-full" />
                <span className="flex-1 truncate">{m.name}</span>
                <span className="font-semibold text-[#ffd666]">{money(m.stolen)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <div className="section-label">Robbed lately</div>
        {robbed.length === 0 ? (
          <p className="mt-1 text-white/70">Nobody has got out of your vault with cash yet.</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {robbed.map((h) => (
              <li key={h.id}>
                <Link href={`/replay/${h.id}`} className="flex items-center gap-2 hover:underline">
                  <img src={chogImage(h.chogId, 96)} alt="" className="h-6 w-6 rounded-full" />
                  <span className="flex-1 truncate">
                    {GANGS[h.gang].name} took <strong className="text-[#ffd666]">{money(h.moved)}</strong>
                  </span>
                  <Play size={11} weight="fill" className="text-white/70" />
                  <span className="text-white/50">{ago(h.at, now)}</span>
                </Link>
                <button
                  onClick={() =>
                    onPoster({
                      chog: h.chogId,
                      name: `Chog #${metadataIdFor(h.chogId)}`,
                      gang: h.gang,
                      player: false,
                    })
                  }
                  className="mt-0.5 rounded-[5px] bg-[#f3e3b5] px-1.5 pt-0.5 font-display text-[12px] leading-tight text-[#c1121f]"
                >
                  Wanted poster
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Peek(props: {
  who: Tapped;
  jailed: Jailed[];
  now: number;
  burns?: Burns;
  address: string | null;
  mine: boolean;
  onBurned: () => void;
}) {
  const { who, jailed, now } = props;
  const j = jailed.find((x) => x.id === who.chog && x.until > now);
  return (
    <>
      <div className="flex items-center gap-3 pr-8">
        <img src={chogImage(who.chog, 256)} alt="" className="h-20 w-20 shrink-0 rounded-[10px]" />
        <div className="min-w-0">
          <div className="truncate font-display text-[18px] leading-none">{who.name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {who.gang && (
              <span
                className="rounded-[5px] px-1.5 pt-1 font-display text-[12px] leading-none"
                style={{ background: GANG_COLOR[who.gang].bg, color: GANG_COLOR[who.gang].fg }}
              >
                {GANGS[who.gang].name}
              </span>
            )}
            {who.player && (
              <span className="rounded-full bg-sys-green/20 px-2 py-0.5 text-[11px] font-semibold text-sys-green">
                Playing now
              </span>
            )}
          </div>
          {j && (
            <p className="mt-1 text-[13px] text-[#ff8a80]">In jail, out in {formatLeft(j.until - now)}</p>
          )}
          <Link
            href={`/chog/${who.chog}`}
            className="mt-2 flex items-center gap-1 text-[14px] font-semibold underline"
          >
            See its record <ArrowSquareOut size={14} />
          </Link>
        </div>
      </div>
      {who.gang && !props.mine && props.burns && props.address && (
        <PosterPicker chogId={who.chog} burns={props.burns} address={props.address} onDone={props.onBurned} />
      )}
    </>
  );
}

/** A getaway in progress: your own (time left, where to), one from your vault (go after them), or anyone's. */
function ChaseBar(props: { c: Chase; ours: boolean; canChase: boolean; onChase: () => void }) {
  const { c, ours } = props;
  const left = Math.max(0, Math.ceil((c.until - Date.now()) / 1000));
  return (
    <div
      className={cn(
        'glass-strong pointer-events-auto flex w-full max-w-[460px] animate-[banner-drop_480ms_cubic-bezier(.2,1.2,.3,1)] items-center gap-3 rounded-[24px] py-2 pl-2 pr-2.5 text-white max-sm:gap-2 max-sm:rounded-[18px] max-sm:py-1.5 max-sm:pl-1.5',
        ours && 'ring-2 ring-sys-red/70',
      )}
    >
      <span className="relative shrink-0">
        <img
          src={chogImage(c.chog, 96)}
          alt=""
          className="h-11 w-11 rounded-[14px] object-cover max-sm:h-9 max-sm:w-9 max-sm:rounded-[11px]"
        />
        <span className="absolute -bottom-1 -right-1 rounded-full bg-sys-gold px-1.5 text-[10px] font-bold text-black">
          $
        </span>
      </span>
      <p className="min-w-0 flex-1 text-[13px] leading-snug text-label-2 max-sm:line-clamp-2 max-sm:text-[11px]">
        <span
          className={cn(
            'block font-display text-[16px] leading-tight max-sm:text-[14px]',
            ours ? 'text-sys-red' : 'text-white',
          )}
        >
          {ours ? 'Stop the robber!' : 'Getaway'}
        </span>
        {c.name} is running from {GANGS[c.from].name} with {money(c.bag)} · {left}s
      </p>
      {props.canChase && (
        <button
          onClick={props.onChase}
          className={cn('btn btn-sm press shrink-0', ours ? 'btn-primary' : 'btn-glass')}
        >
          {ours ? 'Chase' : 'Watch'}
        </button>
      )}
    </div>
  );
}

/** Your getaway (or the practice one): where to go, the head start, and the time left in a ring. */
function RunBar({
  line,
  since,
  until,
  go,
}: {
  line: string;
  since: number;
  until: number;
  go?: number | null;
}) {
  const left = Math.max(0, (until - Date.now()) / 1000);
  const total = Math.max(1, (until - since) / 1000);
  const k = left / total;
  const low = left <= 10;
  return (
    <div className="glass-strong pointer-events-none w-full max-w-[460px] animate-[banner-drop_480ms_cubic-bezier(.2,1.2,.3,1)] rounded-[26px] py-3 pl-4 pr-3 text-white ring-1 ring-sys-gold/35 max-sm:rounded-[22px] max-sm:py-2 max-sm:pl-3.5 max-sm:pr-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-[22px] leading-tight text-sys-gold max-sm:text-[17px]">
            Run it home!
          </p>
          <p className="text-[14px] leading-snug text-label-2 max-sm:truncate max-sm:text-[12px]">{line}</p>
          <PoliceIn go={go === undefined ? since + HEAD_START * 1000 : go} />
        </div>
        <span className="relative grid h-[58px] w-[58px] shrink-0 place-items-center max-sm:h-[46px] max-sm:w-[46px]">
          <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="8" />
            <circle
              cx="50"
              cy="50"
              r="44"
              fill="none"
              stroke={low ? '#ff453a' : '#ffd60a'}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${k * 276.5} 276.5`}
              className="transition-[stroke-dasharray] duration-1000 ease-linear"
            />
          </svg>
          <span className={cn('font-display text-[20px] tabular-nums', low && 'animate-pulse text-sys-red')}>
            {Math.ceil(left)}
          </span>
        </span>
      </div>
    </div>
  );
}

/** The head start out of the door: "Police in 3… 2… 1", then "Run!". It starts with your first step. */
function PoliceIn({ go }: { go: number | null }) {
  const left = go === null ? HEAD_START : Math.ceil((go - Date.now()) / 1000);
  if (left < -1) return null;
  return (
    <p className="mt-1 font-display text-[15px] leading-none text-sys-red">
      {left > 0 ? `Police in ${left}…` : 'Run!'}
    </p>
  );
}
