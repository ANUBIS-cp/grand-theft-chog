'use client';

import { BAGS } from '@chog-city/game/city';
import { HandGrabbing, Truck as TruckIcon } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { Sound } from '@/components/heist/sound';
import { cn } from '@/lib/cn';

// The cash truck's controls over the city: the "Jump on" button when you've caught up with its back doors, the
// lock on the back doors while you ride (a small panel, so you still see the truck driving under you), the bags
// you're carrying, and how it ended.

export type TruckStage =
  | { at: 'chase'; near: boolean }
  | { at: 'riding' }
  | { at: 'loot'; bags: number }
  | { at: 'end'; outcome: 'home' | 'caught' | 'time' | 'gone'; bags: number };

const money = (n: number) => `$${n.toLocaleString('en-US')}`;

export function TruckHud(props: {
  stage: TruckStage;
  /** How hard the truck is turning (-1..1), read every frame: corners shake the lock. */
  turning: () => number;
  onJump: () => void;
  onPicked: () => void;
  onThrown: () => void;
  onAgain: () => void;
  onDone: () => void;
}) {
  const { stage } = props;
  // E or Space jumps on (the city's own "use" keys).
  const jump = useRef(props.onJump);
  jump.current = props.onJump;
  useEffect(() => {
    if (stage.at !== 'chase' || !stage.near) return;
    const k = (e: KeyboardEvent) => {
      if (e.code !== 'KeyE' && e.code !== 'Space') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      jump.current();
    };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [stage]);

  return (
    <>
      {stage.at === 'chase' && stage.near && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[max(200px,calc(env(safe-area-inset-bottom)+190px))] z-40 flex justify-center sm:bottom-[150px]">
          <button
            onClick={props.onJump}
            className="btn btn-gold press pointer-events-auto animate-[glass-in_220ms_cubic-bezier(.2,.9,.3,1.2)] px-7 text-[18px] shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
          >
            <HandGrabbing size={22} weight="fill" />
            <span>Jump on</span>
          </button>
        </div>
      )}
      {stage.at === 'riding' && (
        <TruckLock turning={props.turning} onPicked={props.onPicked} onThrown={props.onThrown} />
      )}
      {stage.at === 'loot' && (
        <div className="pointer-events-none fixed inset-x-0 top-[max(70px,calc(env(safe-area-inset-top)+62px))] z-40 flex justify-center">
          <div className="glass-strong flex items-center gap-2.5 rounded-full px-4 py-2 text-white shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
            <img src="/art/truck/bag.webp" alt="" className="h-7 w-7 object-contain" />
            <span className="font-display text-[20px] leading-none tabular-nums text-[#ffd23f]">
              {money(stage.bags * BAGS.cash)}
            </span>
            <span className="text-[13px] text-white/75">
              {stage.bags === 0
                ? 'Grab the bags!'
                : `${stage.bags} bag${stage.bags === 1 ? '' : 's'} · run home`}
            </span>
          </div>
        </div>
      )}
      {stage.at === 'end' && <TruckEnd stage={stage} onAgain={props.onAgain} onDone={props.onDone} />}
    </>
  );
}

function TruckEnd(props: {
  stage: Extract<TruckStage, { at: 'end' }>;
  onAgain: () => void;
  onDone: () => void;
}) {
  const { outcome, bags } = props.stage;
  const won = outcome === 'home';
  const title = won
    ? `${money(bags * BAGS.cash)} home!`
    : outcome === 'caught'
      ? 'Caught!'
      : outcome === 'gone'
        ? 'It got away'
        : 'Too slow';
  const line = won
    ? `You got ${bags} bag${bags === 1 ? '' : 's'} home. In the real heist that cash goes into your gang’s vault.`
    : outcome === 'caught'
      ? 'The guards caught you and took the bags back. Fewer bags, faster legs.'
      : outcome === 'gone'
        ? 'The truck drove out of town. Next time, wait for it at a corner: that’s where it slows down.'
        : 'The streets are shut. Run the bags home quicker next time.';
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[max(20px,env(safe-area-inset-bottom))] sm:bottom-6">
      <div className="glass-strong w-full max-w-[420px] animate-[slide-up_380ms_cubic-bezier(.32,.72,0,1)] rounded-[28px] p-5 text-white">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'grid h-12 w-12 place-items-center rounded-2xl',
              won ? 'bg-[#1f3a2a]' : 'bg-white/10',
            )}
          >
            {won ? (
              <img src="/art/truck/bag.webp" alt="" className="h-9 w-9 object-contain" />
            ) : (
              <TruckIcon size={26} weight="fill" />
            )}
          </span>
          <h2 className={cn('font-display text-[28px] leading-none', won && 'text-[#ffd23f]')}>{title}</h2>
        </div>
        <p className="mt-3 text-[15px] leading-snug text-white/80">{line}</p>
        <p className="mt-2 text-[12px] text-white/50">
          Preview: only you see the truck, and nothing is paid.
        </p>
        <div className="mt-4 flex gap-2">
          <button onClick={props.onAgain} className="btn btn-gold press flex-1">
            <span>Again</span>
          </button>
          <button onClick={props.onDone} className="btn btn-glass press flex-1">
            <span>Done</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/** Pins in the back doors' lock: tap when the pin is in the gold band. Corners make the pin jump about. */
