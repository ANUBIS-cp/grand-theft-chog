'use client';

import { GANGS, GANG_IDS, type GangId } from '@chog-city/data';
import {
  BAND,
  DIAL,
  DIAL_REST,
  FACES,
  LEFT,
  LOCK_LIMIT,
  LOCK_SLIPS,
  LOCK_TPS,
  RIGHT,
  SPAN,
  TAP,
  WIRE,
  WIRES,
  dialNumber,
  faceOf,
  lockQuiet,
  showing,
  startLock,
  stepLock,
  type LockInput,
  type LockKind,
  type LockState,
} from '@chog-city/game/lock';
import { ArrowLeft, ArrowRight, Bell, BellSlash } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { GANG_COLOR } from '@/lib/theme';
import { Sound } from '@/components/heist/sound';
import { cn } from '@/lib/cn';

// Stage 1 of a robbery: the lock on the vault door, a few seconds of timing or memory in the robbed gang's
// look. The taps go to the server, which replays them (quiet or loud) before you're let in.

const STEP_MS = 1000 / LOCK_TPS;

const HOW: Record<LockKind, { title: string; how: string }> = {
  tumbler: { title: 'Pick the lock', how: 'Tap when the pin is in the gold band' },
  wires: { title: 'Cut the alarm', how: 'Watch the order, then cut the wires in it' },
  reels: { title: 'Crack the slot lock', how: 'Stop each reel on the gang’s building' },
  dial: { title: 'Spin the dial', how: 'Turn to each number and hold still on it' },
};

const WIRE_COLORS = ['#ff5a4f', '#3a86ff', '#ffd23f', '#2ec27e', '#f4f1de'];

