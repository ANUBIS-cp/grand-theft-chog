'use client';
import type { SkillId } from '@chog-city/data';
import {
  POWERS,
  TPS,
  IDLE,
  buildLevel,
  decodeInputs,
  encodeInputs,
  startHeist,
  step,
  type Dir,
  type HeistEvent,
  type HeistState,
  type Input,
  type PowerId,
  type VaultDef,
} from '@chog-city/game/heist';
import { ArrowClockwise, SpeakerHigh, SpeakerSlash, Vault, X } from '@phosphor-icons/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SkillIcon } from '@/components/skill-icons';
import { cn } from '@/lib/cn';
import { chogImage } from '@/lib/images';
import { Fx } from './fx';
import { VaultRenderer, snapshot, type Prev } from './render';
import { Sound } from './sound';

export interface HeistChog {
  id: number;
  name: string;
}

/** What the server says a real hit was worth (it replays the run itself). */
export interface RealResult {
  result: 'escaped' | 'busted';
  carried: number;
  score: number;
  moved: number;
  caughtBy: number | null;
  jailedUntil: number | null;
  revenge: boolean;
}

export interface HeistGameProps {
  vault: VaultDef;
  /** Defence level; practice runs use the starting level. */
  tier?: number;
  player: HeistChog & { gang: string | null; powers: PowerId[] };
  guards: HeistChog[];
  owner: { name: string; color: string; ink: string };
  /** A real hit: the inputs go to the server when it ends, and the card offers a way back. */
  real?: {
    myGang: string;
    finish: (inputs: string) => Promise<RealResult>;
    onLeave: () => void;
    /** Where this run can be watched again once it's saved. */
    replayHref?: string;
  };
  /** Practice from the city: a way back out. */
  onLeave?: () => void;
  /** Watching a run that already happened: its key presses, and what it moved. */
  replay?: { inputs: string; moved: number; robbers: string };
  /** A break-out: the gang-mate in the locked cell. */
  rescue?: HeistChog;
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

const KEYS: Record<string, Dir> = {
  ArrowUp: 0,
  KeyW: 0,
  ArrowRight: 1,
  KeyD: 1,
  ArrowDown: 2,
  KeyS: 2,
  ArrowLeft: 3,
  KeyA: 3,
};
const POWER_KEYS: Record<string, number> = { Digit1: 0, KeyJ: 0, Space: 0, Digit2: 1, KeyK: 1 };

interface Hud {
  phase: HeistState['phase'];
  started: boolean;
  seconds: number;
  carried: number;
  /** Seconds until each power can be used again (0 = ready). */
  wait: number[];
  spent: boolean[];
  /** Share of each power's effect still running (0..1). */
  active: number[];
  score: number;
  spotted: boolean;
  caughtBy: number | null;
}

const money = (n: number) => `$${n.toLocaleString('en-US')}`;
const clock = (ticks: number) => {
  const s = Math.ceil(ticks / TPS);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function HeistGame({
  vault,
  tier = 1,
  player,
  guards,
  owner,
  real,
  onLeave,
  replay,
  rescue,
}: HeistGameProps) {
  const script = useMemo(() => (replay ? (decodeInputs(replay.inputs) ?? []) : null), [replay]);
  const scriptRef = useRef(script);
  scriptRef.current = script;
  const level = useMemo(() => buildLevel(vault, tier), [vault, tier]);
  const [saved, setSaved] = useState<{ result?: RealResult; error?: string } | null>(null);
  const sentRef = useRef(false);
  const realRef = useRef(real);
  realRef.current = real;
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const game = useRef<{
    s: HeistState;
    prev: Prev;
    fx: Fx;
    r: VaultRenderer | null;
    started: boolean;
    held: Dir[];
    queued: { d: Dir; until: number } | null;
    press: number;
    inputs: Input[];
    endAt: number;
  } | null>(null);
  const sound = useRef<Sound | null>(null);
  const [hud, setHud] = useState<Hud | null>(null);
  const [muted, setMuted] = useState(false);
  const [showEnd, setShowEnd] = useState(false);
  const [joy, setJoy] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);

  // The page around the game may redraw every second with new (but equal) objects. Key everything on the
  // values, so a redraw never restarts the run.
  const powersKey = player.powers.join(',');
  const guardsKey = guards.map((g) => g.id).join(',');
  const powersRef = useRef(player.powers);
  powersRef.current = player.powers;
  const guardsRef = useRef(guards);
  guardsRef.current = guards;

  const fresh = useCallback(() => {
    const s = startHeist(level, powersRef.current);
    return {
      s,
      prev: snapshot(s),
      fx: new Fx(),
      started: !!scriptRef.current,
      held: [],
      queued: null,
      press: -1,
      inputs: [],
      endAt: 0,
    };
  }, [level, powersKey]);

  const restart = useCallback(() => {
    const g = game.current;
    if (!g) return;
    sound.current?.alarmOff();
    Object.assign(g, fresh());
    setShowEnd(false);
  }, [fresh]);

  // Set up the renderer, the loop and the images once.
  useEffect(() => {
    const cv = canvasRef.current;
    const stage = stageRef.current;
    if (!cv || !stage) return;
    sound.current ??= new Sound();
    try {
      const m = localStorage.getItem('heist-muted') === '1';
      sound.current.setMuted(m);
      setMuted(m);
    } catch {}
    const load = (src: string) => {
      const img = new Image();
      img.decoding = 'async';
      img.src = src;
      return img;
    };
    const images = {
      player: load(chogImage(player.id, 256)),
      guards: guardsRef.current.map((c) => load(chogImage(c.id, 96))),
    };
    const r = new VaultRenderer(cv, level, images, { color: owner.color });
    r.font =
      getComputedStyle(document.body).getPropertyValue('--font-display').trim() || 'Impact, sans-serif';
    const g = { ...fresh(), r };
    game.current = g;
    for (const img of [images.player, ...images.guards]) img.onload = () => r.faceReady();

    const fit = () => {
      const box = stage.getBoundingClientRect();
      r.resize(box.width, box.height);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    void document.fonts?.ready.then(fit);

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let fxAcc = 0;
    let lastKey = '';
    let crackTick = 0;
    const DT = 1000 / TPS;
    const frame = (now: number) => {
      const st = game.current!;
      const elapsed = Math.min(250, now - last);
      last = now;
      const live = st.started && (st.s.phase === 'play' || st.s.phase === 'alarm');
      if (live) {
        acc += elapsed;
        while (acc >= DT && (st.s.phase === 'play' || st.s.phase === 'alarm')) {
          st.prev = snapshot(st.s);
          const input = readInput(st);
          st.inputs.push(input);
          const sus = st.s.guards.map((x) => x.sus).concat(st.s.cameras.map((c) => c.sus));
          const ev = step(st.s, level, input);
          react(st, ev, sus);
          if (st.s.player.crack >= 0 && ++crackTick % 6 === 0) sound.current?.click();
          acc -= DT;
        }
      } else acc = 0;
      fxAcc += elapsed;
      while (fxAcc >= 1000 / 60) {
        st.fx.tick();
        fxAcc -= 1000 / 60;
      }
      st.r?.draw(st.s, st.prev, live ? acc / DT : 1, st.fx, now);
      if (st.endAt && now >= st.endAt) {
        st.endAt = 0;
        setShowEnd(true);
      }
      if (realRef.current && !sentRef.current && (st.s.phase === 'escaped' || st.s.phase === 'busted')) {
        sentRef.current = true;
        realRef.current
          .finish(encodeInputs(st.inputs))
          .then((result) => setSaved({ result }))
          .catch((e: unknown) =>
            setSaved({ error: e instanceof Error ? e.message : 'Could not save the run.' }),
          );
      }
      const p = st.s.player;
      const next: Hud = {
        phase: st.s.phase,
        started: st.started,
        seconds: st.s.phase === 'alarm' ? Math.ceil(st.s.alarmLeft / TPS) : Math.ceil(st.s.timeLeft / TPS),
        carried: st.s.carried,
        wait: st.s.powers.map((x) => Math.max(0, Math.ceil((x.ready - st.s.tick) / TPS))),
        spent: st.s.powers.map((x) => x.used),
        active: st.s.powers.map((x) => {
          const left =
            { hide: p.hide, sprint: p.sprint, tackle: p.tackle, magnet: p.magnet, hack: st.s.hacked }[
              x.id as 'hide'
            ] ?? 0;
          return left ? Math.round((left / (POWERS[x.id].lasts * TPS)) * 50) / 50 : 0;
        }),
        score: st.s.score,
        spotted: st.s.spotted,
        caughtBy: st.s.caughtBy,
      };
      const key = JSON.stringify(next);
      if (key !== lastKey) {
        lastKey = key;
        setHud(next);
      }
      raf = requestAnimationFrame(frame);
    };

    const readInput = (st: NonNullable<typeof game.current>): Input => {
      const script = scriptRef.current;
      if (script) {
        // A replay: the recorded key presses, one per tick. If they stop early, the robber walked out.
        const next = script[st.inputs.length];
        if (!next) st.s.phase = 'busted';
        return next ?? IDLE;
      }
      let d: Dir | -1 = st.held.at(-1) ?? -1;
      if (d === -1 && st.queued) {
        d = st.queued.d;
        if (st.s.tick >= st.queued.until || st.s.player.dir === st.queued.d) st.queued = null;
      }
      const p = st.press;
      st.press = -1;
      return { d, p };
    };

    const react = (st: NonNullable<typeof game.current>, ev: HeistEvent[], susBefore: number[]) => {
      const sfx = sound.current;
      const rr = st.r!;
      const t = rr.t;
      const tileX = (x: number) => x * t + t / 2;
      const tileY = (y: number) => y * t + t / 2 + rr.lift;
      const px = rr.X(st.s.player.x);
      const py = rr.Y(st.s.player.y);
      const susNow = st.s.guards.map((x) => x.sus).concat(st.s.cameras.map((c) => c.sus));
      if (st.s.phase === 'play' && susNow.some((v, i) => v > 0 && (susBefore[i] ?? 0) === 0)) sfx?.suspect();
      for (const e of ev) {
        switch (e.t) {
          case 'loot':
            if (e.kind === 'coin') sfx?.coin();
            else if (e.kind === 'cash') sfx?.cash();
            else sfx?.bag();
            st.fx.burst(
              tileX(e.x),
              tileY(e.y),
              e.kind === 'coin' ? 5 : 12,
              ['#ffd666', '#fff3b0', '#5fd17e'],
              e.kind === 'bag' ? 3 : 2,
            );
            st.fx.float(
              tileX(e.x),
              tileY(e.y) - t * 0.3,
              `+${money(e.value)}`,
              e.kind === 'coin' ? '#ffd666' : '#7dffa8',
              e.kind === 'bag',
            );
            break;
          case 'safe':
            sfx?.safe();
            st.fx.burst(tileX(e.x), tileY(e.y), 40, ['#ffd666', '#fff3b0', '#ffffff', '#5fd17e'], 4, 0.15);
            st.fx.float(tileX(e.x), tileY(e.y) - t * 0.5, `+${money(e.value)}`, '#ffd666', true);
            st.fx.flash = 0.35;
            st.fx.flashColor = '#ffd666';
            st.fx.shake = 6;
            break;
          case 'alarm':
            sfx?.alarmOn();
            st.fx.shake = 8;
            st.fx.flash = 0.35;
            st.fx.flashColor = '#ff2d55';
            break;
          case 'calm':
            sfx?.alarmOff();
            st.fx.float(px, py - t * 0.6, 'PAID OFF', '#7dffa8', true);
            break;
          case 'pass': {
            const gd = st.s.guards[e.i]!;
            st.fx.float(rr.X(gd.x), rr.Y(gd.y) - t * 0.7, 'LOOKED AWAY', '#7dffa8');
            break;
          }
          case 'power':
            sfx?.power();
            st.fx.ring(px, py, t * 1.6, '#ff4f9a');
            st.fx.float(px, py - t * 0.7, POWERS[e.id].name.toUpperCase(), '#ff8fc0');
            break;
          case 'zap': {
            sfx?.zap();
            const ex = tileX(e.tx);
            const ey = tileY(e.ty);
            st.fx.beam(px, py - t * 0.1, ex, ey, '#e040fb');
            st.fx.burst(ex, ey, 14, ['#e040fb', '#ffffff'], 2.5);
            break;
          }
          case 'blink':
            st.fx.burst(tileX(e.fx), tileY(e.fy), 16, ['#b388ff', '#ffffff'], 2.5, 0);
            st.fx.burst(tileX(e.tx), tileY(e.ty), 16, ['#b388ff', '#ffffff'], 2.5, 0);
            st.fx.ring(tileX(e.tx), tileY(e.ty), t * 1.2, '#b388ff');
            break;
          case 'noise':
            st.fx.ring(tileX(e.x), tileY(e.y), t * 2.4, '#ffffff', 50);
            st.fx.float(tileX(e.x), tileY(e.y) - t * 0.4, 'HEY!', '#ffffff');
            break;
          case 'stun':
            sfx?.thud();
            st.fx.shake = Math.max(st.fx.shake, 4);
            break;
          case 'escaped':
            sfx?.escaped();
            st.fx.burst(px, py, 50, ['#ffd666', '#7dffa8', '#ffffff', '#ff4f9a'], 4, 0.1);
            st.endAt = performance.now() + 700;
            break;
          case 'busted':
            sfx?.busted();
            st.fx.shake = 14;
            st.fx.flash = 0.5;
            st.fx.flashColor = '#ff2d55';
            st.endAt = performance.now() + 900;
            break;
        }
      }
    };

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      sound.current?.alarmOff();
    };
  }, [level, player.id, guardsKey, owner.color, fresh]);

  // Keyboard.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const g = game.current;
      if (!g || e.metaKey || e.ctrlKey || e.altKey || scriptRef.current) return;
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      const d = KEYS[e.code];
      const pw = POWER_KEYS[e.code];
      if (e.code === 'KeyR' && !realRef.current && (g.s.phase === 'escaped' || g.s.phase === 'busted')) {
        restart();
        return;
      }
      if (d === undefined && pw === undefined) return;
      e.preventDefault();
      sound.current?.unlock();
      if (d !== undefined) {
        g.started = true;
        if (!g.held.includes(d)) g.held.push(d);
        g.queued = { d, until: g.s.tick + 8 };
      } else if (pw !== undefined && g.started) g.press = pw;
    };
    const up = (e: KeyboardEvent) => {
      const g = game.current;
      const d = KEYS[e.code];
      if (!g || d === undefined) return;
      g.held = g.held.filter((x) => x !== d);
    };
    const blur = () => {
      if (game.current) game.current.held = [];
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [restart]);

