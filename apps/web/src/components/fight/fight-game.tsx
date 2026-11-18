'use client';

import type { SkillId } from '@chog-city/data';
import {
  FIGHT,
  FIGHT_NAMES,
  FIGHT_PAY,
  FIGHT_POWERS,
  FIGHT_TPS,
  encodeFightInputs,
  fightButtons,
  roundFightInput,
  startFight,
  stepFight,
  type FightInput,
  type FightState,
} from '@chog-city/game/fight';
import type { PowerId } from '@chog-city/game/heist';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sound } from '../heist/sound';
import { SkillIcon } from '../skill-icons';
import { cn } from '@/lib/cn';
import { chogImage } from '@/lib/images';
import { FightRender, pctColor } from './fight-render';

export interface FightCard {
  id: number;
  name: string;
  color: string;
  powers: PowerId[];
  /** 1-5 tonight's card, 6 the champion; 0 for you. */
  level: number;
}

const ICON: Record<PowerId, SkillId> = {
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
const POWER_NAME: Record<PowerId, string> = {
  hide: 'Hide',
  zap: 'Zap',
  sprint: 'Sprint',
  distract: 'Distract',
  hack: 'Hack',
  tackle: 'Tackle',
  bribe: 'Bribe',
  magnet: 'Magnet',
  blink: 'Blink',
  scare: 'Scare',
  lockpick: 'Lockpick',
};

const STEP_MS = 1000 / FIGHT_TPS;
const STICK = 56;
const idle: FightInput = { mx: 0, my: 0 };

/** Fights won tonight, kept on this device per game day. */
function readProgress(day: number): number {
  try {
    return Number(localStorage.getItem(`fight-night:${day}`) ?? 0) || 0;
  } catch {
    return 0;
  }
}
function saveProgress(day: number, n: number) {
  try {
    localStorage.setItem(`fight-night:${day}`, String(n));
  } catch {
    /* private window: progress just isn't kept */
  }
}

function load(src: string) {
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  return img;
}

interface Hud {
  pct: [number, number];
  wins: [number, number];
  left: number;
  closing: boolean;
  cd: number[];
  cdMax: number[];
}

/** A real fight's start from the server: its id, seed and both sides' powers. */
interface ServerFight {
  id: string;
  seed: number;
  me: PowerId[];
  them: PowerId[];
}

export function FightGame(props: {
  me: FightCard;
  card: FightCard[];
  crowd: number[];
  day: number;
  /** Your own Chog, signed in: tonight's progress from the server and your gang's name. Null for practice. */
  real: { beaten: number; gang: string } | null;
}) {
  const { me, card, crowd, day, real } = props;
  const [beaten, setBeaten] = useState(real?.beaten ?? 0);
  const [screen, setScreen] = useState<'card' | 'fight' | 'won' | 'lost'>('card');
  const [rival, setRival] = useState<FightCard>(card[0]!);
  const [fightNo, setFightNo] = useState(0);
  const [server, setServer] = useState<ServerFight | null>(null);
  const [paid, setPaid] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    if (!real) setBeaten(readProgress(day));
  }, [day, real]);
  const next = card[Math.min(beaten, card.length - 1)]!;
  const allDone = beaten >= card.length;

  const post = async (path: string, body: unknown) => {
    const r = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null);
    return r ? await r.json().catch(() => null) : null;
  };

  const start = async (who: FightCard) => {
    setProblem(null);
    if (real) {
      const body = await post('/api/fight/start', { chog: me.id });
      if (!body?.ok) {
        setProblem(body?.error === 'card-done' ? 'You cleared tonight’s card.' : 'Couldn’t start the fight. Try again.');
        return;
      }
      setServer(body.fight);
    } else setServer(null);
    setRival(who);
    setFightNo((n) => n + 1);
    setScreen('fight');
  };
  const done = async (won: boolean, inputs: FightInput[]) => {
    setPaid(0);
    if (real && server) {
      // The server replays what you pressed: that's what counts, not what the browser says.
      const body = await post('/api/fight/finish', { id: server.id, inputs: encodeFightInputs(inputs) });
      if (body?.ok) {
        setBeaten(body.result.beaten);
        setPaid(body.result.paid);
        setScreen(body.result.won ? 'won' : 'lost');
      } else {
        setProblem('The fight couldn’t be checked, so it didn’t count. Try again.');
        setScreen('lost');
      }
      return;
    }
    if (won && rival.level === beaten + 1) {
      saveProgress(day, beaten + 1);
      setBeaten(beaten + 1);
    }
    setScreen(won ? 'won' : 'lost');
  };

  return (
    <div className="relative h-full w-full select-none text-white">
      {screen === 'fight' ? (
        <Ring key={fightNo} me={me} rival={rival} crowd={crowd} server={server} onDone={done} />
      ) : (
        <Card
          me={me}
          card={card}
          beaten={beaten}
          screen={screen}
          rival={rival}
          next={allDone ? null : next}
          real={real}
          paid={paid}
          problem={problem}
          onFight={start}
        />
      )}
    </div>
  );
}