export function LockGame(props: {
  gang: GangId;
  seed: number;
  /** Done: the inputs (for the server) and whether it was quiet. */
  onDone: (inputs: LockInput[], quiet: boolean) => void;
}) {
  const { gang, seed } = props;
  const color = GANG_COLOR[gang];
  const st = useRef({
    s: startLock(gang, seed),
    inputs: [] as LockInput[],
    queue: [] as LockInput[],
    held: 0 as LockInput,
    acc: 0,
    last: 0,
    started: false,
    shake: 0,
    flash: 0,
  });
  const sound = useRef<Sound | null>(null);
  const [, redraw] = useState(0);
  const [result, setResult] = useState<'quiet' | 'loud' | null>(null);
  const done = useRef(props.onDone);
  done.current = props.onDone;

  const press = (i: LockInput) => {
    sound.current ??= new Sound();
    sound.current.unlock();
    st.current.started = true;
    st.current.queue.push(i);
  };
  const hold = (i: LockInput) => {
    sound.current ??= new Sound();
    sound.current.unlock();
    st.current.started = true;
    st.current.held = i;
  };

  useEffect(() => {
    const s = st.current;
    let raf = 0;
    let lastClick = -1;
    const loop = (now: number) => {
      if (!s.last) s.last = now;
      s.acc += Math.min(200, now - s.last);
      s.last = now;
      // The clock waits for your first touch, so reading the instructions is free.
      while (s.started && s.acc >= STEP_MS && s.s.phase === 'play') {
        s.acc -= STEP_MS;
        const input = s.queue.shift() ?? s.held;
        s.inputs.push(input);
        stepLock(s.s, input);
        if (s.s.last === 'hit') {
          s.flash = now;
          if (s.s.kind === 'tumbler') sound.current?.pin();
          else if (s.s.kind === 'wires') sound.current?.snip();
          else if (s.s.kind === 'reels') sound.current?.clunk();
          else sound.current?.pin();
        } else if (s.s.last === 'slip') {
          s.shake = now;
          sound.current?.slip();
        }
        if (s.s.kind === 'dial') {
          const n = dialNumber(s.s.dial);
          if (n !== lastClick) sound.current?.dialTick();
          lastClick = n;
        }
      }
      if (!s.started) s.acc = 0;
      if (s.s.phase !== 'play' && !result) {
        const quiet = lockQuiet(s.s);
        setResult(quiet ? 'quiet' : 'loud');
        if (quiet) sound.current?.unlocked();
        else sound.current?.alarmOn();
        setTimeout(() => {
          sound.current?.alarmOff();
          done.current(s.inputs, quiet);
        }, 1400);
        redraw((n) => n + 1);
        return;
      }
      redraw((n) => n + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const key = (e: KeyboardEvent, down: boolean) => {
      const k = e.key.toLowerCase();
      if (s.s.kind === 'dial') {
        const dir = k === 'arrowleft' || k === 'a' ? LEFT : k === 'arrowright' || k === 'd' ? RIGHT : 0;
        if (!dir) return;
        e.preventDefault();
        if (down) hold(dir);
        else if (s.held === dir) s.held = 0;
        return;
      }
      if (!down || e.repeat) return;
      if (s.s.kind === 'wires') {
        const n = Number(k);
        if (n >= 1 && n <= WIRES) press(WIRE(n - 1));
        return;
      }
      if (k === ' ' || k === 'enter' || k === 'e') {
        e.preventDefault();
        press(TAP);
      }
    };
    const kd = (e: KeyboardEvent) => key(e, true);
    const ku = (e: KeyboardEvent) => key(e, false);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      sound.current?.alarmOff();
    };
    // The loop reads everything through refs; it runs once.
  }, []);

  const s = st.current.s;
  const now = typeof performance !== 'undefined' ? performance.now() : 0;
  const left = Math.max(0, LOCK_LIMIT - s.tick) / LOCK_TPS;
  const loud = s.slips > LOCK_SLIPS;
  const shaking = now - st.current.shake < 260;
  const how = HOW[s.kind];

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0b0918] px-4 text-white">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{ background: `radial-gradient(ellipse at 50% 40%, ${color.bg}55, transparent 65%)` }}
      />
      <div className="relative w-full max-w-[440px]">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="font-display text-[15px] uppercase tracking-wide text-white/60">
              Break in · {GANGS[gang].name}
            </p>
            <h1 className="font-display text-[40px] uppercase leading-none">{how.title}</h1>
          </div>
          <span
            className={cn(
              'mb-1 inline-flex items-center gap-1.5 rounded-full border-[3px] border-ink px-3 pb-0.5 pt-1 font-display text-[18px] uppercase leading-none text-ink shadow-[0_3px_0_0_#000]',
              loud ? 'bg-jail' : 'bg-[#7cf0c4]',
            )}
          >
            {loud ? <Bell size={16} weight="fill" /> : <BellSlash size={16} weight="fill" />}
            {loud ? 'Loud' : 'Quiet'}
          </span>
        </div>
        {/* The clock: run it out and you force the door, loudly. */}
        <div className="mt-3 h-3 overflow-hidden rounded-full border-2 border-ink bg-black/50">
          <div
            className={cn('h-full rounded-full', left < 4 ? 'bg-jail' : 'bg-[#ffd666]')}
            style={{ width: `${(left / (LOCK_LIMIT / LOCK_TPS)) * 100}%` }}
          />
        </div>

        <div
          className={cn(
            'relative mt-4 select-none rounded-[20px] border-[3px] border-ink p-4 shadow-[0_6px_0_0_#000]',
            shaking && 'animate-[lock-shake_260ms_ease-in-out]',
          )}
          style={{ background: `linear-gradient(180deg, ${color.bg}, ${shade(color.bg)})` }}
          onPointerDown={(e) => {
            if (s.kind === 'tumbler' || s.kind === 'reels') {
              e.preventDefault();
              press(TAP);
            }
          }}
        >
          {s.kind === 'tumbler' && <Tumbler s={s} />}
          {s.kind === 'wires' && <Wires s={s} onCut={(i) => press(WIRE(i))} />}
          {s.kind === 'reels' && <Reels s={s} gang={gang} />}
          {s.kind === 'dial' && <Dial s={s} onHold={hold} onRelease={() => (st.current.held = 0)} />}
          {result && (
            <div className="absolute inset-0 grid place-items-center rounded-[17px] bg-[#0b0918]/75">
              <div
                className={cn(
                  'animate-[banner-in_380ms_ease-out_both] -rotate-3 rounded-[10px] border-[3px] px-5 pb-1 pt-2 text-center font-display uppercase leading-none',
                  result === 'quiet' ? 'border-[#7cf0c4] text-[#7cf0c4]' : 'border-jail text-jail',
                )}
              >
                <span className="block text-[46px]">{result === 'quiet' ? 'You’re in' : 'Alarm!'}</span>
                <span className="block pb-1 text-[16px] text-white/80">
                  {result === 'quiet'
                    ? 'Quietly. The guards are on patrol.'
                    : 'The guards know you’re coming.'}
                </span>
              </div>
            </div>
          )}
        </div>
        <p className="mt-4 text-center text-[16px] font-semibold">
          {st.current.started ? how.how : `${how.how}. The clock starts on your first move.`}
        </p>
        <p className="mt-1 text-center text-[13px] text-white/55">
          {s.kind === 'dial'
            ? 'Hold ← → (or A D), or the buttons'
            : s.kind === 'wires'
              ? 'Tap a wire, or keys 1–5'
              : 'Tap anywhere, or Space'}
          {` · ${LOCK_SLIPS} slip allowed, then it gets loud`}
        </p>
      </div>
    </div>
  );
}