  // Touch and mouse: drag anywhere to move, like a joystick that follows your finger.
  const drag = useRef<{
    id: number;
    ax: number;
    ay: number;
    t0: number;
    d: Dir | -1;
    ox: number;
    oy: number;
  } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    const g = game.current;
    sound.current?.unlock();
    if (!g || g.s.phase === 'escaped' || g.s.phase === 'busted' || scriptRef.current) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    drag.current = {
      id: e.pointerId,
      ax: e.clientX,
      ay: e.clientY,
      t0: performance.now(),
      d: -1,
      ox: box.left,
      oy: box.top,
    };
    setJoy({ x: e.clientX - box.left, y: e.clientY - box.top, dx: 0, dy: 0 });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const dr = drag.current;
    const g = game.current;
    if (!dr || !g || dr.id !== e.pointerId) return;
    let dx = e.clientX - dr.ax;
    let dy = e.clientY - dr.ay;
    const len = Math.hypot(dx, dy);
    const MAX = 34;
    if (len > MAX) {
      dr.ax += (dx / len) * (len - MAX);
      dr.ay += (dy / len) * (len - MAX);
      dx = e.clientX - dr.ax;
      dy = e.clientY - dr.ay;
    }
    if (Math.hypot(dx, dy) > 10) {
      const d: Dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0;
      if (d !== dr.d) {
        dr.d = d;
        g.started = true;
        g.held = [d];
        g.queued = { d, until: g.s.tick + 8 };
      }
    }
    setJoy({ x: dr.ax - dr.ox, y: dr.ay - dr.oy, dx, dy });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const dr = drag.current;
    const g = game.current;
    if (!dr || !g || dr.id !== e.pointerId) return;
    g.held = [];
    drag.current = null;
    setJoy(null);
  };

  const usePower = (i: number) => {
    const g = game.current;
    if (!g) return;
    sound.current?.unlock();
    if (!g.started || scriptRef.current) return;
    g.press = i;
  };

  const toggleMute = () => {
    const m = !muted;
    setMuted(m);
    sound.current?.setMuted(m);
    try {
      localStorage.setItem('heist-muted', m ? '1' : '0');
    } catch {}
  };

  const phase = hud?.phase ?? 'play';
  const alarm = phase === 'alarm';
  const over = phase === 'escaped' || phase === 'busted';
  const caughtBy = hud?.caughtBy != null ? guards[hud.caughtBy % guards.length] : null;

  return (
    <div className="flex h-full flex-col bg-[#0b0918] text-white">
      {/* Top bar */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 pb-1.5 pt-2 sm:px-4">
        <div className="flex min-w-0 items-center gap-2 justify-self-start">
          {onLeave && !real && (
            <button
              onClick={onLeave}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-white/70 hover:text-white"
              aria-label="Back to the city"
            >
              <X size={20} weight="bold" />
            </button>
          )}
          <div
            className="flex min-w-0 items-center gap-1.5 rounded-[6px] border-2 border-ink py-1 pl-1.5 pr-2 shadow-[2px_2px_0_0_#000]"
            style={{ background: owner.color, color: owner.ink }}
            title={`You're robbing ${owner.name}`}
          >
            <Vault size={16} weight="fill" className="shrink-0" />
            <span className="truncate pt-0.5 font-display text-[16px] uppercase leading-none">
              {owner.name}
            </span>
          </div>
          {replay && (
            <span className="hidden shrink-0 rounded-[4px] bg-white px-1.5 pb-0.5 pt-1 font-display text-[14px] uppercase leading-none text-ink sm:inline">
              Replay
            </span>
          )}
        </div>
        <div
          className={cn(
            'font-display text-[32px] leading-none tabular-nums sm:text-[36px]',
            alarm ? 'text-[#ff4d6d]' : 'text-white',
          )}
          aria-label={alarm ? 'Seconds to get out' : 'Time left'}
        >
          {alarm
            ? `0:${String(hud?.seconds ?? 0).padStart(2, '0')}`
            : clock(hud ? hud.seconds * TPS : level.ticks)}
        </div>
        <div className="flex items-center gap-1 justify-self-end">
          {rescue ? (
            <div
              className={cn(
                'flex items-center gap-1.5 rounded-[6px] border-2 border-ink py-0.5 pl-0.5 pr-2 font-display text-[16px] uppercase leading-none text-ink shadow-[2px_2px_0_0_#000]',
                hud?.carried ? 'bg-[#7dffa8]' : 'bg-paper-raised',
              )}
            >
              <img
                src={chogImage(rescue.id, 96)}
                alt=""
                className="h-7 w-7 rounded-full border-2 border-ink"
              />
              <span className="pt-0.5">{hud?.carried ? 'Got them' : 'Locked up'}</span>
            </div>
          ) : (
            <div className="rounded-[6px] border-2 border-ink bg-[#ffd666] px-2 pb-0.5 pt-1 font-display text-[22px] leading-none text-ink tabular-nums shadow-[2px_2px_0_0_#000]">
              {money(hud?.carried ?? 0)}
            </div>
          )}
          <button
            onClick={toggleMute}
            className="grid h-9 w-9 place-items-center rounded-full text-white/60 hover:text-white"
            aria-label={muted ? 'Sound on' : 'Sound off'}
          >
            {muted ? <SpeakerSlash size={20} weight="bold" /> : <SpeakerHigh size={20} weight="bold" />}
          </button>
        </div>
      </div>

      {/* The vault */}
      <div
        ref={stageRef}
        className="relative min-h-0 flex-1 touch-none select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <canvas ref={canvasRef} className="absolute inset-0" />
        {alarm && (
          <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center">
            <div className="rounded-[6px] border-2 border-ink bg-[#ff2d55] px-3 pb-0.5 pt-1.5 font-display text-[18px] uppercase leading-none tracking-wide text-white shadow-[2px_2px_0_0_#000]">
              Alarm! Get out
            </div>
          </div>
        )}
        {joy && (
          <div className="pointer-events-none absolute" style={{ left: joy.x, top: joy.y }}>
            <div className="absolute -left-9 -top-9 h-[72px] w-[72px] rounded-full border-2 border-white/30 bg-white/5" />
            <div
              className="absolute -left-4 -top-4 h-8 w-8 rounded-full border-2 border-white/70 bg-white/25"
              style={{ transform: `translate(${joy.dx}px, ${joy.dy}px)` }}
            />
          </div>
        )}
        {hud && !hud.started && !over && <StartHint player={player} rescue={rescue} />}
        {over && showEnd && hud && (
          <EndCard
            escaped={phase === 'escaped'}
            score={hud.score}
            carried={hud.carried}
            clean={!hud.spotted}
            owner={owner.name}
            caughtBy={caughtBy}
            onAgain={restart}
            onLeave={onLeave}
            real={real ? { ...real, saved } : undefined}
            replay={replay}
            rescue={rescue}
          />
        )}
      </div>

      {/* Powers */}
      <div className="px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 sm:px-4">
        {player.powers.some((id) => POWERS[id].passive) && (
          <p className="mb-1.5 flex flex-wrap gap-x-3 text-[12px] text-white/60">
            {player.powers
              .filter((id) => POWERS[id].passive)
              .map((id) => (
                <span key={id} className="inline-flex items-center gap-1">
                  <SkillIcon skill={ICON[id]} width={16} height={16} />
                  <strong className="text-white/85">{POWERS[id].name}:</strong> {POWERS[id].does}
                </span>
              ))}
          </p>
        )}
        <div className="grid auto-cols-fr grid-flow-col gap-2">
          {player.powers.map((id, i) => {
            const def = POWERS[id];
            if (def.passive) return null;
            const active = hud?.active[i] ?? 0;
            const wait = hud?.wait[i] ?? 0;
            const spent = hud?.spent[i] ?? false;
            const needsAlarm = id === 'bribe' && !alarm;
            const off = !active && (spent || wait > 0 || needsAlarm);
            return (
              <button
                key={id}
                onPointerDown={() => usePower(i)}
                onClick={(e) => e.detail === 0 && usePower(i)}
                disabled={off || over}
                title={def.does}
                className={cn(
                  'relative flex min-w-0 items-center gap-2 overflow-hidden rounded-[10px] border-2 border-ink p-1.5 pr-2 text-left transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none',
                  off ? 'bg-white/10 text-white/50' : 'bg-pink text-ink shadow-[3px_3px_0_0_#000]',
                  active > 0 && 'bg-[#ffd666]',
                )}
              >
                <span
                  className={cn(
                    'relative grid h-10 w-10 shrink-0 place-items-center rounded-[7px] border-2 border-ink',
                    off ? 'bg-transparent' : 'bg-paper-raised',
                  )}
                >
                  <SkillIcon
                    skill={ICON[id]}
                    width={26}
                    height={26}
                    className={cn(off && wait > 0 && 'opacity-30')}
                  />
                  {off && wait > 0 && !spent && (
                    <span className="absolute inset-0 grid place-items-center font-display text-[22px] leading-none text-white">
                      {wait}
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-1">
                    <span className="truncate pt-0.5 font-display text-[19px] uppercase leading-none">
                      {def.name}
                    </span>
                    <kbd className="hidden font-mono text-[10px] opacity-60 sm:inline">{i + 1}</kbd>
                  </span>
                  <span className="mt-0.5 line-clamp-2 text-[11px] leading-[1.2] opacity-80">
                    {spent
                      ? 'Used'
                      : active > 0
                        ? 'On!'
                        : wait > 0
                          ? `Ready in ${wait}s`
                          : needsAlarm
                            ? 'Use it when the alarm goes off.'
                            : def.does}
                  </span>
                </span>
                {active > 0 && (
                  <span
                    className="absolute bottom-0 left-0 h-1.5 bg-ink"
                    style={{ width: `${active * 100}%` }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StartHint({ player, rescue }: { player: HeistGameProps['player']; rescue?: HeistChog }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center px-3">
      <div className="flex items-center gap-3 rounded-[10px] border-2 border-ink bg-paper-raised px-3 py-2 text-ink shadow-[3px_3px_0_0_#000]">
        <img src={chogImage(player.id, 96)} alt="" className="h-9 w-9 rounded-full border-2 border-ink" />
        <div className="text-[13px] leading-snug">
          <strong className="block font-display text-[18px] uppercase leading-none">Move to start</strong>
          <span className="hidden sm:inline">Arrow keys or WASD. </span>
          <span className="sm:hidden">Drag anywhere. </span>
          {rescue
            ? `Open the cell at the top to free ${rescue.name}, stay out of the flashlights, walk out the green EXIT.`
            : 'Grab cash, stay out of the flashlights, walk out the green EXIT.'}
        </div>
      </div>
    </div>
  );
}

function EndCard({
  escaped,
  score,
  carried,
  clean,
  owner,
  caughtBy,
  onAgain,
  onLeave,
  replay,
  rescue,
  real,
}: {
  escaped: boolean;
  score: number;
  carried: number;
  clean: boolean;
  owner: string;
  caughtBy: HeistChog | null | undefined;
  onAgain: () => void;
  onLeave?: () => void;
  replay?: { moved: number; robbers: string };
  rescue?: HeistChog;
  real?: {
    myGang: string;
    onLeave: () => void;
    replayHref?: string;
    saved: { result?: RealResult; error?: string } | null;
  };
}) {
  const [shown, setShown] = useState(0);
  const target = real ? (real.saved?.result?.moved ?? 0) : replay ? replay.moved : score;
  useEffect(() => {
    if (!escaped) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / 900);
      setShown(Math.round(target * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [escaped, target]);

  return (
    <div className="absolute inset-0 z-10 grid place-items-center bg-[#0b0918]/70 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-[340px] rounded-[14px] border-2 border-ink bg-paper-raised p-5 text-center text-ink shadow-[5px_5px_0_0_#000]">
        <div
          className={cn(
            'mx-auto inline-block -rotate-3 rounded-[6px] border-[3px] px-4 pb-1 pt-2 font-display text-[44px] uppercase leading-none',
            escaped ? 'border-cash text-cash' : 'border-jail text-jail',
          )}
        >
          {escaped ? (rescue ? 'Freed' : 'Escaped') : 'Busted'}
        </div>
        {real && !real.saved ? (
          <p className="mt-5 animate-pulse text-[15px] text-ink-soft">
            {rescue ? 'Unlocking…' : 'Counting the cash…'}
          </p>
        ) : real?.saved?.error ? (
          <p className="mt-5 text-[15px] text-jail">{real.saved.error}</p>
        ) : escaped && rescue ? (
          <div className="mt-4 flex items-center justify-center gap-3">
            <img
              src={chogImage(rescue.id, 96)}
              alt=""
              className="h-14 w-14 rounded-full border-2 border-ink"
            />
            <p className="text-left text-[15px] leading-snug">
              <strong className="block">{rescue.name}</strong>
              {replay ? 'got broken out of jail' : 'is out of jail'}
            </p>
          </div>
        ) : escaped ? (
          <>
            <div className="mt-4 font-display text-[56px] leading-none tabular-nums">{money(shown)}</div>
            <p className="mt-1 text-[14px] text-ink-soft">
              {real
                ? `moved from ${owner} to ${real.myGang}`
                : replay
                  ? `taken from ${owner} by ${replay.robbers}`
                  : 'Practice run: no real cash moves.'}
            </p>
            <ul className="mx-auto mt-4 max-w-[240px] space-y-1 text-[14px]">
              <li className="flex justify-between">
                <span>Grabbed</span>
                <span className="font-mono tabular-nums">{money(carried)}</span>
              </li>
              <li className={cn('flex justify-between', !clean && 'text-ink-soft line-through')}>
                <span>Never seen</span>
                <span className="font-mono">×1.5</span>
              </li>
              {real?.saved?.result?.revenge && (
                <li className="flex justify-between font-semibold text-pink-deep">
                  <span>Revenge</span>
                  <span className="font-mono">+25%</span>
                </li>
              )}
            </ul>
          </>
        ) : (
          <>
            {caughtBy ? (
              <div className="mt-4 flex items-center justify-center gap-3">
                <img
                  src={chogImage(caughtBy.id, 96)}
                  alt=""
                  className="h-14 w-14 rounded-full border-2 border-ink"
                />
                <p className="text-left text-[15px] leading-snug">
                  <strong className="block">{caughtBy.name}</strong>
                  {replay ? 'caught them' : 'caught you'}
                </p>
              </div>
            ) : (
              <p className="mt-4 text-[15px]">
                {replay ? 'They didn’t get out.' : 'The doors locked before you got out.'}
              </p>
            )}
            {real ? (
              <p className="mt-3 text-[14px] leading-snug">
                Your Chog is in jail for 30 minutes.
                {real.saved?.result?.moved
                  ? ` ${real.myGang} paid ${owner} a ${money(real.saved.result.moved)} fine.`
                  : ''}
              </p>
            ) : replay ? (
              <p className="mt-3 text-[14px] text-ink-soft">Off to jail for 30 minutes.</p>
            ) : (
              <p className="mt-3 text-[14px] text-ink-soft">You dropped {money(carried)}.</p>
            )}
          </>
        )}
        {real ? (
          <button
            onClick={real.onLeave}
            disabled={!real.saved}
            className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-[8px] border-2 border-ink bg-pink font-display text-[22px] uppercase leading-none text-ink shadow-[3px_3px_0_0_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-50"
          >
            <span className="pt-1">Back to the city</span>
          </button>
        ) : null}
        {real?.saved?.result && real.replayHref && (
          <a
            href={real.replayHref}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block text-[14px] font-semibold underline underline-offset-2"
          >
            Watch the replay and share it
          </a>
        )}
        {real ? null : (
          <>
            <button
              onClick={onAgain}
              className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-[8px] border-2 border-ink bg-pink font-display text-[22px] uppercase leading-none text-ink shadow-[3px_3px_0_0_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              <ArrowClockwise size={20} weight="bold" />
              <span className="pt-1">{replay ? 'Watch again' : 'Again'}</span>
            </button>
            {onLeave ? (
              <button
                onClick={onLeave}
                className="mt-3 text-[14px] font-semibold underline underline-offset-2"
              >
                Back to the city
              </button>
            ) : (
              <p className="mt-2 hidden text-[12px] text-ink-soft sm:block">or press R</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