/** Tonight's card: who you've beaten, who's next, the champion at the bottom. */
function Card(props: {
  me: FightCard;
  card: FightCard[];
  beaten: number;
  screen: 'card' | 'won' | 'lost';
  rival: FightCard;
  next: FightCard | null;
  real: { beaten: number; gang: string } | null;
  paid: number;
  problem: string | null;
  onFight: (c: FightCard) => void;
}) {
  const { me, card, beaten, screen, rival, next, real, paid, problem } = props;
  return (
    <div className="flex h-full flex-col items-center overflow-y-auto bg-[radial-gradient(ellipse_at_50%_0%,rgba(255,200,120,0.12),transparent_60%)] px-4 pb-10 pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="flex w-full max-w-md items-center justify-between">
        <Link href="/play" className="glass press rounded-full px-3 py-1.5 text-[13px] font-semibold">
          ← City
        </Link>
        <div className="text-[13px] text-white/60">Resets with the game day</div>
      </div>
      <h1 className="mt-6 font-brand text-[44px] leading-none tracking-wide">FIGHT NIGHT</h1>
      <p className="mt-2 text-center text-[14px] text-white/70">Knock them out of the ring. No health bar: the higher your number, the further you fly.</p>

      {screen !== 'card' && (
        <div
          className={cn(
            'mt-5 w-full max-w-md rounded-2xl p-4 text-center',
            screen === 'won' ? 'bg-[#1f3a2a] ring-1 ring-[#7dffa8]/40' : 'bg-[#3a1f24] ring-1 ring-[#ff6a6a]/40',
          )}
        >
          {screen === 'won' && rival.level === 6 && <img src="/art/fight/belt.webp?v=1" alt="" className="mx-auto mb-2 w-32" />}
          <div className="font-brand text-[30px] leading-none">{screen === 'won' ? 'YOU WON' : 'KNOCKED OUT'}</div>
          <div className="mt-1 text-[14px] text-white/75">
            {screen === 'won'
              ? rival.level === 6
                ? `You beat the champion, ${rival.name}.`
                : `${rival.name} is out. Next up below.`
              : `${rival.name} got you this time.`}
          </div>
          {paid > 0 && real && (
            <div className="mt-2 font-brand text-[22px] text-[#ffd23f]">+${paid} to {real.gang}’s vault</div>
          )}
        </div>
      )}

      <div className="mt-5 grid w-full max-w-md grid-cols-3 gap-2 text-center text-[12px] leading-snug text-white/75">
        <div className="rounded-xl bg-white/[0.05] px-2 py-2.5">
          <div className="text-[18px]">👀</div>A punch shows its arc before it lands
        </div>
        <div className="rounded-xl bg-white/[0.05] px-2 py-2.5">
          <div className="text-[18px]">💨</div>The start of a dash can’t be hit: dodge
        </div>
        <div className="rounded-xl bg-white/[0.05] px-2 py-2.5">
          <div className="text-[18px]">🥊</div>Hit them right after they miss
        </div>
      </div>

      {problem && <p className="mt-4 text-center text-[14px] font-semibold text-[#ff8a8a]">{problem}</p>}
      <p className="mt-4 text-center text-[13px] text-white/60">
        {real
          ? `Your first win against each fight tonight pays ${real.gang}’s vault, and every win counts toward this season’s best fighter.`
          : 'Practice. Play as your own Chog, signed in, and your wins pay your gang and count toward the season.'}
      </p>

      <ol className="mt-6 flex w-full max-w-md flex-col gap-2">
        {card.map((c, i) => {
          const won = i < beaten;
          const up = i === beaten;
          return (
            <li
              key={c.id}
              className={cn(
                'flex items-center gap-3 rounded-2xl px-3 py-2.5',
                up ? 'glass ring-1 ring-white/25' : 'bg-white/[0.04]',
                c.level === 6 && 'mt-2',
              )}
            >
              {c.level === 6 ? (
                <img src="/art/fight/belt.webp?v=1" alt="Champion" className="h-auto w-9 shrink-0" />
              ) : (
                <span className="w-9 text-center font-brand text-[18px] text-white/50">{i + 1}</span>
              )}
              <img
                src={chogImage(c.id, 96)}
                alt=""
                className={cn('h-11 w-11 rounded-[10px] object-cover', won && 'opacity-50 grayscale')}
                style={{ boxShadow: `0 0 0 2px ${c.color}` }}
              />
              <div className="min-w-0 flex-1">
                <div className={cn('truncate text-[15px] font-semibold', won && 'text-white/50 line-through')}>{c.name}</div>
                <div className="text-[12px] text-white/55">
                  {c.level === 6 ? 'Champion: the city’s top robber' : FIGHT_NAMES[i]}
                  {real && ` · +$${FIGHT_PAY[i]}`}
                  {' · '}
                  {fightButtons(c.powers).map((p) => POWER_NAME[p]).join(', ')}
                </div>
              </div>
              {won ? (
                <span className="text-[13px] font-semibold text-[#7dffa8]">Won</span>
              ) : up ? (
                <button onClick={() => props.onFight(c)} className="btn btn-gold btn-sm press">
                  <span>{screen === 'lost' && rival.id === c.id ? 'Again' : 'Fight'}</span>
                </button>
              ) : (
                <span className="text-[13px] text-white/35">Locked</span>
              )}
            </li>
          );
        })}
      </ol>
      {!next && <p className="mt-6 text-center text-[15px] font-semibold text-[#ffd23f]">Card cleared. A new one comes with the next game day.</p>}
      <p className="mt-8 max-w-md text-center text-[12px] text-white/45">
        Fighting as {me.name}. Your powers: {fightButtons(me.powers).map((p) => POWER_NAME[p]).join(', ')}.
      </p>
    </div>
  );
}