function shade(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.round(v * 0.55));
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

/** Four pins bouncing in the lock; a gold band across the middle where each one has to be caught. */
function Tumbler({ s }: { s: LockState }) {
  const W = 360;
  const H = 230;
  const slot = 54;
  const gap = (W - 4 * slot) / 5;
  const top = 18;
  const bottom = H - 18;
  const band = ((bottom - top) * BAND) / SPAN;
  const mid = (top + bottom) / 2;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <rect x={6} y={6} width={W - 12} height={H - 12} rx={18} fill="#14102a" stroke="#000" strokeWidth={4} />
      {s.pins.map((p, i) => {
        const x = gap + i * (slot + gap);
        return (
          <rect
            key={`slot${i}`}
            x={x}
            y={top}
            width={slot}
            height={bottom - top}
            rx={14}
            fill="#0b0918"
            stroke="#000"
            strokeWidth={3}
          />
        );
      })}
      {/* The gold band sits over the slots: that's where each pin has to be caught. */}
      <rect x={14} y={mid - band / 2} width={W - 28} height={band} rx={8} fill="#ffd666" opacity={0.32} />
      <line x1={14} x2={W - 14} y1={mid} y2={mid} stroke="#ffd666" strokeWidth={2} strokeDasharray="6 6" />
      {s.pins.map((p, i) => {
        const x = gap + i * (slot + gap);
        const set = i < s.done;
        const now = i === s.done;
        const y = top + ((bottom - top) * p.y) / SPAN;
        return (
          <g key={i}>
            {now && (
              <rect
                x={x - 4}
                y={top - 4}
                width={slot + 8}
                height={bottom - top + 8}
                rx={17}
                fill="none"
                stroke="#fff"
                strokeWidth={3}
                opacity={0.8}
              />
            )}
            <rect
              x={x + 6}
              y={y - 16}
              width={slot - 12}
              height={32}
              rx={10}
              fill={set ? '#ffd666' : now ? '#ffffff' : '#6b6590'}
              stroke="#000"
              strokeWidth={3}
            />
            {set && <circle cx={x + slot / 2} cy={y} r={5} fill="#000" />}
          </g>
        );
      })}
    </svg>
  );
}