const PINS = 3;
const MISSES = 2;

function TruckLock(props: { turning: () => number; onPicked: () => void; onThrown: () => void }) {
  const [, redraw] = useState(0);
  const st = useRef({
    pin: 0,
    misses: 0,
    phase: Math.random() * 6.28,
    pos: 0.5,
    band: 0.25 + Math.random() * 0.5,
    shake: 0,
    flash: 0,
    done: false,
  });
  const sound = useRef<Sound | null>(null);
  const cb = useRef(props);
  cb.current = props;

  useEffect(() => {
    sound.current = new Sound();
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const s = st.current;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const turn = Math.abs(cb.current.turning());
      // Faster on each pin, and a corner throws it about.
      s.phase += dt * (2.6 + s.pin * 0.7 + turn * 2.2);
      s.pos = 0.5 + 0.46 * Math.sin(s.phase) + turn * 0.05 * Math.sin(now / 37);
      redraw((n) => n + 1);
      if (!s.done) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const k = (e: KeyboardEvent) => {
      if (e.code !== 'Space' && e.code !== 'KeyE' && e.code !== 'Enter') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      tap();
    };
    window.addEventListener('keydown', k, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', k, true);
    };
    // Runs once; everything is read through refs.
  }, []);

  const BAND = 0.17;
  function tap() {
    const s = st.current;
    if (s.done) return;
    sound.current?.unlock();
    if (Math.abs(s.pos - s.band) <= BAND / 2) {
      s.pin++;
      s.flash = performance.now();
      if (s.pin >= PINS) {
        s.done = true;
        sound.current?.unlocked();
        setTimeout(() => cb.current.onPicked(), 180);
      } else {
        sound.current?.pin();
        s.band = 0.15 + Math.random() * 0.7;
      }
    } else {
      s.misses++;
      s.shake = performance.now();
      sound.current?.slip();
      if (s.misses >= MISSES) {
        s.done = true;
        setTimeout(() => cb.current.onThrown(), 250);
      }
    }
  }

  const s = st.current;
  const now = typeof performance !== 'undefined' ? performance.now() : 0;
  const shaking = now - s.shake < 300;
  const lit = now - s.flash < 220;
  const turn = Math.abs(props.turning());
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 flex select-none justify-center px-4 pb-[max(18px,env(safe-area-inset-bottom))] sm:bottom-6"
      style={{ touchAction: 'manipulation' }}
      onPointerDown={(e) => {
        e.preventDefault();
        tap();
      }}
    >
      <div
        className={cn(
          'glass-strong w-full max-w-[420px] rounded-[26px] p-4 text-white',
          shaking && 'animate-[lock-shake_300ms_ease-in-out] ring-2 ring-sys-red',
        )}
        style={{ transform: `rotate(${(props.turning() * 2.2).toFixed(2)}deg)` }}
      >
        <div className="flex items-baseline justify-between">
          <p className="font-display text-[20px] leading-none">Pick the lock</p>
          <p className="text-[13px] tabular-nums text-white/70">
            {Math.min(s.pin + 1, PINS)} of {PINS}
          </p>
        </div>
        <p className="mt-1 text-[14px] text-white/75">
          {turn > 0.5 ? 'Hold on, it’s turning!' : 'Tap when the pin is in the gold band.'}
        </p>
        <div className="relative mt-3 h-12 overflow-hidden rounded-2xl bg-black/45 ring-1 ring-inset ring-white/10">
          <div
            className={cn(
              'absolute inset-y-1 rounded-xl transition-colors',
              lit ? 'bg-[#fff1a8]' : 'bg-[#ffd23f]/85',
            )}
            style={{ left: `calc(${(s.band - BAND / 2) * 100}% )`, width: `${BAND * 100}%` }}
          />
          <div
            className="absolute inset-y-0 w-[6px] -translate-x-1/2 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)]"
            style={{ left: `${s.pos * 100}%` }}
          />
        </div>
        <div className="mt-2.5 flex items-center justify-between text-[12px] text-white/60">
          <span className="flex gap-1.5">
            {Array.from({ length: PINS }, (_, i) => (
              <span
                key={i}
                className={cn('h-2.5 w-6 rounded-full', i < s.pin ? 'bg-[#ffd23f]' : 'bg-white/15')}
              />
            ))}
          </span>
          <span>
            {MISSES - s.misses === 1 ? 'One more miss and you fall off' : 'Miss twice and you fall off'}
          </span>
        </div>
      </div>
    </div>
  );
}