/** One fight: the canvas, the controls and the name plates. */
function Ring(props: {
  me: FightCard;
  rival: FightCard;
  crowd: number[];
  server: ServerFight | null;
  onDone: (won: boolean, inputs: FightInput[]) => void;
}) {
  const { me, rival, server } = props;
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const keys = useRef(new Set<string>());
  const taps = useRef({ hit: false, dash: false, p1: false, p2: false });
  const stick = useRef<{ id: number; ox: number; oy: number; x: number; y: number } | null>(null);
  const [joy, setJoy] = useState<{ ox: number; oy: number; x: number; y: number } | null>(null);
  const [moved, setMoved] = useState(false);
  const sound = useRef<Sound | null>(null);
  const [hud, setHud] = useState<Hud>({ pct: [0, 0], wins: [0, 0], left: FIGHT.fallTime, closing: false, cd: [0, 0], cdMax: [1, 1] });
  const buttons = useMemo(() => fightButtons(me.powers), [me.powers]);
  const onDone = useRef(props.onDone);
  onDone.current = props.onDone;

  const press = useCallback((k: 'hit' | 'dash' | 'p1' | 'p2') => {
    taps.current[k] = true;
    sound.current?.unlock();
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      keys.current.add(e.code);
      sound.current?.unlock();
      if (e.code === 'KeyJ' || e.code === 'Space') press('hit');
      if (e.code === 'KeyK' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') press('dash');
      if (e.code === 'KeyQ' || e.code === 'Digit1') press('p1');
      if (e.code === 'KeyE' || e.code === 'Digit2') press('p2');
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [press]);

  useEffect(() => {
    const el = canvas.current!;
    const box = wrap.current!;
    sound.current ??= new Sound();
    const imgs: [HTMLImageElement, HTMLImageElement] = [load(chogImage(me.id, 256)), load(chogImage(rival.id, 256))];
    const crowdImgs = props.crowd.map((id) => load(chogImage(id, 96)));
    const r = new FightRender(el, imgs, crowdImgs, { colors: [me.color, rival.color], me: 0 });
    const size = () => r.resize(box.clientWidth, box.clientHeight, Math.min(2, window.devicePixelRatio || 1));
    size();
    const ro = new ResizeObserver(size);
    ro.observe(box);
    let pending = imgs.length + crowdImgs.length;
    for (const img of [...imgs, ...crowdImgs])
      img.onload = () => {
        if (--pending % 4 === 0 || pending <= 0) r.rebuild();
      };

    // A real fight uses the server's seed and powers, so its replay of these inputs comes out the same.
    const s: FightState = startFight(
      { chog: me.id, name: me.name, powers: server?.me ?? me.powers },
      { chog: rival.id, name: rival.name, powers: server?.them ?? rival.powers, bot: rival.level },
      server?.seed ?? ((Date.now() & 0x7fffffff) ^ (rival.id * 2654435761)),
    );
    const recorded: FightInput[] = [];
    // Development only: lets the test script see the fight (never on the live site).
    if (process.env.NODE_ENV !== 'production') (window as unknown as { __fight?: FightState }).__fight = s;
    let prev = s.f.map((f) => ({ x: f.x, y: f.y }));
    let acc = 0;
    let last = performance.now();
    let hudAt = 0;
    let raf = 0;
    let ended = false;
    const snd = sound.current;

    const input = (): FightInput => {
      const k = keys.current;
      let mx = (k.has('KeyD') || k.has('ArrowRight') ? 100 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 100 : 0);
      let my = (k.has('KeyS') || k.has('ArrowDown') ? 100 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 100 : 0);
      const st = stick.current;
      if (st) {
        const dx = st.x - st.ox;
        const dy = st.y - st.oy;
        const d = Math.hypot(dx, dy);
        if (d > 8) {
          const m = Math.min(1, d / STICK);
          mx = Math.round((dx / d) * m * 100);
          my = Math.round((dy / d) * m * 100);
        }
      }
      const t = taps.current;
      const out = { mx, my, hit: t.hit, dash: t.dash, p1: t.p1, p2: t.p2 };
      taps.current = { hit: false, dash: false, p1: false, p2: false };
      return out;
    };

    const frame = (now: number) => {
      acc += Math.min(250, now - last);
      last = now;
      while (acc >= STEP_MS) {
        acc -= STEP_MS;
        prev = s.f.map((f) => ({ x: f.x, y: f.y }));
        const mine = roundFightInput(input());
        if (s.phase !== 'over') recorded.push(mine);
        stepFight(s, [mine, idle]);
        r.events(s.events, s, now);
        for (const e of s.events) {
          if (e.k === 'hit') {
            if (e.strong) {
              snd.thud();
              snd.hit(2);
            } else snd.hit(0);
          } else if (e.k === 'whiff') snd.miss();
          else if (e.k === 'power') {
            if (e.id === 'zap') snd.zap();
            else snd.power();
          }
          else if (e.k === 'out') snd.tag();
          else if (e.k === 'go') snd.tick(true);
          else if (e.k === 'over' && !ended) {
            ended = true;
            if (e.winner === 0) snd.escaped();
            else snd.busted();
            setTimeout(() => onDone.current(e.winner === 0, recorded), 900);
          }
        }
      }
      r.draw(s, prev, acc / STEP_MS, now);
      if (now - hudAt > 90) {
        hudAt = now;
        const t = (s.tick - s.fallStart) / FIGHT_TPS;
        const mine = s.f[0];
        // The clock stands still between falls and shows a full fall during the countdown.
        const left = s.phase === 'count' ? FIGHT.fallTime : Math.max(0, Math.ceil(FIGHT.fallTime - t));
        setHud((h) => ({
          pct: [Math.round(s.f[0].pct), Math.round(s.f[1].pct)],
          wins: [s.wins[0], s.wins[1]],
          left: s.phase === 'out' || s.phase === 'over' ? h.left : left,
          closing: s.ring < FIGHT.ring - 0.01,
          cd: buttons.map((p) => Math.ceil((mine.cd[p] ?? 0) / FIGHT_TPS)),
          cdMax: buttons.map((p) => FIGHT_POWERS[p].cooldown),
        }));
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
    // One fight per mount; FightGame remounts this for the next one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The stick: put your thumb down anywhere on the left side of the screen.
  const onDown = (e: React.PointerEvent) => {
    sound.current?.unlock();
    if (e.clientX > window.innerWidth * 0.5 || stick.current) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    stick.current = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
    setJoy({ ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY });
    setMoved(true);
  };
  const onMove = (e: React.PointerEvent) => {
    const st = stick.current;
    if (!st || st.id !== e.pointerId) return;
    st.x = e.clientX;
    st.y = e.clientY;
    setJoy({ ox: st.ox, oy: st.oy, x: st.x, y: st.y });
  };
  const onUp = (e: React.PointerEvent) => {
    if (stick.current?.id !== e.pointerId) return;
    stick.current = null;
    setJoy(null);
  };

  const plate = (side: 0 | 1) => {
    const c = side === 0 ? me : rival;
    return (
      <div className={cn('flex items-center gap-2.5', side === 1 && 'flex-row-reverse text-right')}>
        <img src={chogImage(c.id, 96)} alt="" className="h-11 w-11 rounded-[10px] object-cover max-sm:h-9 max-sm:w-9" style={{ boxShadow: `0 0 0 2px ${c.color}` }} />
        <div className="min-w-0">
          <div className="max-w-[130px] truncate text-[13px] font-semibold max-sm:max-w-[96px] max-sm:text-[12px]">{c.name}</div>
          <div className="flex items-center gap-1.5" style={{ flexDirection: side === 1 ? 'row-reverse' : 'row' }}>
            <span className="font-brand text-[26px] leading-none tabular-nums max-sm:text-[22px]" style={{ color: pctColor(hud.pct[side]) }}>
              {hud.pct[side]}%
            </span>
            <span className="flex gap-1">
              {Array.from({ length: FIGHT.falls }, (_, i) => (
                <span key={i} className={cn('h-2.5 w-2.5 rounded-full', i < hud.wins[side] ? 'bg-[#ffd23f]' : 'bg-white/20')} />
              ))}
            </span>
          </div>
        </div>
      </div>
    );
  };

  const btn = (k: 'hit' | 'dash' | 'p1' | 'p2', label: string, key: string, extra?: React.ReactNode, cls?: string) => (
    <button
      onPointerDown={(e) => {
        e.stopPropagation();
        press(k);
      }}
      className={cn(
        'relative grid place-items-center rounded-full font-brand text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_8px_22px_rgba(0,0,0,0.45)] active:scale-90 [-webkit-tap-highlight-color:transparent]',
        cls,
      )}
    >
      {extra}
      <span className="relative">{label}</span>
      <span className="kbd absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-[6px] bg-white px-1 font-sans text-[11px] font-bold text-black max-sm:hidden">{key}</span>
    </button>
  );

  return (
    <div ref={wrap} className="absolute inset-0 touch-none" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        {plate(0)}
        <div className={cn('glass mt-1 rounded-full px-3 py-1 text-center font-brand text-[18px] tabular-nums', hud.closing && 'bg-[#e83a3a]/70')}>
          {hud.closing ? 'ROPES CLOSING' : `0:${String(hud.left).padStart(2, '0')}`}
        </div>
        {plate(1)}
      </div>
      {joy && (
        <div className="pointer-events-none absolute z-10" style={{ left: joy.ox - STICK, top: joy.oy - STICK }}>
          <div className="h-[112px] w-[112px] rounded-full bg-white/10 ring-1 ring-white/25" />
          <div
            className="absolute left-[28px] top-[28px] h-14 w-14 rounded-full bg-white/80"
            style={{
              transform: `translate(${Math.max(-STICK, Math.min(STICK, joy.x - joy.ox))}px, ${Math.max(-STICK, Math.min(STICK, joy.y - joy.oy))}px)`,
            }}
          />
        </div>
      )}
      {/* On a touch screen, before you've moved: a ghost of the stick where your thumb goes. */}
      {!joy && !moved && (
        <div className="pointer-events-none absolute bottom-[max(2.5rem,env(safe-area-inset-bottom))] left-8 flex flex-col items-center gap-2 [@media(hover:hover)_and_(pointer:fine)]:hidden">
          <div className="grid h-[112px] w-[112px] place-items-center rounded-full bg-white/10 ring-1 ring-white/25">
            <div className="h-14 w-14 animate-[stick-hint_2.4s_ease-in-out_infinite] rounded-full bg-white/70" />
          </div>
          <span className="text-[12px] font-semibold text-white/70">Drag here to move</span>
        </div>
      )}
      <div className="absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-4 grid grid-cols-2 items-end gap-3">
        {buttons.map((p, i) => {
          const wait = hud.cd[i] ?? 0;
          return (
            <div key={p} className="flex flex-col items-center gap-1">
              {btn(
                i === 0 ? 'p1' : 'p2',
                '',
                i === 0 ? 'Q' : 'E',
                <>
                  <SkillIcon skill={ICON[p]} width={28} height={28} className={cn('relative', wait > 0 && 'opacity-40')} />
                  {wait > 0 && (
                    <span
                      className="absolute inset-0 grid place-items-center rounded-full font-sans text-[18px] font-bold"
                      style={{ background: `conic-gradient(rgba(10,8,20,0.7) ${(wait / (hud.cdMax[i] || 1)) * 360}deg, transparent 0)` }}
                    >
                      {wait}
                    </span>
                  )}
                </>,
                'h-14 w-14 bg-[linear-gradient(180deg,#ff6fa8,#e0337a)]',
              )}
              <span className="text-[11px] font-semibold text-white/70 max-sm:hidden">{POWER_NAME[p]}</span>
            </div>
          );
        })}
        {btn('dash', 'DASH', 'K', null, 'h-16 w-16 bg-[linear-gradient(180deg,#5b8cff,#2f5fd8)] text-[15px]')}
        {btn('hit', 'HIT', 'J', null, 'h-20 w-20 bg-[linear-gradient(180deg,#ffe58a,#ffb020)] text-[22px] text-[#2a1600]')}
      </div>
      <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 text-[12px] text-white/40 max-sm:hidden">
        Move: WASD or arrows · Hit: J or Space · Dash: K or Shift
      </div>
    </div>
  );
}