/** Five alarm wires: the order flashes, then you cut them in it. */
function Wires({ s, onCut }: { s: LockState; onCut: (i: number) => void }) {
  const lit = showing(s);
  const cut = new Set(s.order.slice(0, s.done));
  const watching = lit !== null;
  return (
    <div className="rounded-[14px] border-[3px] border-ink bg-[#14102a] p-3">
      <div className="mb-2 flex items-center justify-between font-display text-[15px] uppercase leading-none">
        <span className={watching ? 'text-[#ffd666]' : 'text-white/60'}>{watching ? 'Watch…' : 'Cut!'}</span>
        <span className="flex gap-1">
          {s.order.map((_, i) => (
            <span
              key={i}
              className={cn(
                'h-3 w-6 rounded-full border-2 border-ink',
                i < s.done ? 'bg-[#7cf0c4]' : 'bg-white/15',
              )}
            />
          ))}
        </span>
      </div>
      {WIRE_COLORS.map((c, i) => {
        const glow = lit === i;
        const isCut = cut.has(i);
        return (
          <button
            key={i}
            type="button"
            disabled={watching || isCut}
            onPointerDown={(e) => {
              e.preventDefault();
              onCut(i);
            }}
            className="relative flex h-[42px] w-full items-center gap-2"
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[6px] border-2 border-ink bg-[#3a3556] font-mono text-[12px] text-white/70">
              {i + 1}
            </span>
            <span className="relative h-full flex-1">
              {/* The wire: two halves that part when it's cut. */}
              {[0, 1].map((half) => (
                <span
                  key={half}
                  className="absolute top-1/2 h-[10px] -translate-y-1/2 rounded-full border-2 border-ink transition-transform duration-150"
                  style={{
                    left: half ? '52%' : 0,
                    right: half ? 0 : '52%',
                    background: c,
                    boxShadow: glow ? `0 0 18px 4px ${c}` : undefined,
                    transform: isCut
                      ? `translateX(${half ? 10 : -10}px) rotate(${half ? 6 : -6}deg)`
                      : undefined,
                    opacity: watching && !glow ? 0.45 : 1,
                  }}
                />
              ))}
              {!isCut && (
                <span
                  className="absolute top-1/2 h-[10px] w-[8%] -translate-y-1/2 border-y-2 border-ink"
                  style={{ left: '46%', background: c, opacity: watching && !glow ? 0.45 : 1 }}
                />
              )}
            </span>
            <span className="h-7 w-7 shrink-0 rounded-[6px] border-2 border-ink bg-[#3a3556]" />
          </button>
        );
      })}
    </div>
  );
}

/** Three reels of gang buildings: stop each on the robbed gang's. */
function Reels({ s, gang }: { s: LockState; gang: GangId }) {
  const others = GANG_IDS.filter((g) => g !== gang);
  const faceGang = (f: number) => (f === s.target ? gang : others[f]!);
  const H = 76;
  return (
    <div>
      <div className="mb-3 flex items-center justify-center gap-2 font-display text-[16px] uppercase leading-none">
        <span className="pt-0.5">Stop on</span>
        <span className="grid h-10 w-14 place-items-center rounded-[8px] border-2 border-ink bg-white">
          <img src={`/art/city/gang-${gang}.webp`} alt="" className="max-h-8 max-w-12 object-contain" />
        </span>
      </div>
      <div className="flex justify-center gap-2.5">
        {s.reels.map((r, i) => {
          const pos = r.at / SPAN;
          const centre = faceOf(r.at);
          const now = i === s.done;
          return (
            <div
              key={i}
              className={cn(
                'relative w-[104px] overflow-hidden rounded-[12px] border-[3px] bg-[#f4f1de]',
                r.stopped ? 'border-[#ffd666]' : now ? 'border-white' : 'border-ink',
              )}
              style={{ height: H * 2.2 }}
            >
              {[-2, -1, 0, 1, 2].map((d) => {
                const f = (((centre + d) % FACES) + FACES) % FACES;
                // How far this face sits from the window's middle, in faces.
                const off = centre + d - pos;
                return (
                  <div
                    key={d}
                    className="absolute inset-x-0 grid place-items-center"
                    style={{ height: H, top: H * 1.1 - H / 2 + off * H }}
                  >
                    <img
                      src={`/art/city/gang-${faceGang(f)}.webp`}
                      alt=""
                      draggable={false}
                      className="max-h-[60px] max-w-[88px] object-contain"
                    />
                  </div>
                );
              })}
              <div className="pointer-events-none absolute inset-x-0 top-0 h-[34%] bg-gradient-to-b from-black/45 to-transparent" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[34%] bg-gradient-to-t from-black/45 to-transparent" />
              <div className="pointer-events-none absolute inset-x-1 top-1/2 h-[64px] -translate-y-1/2 rounded-[8px] border-2 border-dashed border-ink/50" />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** A safe dial: turn to each number and rest on it until it clicks. */
function Dial({
  s,
  onHold,
  onRelease,
}: {
  s: LockState;
  onHold: (i: LockInput) => void;
  onRelease: () => void;
}) {
  const R = 118;
  const angle = -(s.dial / (DIAL * 4)) * 360;
  const want = s.combo[s.done];
  const on = want !== undefined && dialNumber(s.dial) === want;
  const btn =
    'grid h-14 w-16 place-items-center rounded-[12px] border-[3px] border-ink bg-white text-ink shadow-[0_4px_0_0_#000] active:translate-y-[2px]';
  const holdProps = (i: LockInput) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      onHold(i);
    },
    onPointerUp: onRelease,
    onPointerCancel: onRelease,
  });
  return (
    <div className="flex flex-col items-center">
      <div className="mb-2 flex items-center gap-2 font-display uppercase leading-none">
        {s.combo.map((n, i) => (
          <span
            key={i}
            className={cn(
              'grid h-11 w-14 place-items-center rounded-[8px] border-[3px] border-ink pt-1 text-[26px] tabular-nums',
              i < s.done
                ? 'bg-[#7cf0c4] text-ink'
                : i === s.done
                  ? 'bg-white text-ink'
                  : 'bg-black/40 text-white/40',
            )}
          >
            {i <= s.done ? n : '??'}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button type="button" className={btn} {...holdProps(LEFT)} aria-label="Turn left">
          <ArrowLeft size={26} weight="bold" />
        </button>
        <svg viewBox="-130 -136 260 266" className="w-[220px]">
          <polygon
            points="0,-128 -9,-142 9,-142"
            fill="#ffd666"
            stroke="#000"
            strokeWidth={3}
            transform="translate(0,14)"
          />
          <g transform={`rotate(${angle})`}>
            <circle r={R} fill="#22203a" stroke="#000" strokeWidth={5} />
            <circle r={R - 16} fill="#2f2b4d" stroke="#000" strokeWidth={2} />
            {Array.from({ length: DIAL }, (_, i) => {
              const a = (i / DIAL) * Math.PI * 2;
              const long = i % 5 === 0;
              return (
                <g key={i}>
                  <line
                    x1={Math.sin(a) * (R - 4)}
                    y1={-Math.cos(a) * (R - 4)}
                    x2={Math.sin(a) * (R - (long ? 16 : 10))}
                    y2={-Math.cos(a) * (R - (long ? 16 : 10))}
                    stroke={i === want ? '#ffd666' : '#ffffff'}
                    strokeWidth={long ? 3 : 1.5}
                  />
                  {long && (
                    <text
                      x={Math.sin(a) * (R - 32)}
                      y={-Math.cos(a) * (R - 32) + 6}
                      textAnchor="middle"
                      fontSize={17}
                      fill="#fff"
                      fontFamily="var(--font-display, sans-serif)"
                      transform={`rotate(${(i / DIAL) * 360} ${Math.sin(a) * (R - 32)} ${-Math.cos(a) * (R - 32)})`}
                    >
                      {i}
                    </text>
                  )}
                </g>
              );
            })}
            <circle r={34} fill="#15132a" stroke="#000" strokeWidth={4} />
          </g>
          {/* Resting on the right number fills the ring until it clicks. */}
          <circle
            r={40}
            fill="none"
            stroke={on ? '#7cf0c4' : 'transparent'}
            strokeWidth={8}
            strokeDasharray={`${(s.rest / DIAL_REST) * 251} 251`}
            transform="rotate(-90)"
          />
          <text
            y={11}
            textAnchor="middle"
            fontSize={32}
            fill="#fff"
            fontFamily="var(--font-display, sans-serif)"
          >
            {dialNumber(s.dial)}
          </text>
        </svg>
        <button type="button" className={btn} {...holdProps(RIGHT)} aria-label="Turn right">
          <ArrowRight size={26} weight="bold" />
        </button>
      </div>
    </div>
  );
}
