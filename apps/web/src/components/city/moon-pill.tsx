import { Coins, Crosshair, Ghost, X } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

// The Blood Moon: the moonrise when it comes up, and in the corner under the map its badge: the moon itself while
// it's up (with how long is left), or a countdown to the next one, with its card.

const MOON_SRC = '/art/halloween/blood-moon.webp?v=2';

/** The moonrise lasts this long (ms) before the moon settles in; a tap skips it. */
const RISE_MS = 3800;

/**
 * The moment the Blood Moon rises: the city dims, the moon rises big into the middle with its name, then it
 * flies into its badge under the map, so you know where it lives while it's up.
 */
export function Moonrise({ preview, onDone }: { preview: boolean; onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  /** Where the moon flies to (its badge), from where it is now, and how much it shrinks. */
  const [to, setTo] = useState<{ x: number; y: number; k: number } | null>(null);
  const moonEl = useRef<HTMLDivElement>(null);
  const done = useRef(onDone);
  done.current = onDone;
  const leave = useRef(() => {});
  leave.current = () => {
    if (leaving) return;
    const m = moonEl.current?.getBoundingClientRect();
    const t = document.querySelector('[data-moon-pill]')?.getBoundingClientRect();
    if (m && t?.width)
      setTo({
        x: t.left + t.width / 2 - (m.left + m.width / 2),
        y: t.top + t.height / 2 - (m.top + m.height / 2),
        k: t.width / m.width,
      });
    setLeaving(true);
    setTimeout(() => done.current(), 950);
  };
  useEffect(() => {
    const t = setTimeout(() => leave.current(), RISE_MS);
    return () => clearTimeout(t);
  }, []);
  return (
    <div
      className="pointer-events-auto fixed inset-0 z-[60] overflow-hidden"
      onPointerDown={() => leave.current()}
      role="presentation"
    >
      <div
        className={cn(
          'absolute inset-0 animate-[fade-in_700ms_ease-out] bg-[radial-gradient(circle_at_50%_40%,rgba(46,3,12,0.88),rgba(4,2,7,0.96)_70%)] backdrop-blur-[3px] transition-opacity duration-[900ms]',
          leaving && 'opacity-0',
        )}
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-[clamp(20px,4vh,36px)] px-6 pb-[6vh]">
        <div
          ref={moonEl}
          className={cn(
            'relative aspect-square w-[clamp(210px,60vw,360px)] transition-[translate,scale,opacity] duration-[900ms] ease-[cubic-bezier(.55,0,.2,1)]',
            leaving && !to && '-translate-y-[55vh] scale-[0.55] opacity-0',
          )}
          style={leaving && to ? { translate: `${to.x}px ${to.y}px`, scale: String(to.k) } : undefined}
        >
          <div className="h-full w-full animate-[moonrise-up_2100ms_cubic-bezier(.16,.84,.24,1)_both]">
            <div
              className={cn(
                'absolute -inset-[38%] animate-[sky-breathe_3.2s_ease-in-out_infinite] rounded-full bg-[radial-gradient(circle,rgba(255,50,60,0.42),rgba(170,10,30,0.16)_42%,transparent_68%)] transition-opacity duration-500',
                leaving && 'opacity-0',
              )}
            />
            <img
              src={MOON_SRC}
              alt=""
              draggable={false}
              className="relative h-full w-full select-none object-contain drop-shadow-[0_0_40px_rgba(255,40,50,0.55)]"
            />
          </div>
        </div>
        <div
          className={cn(
            'text-center transition-opacity duration-500',
            leaving && 'opacity-0',
          )}
        >
          <p className="animate-[moonrise-title_1300ms_cubic-bezier(.2,.8,.2,1)_900ms_both] font-display text-[clamp(23px,6.6vw,42px)] uppercase leading-none tracking-[0.16em] text-[#ffc2c2] [text-shadow:0_0_24px_rgba(255,40,60,0.75),0_2px_0_rgba(80,0,10,0.6)]">
            The Blood Moon
            <br />
            has risen
          </p>
          <p className="mx-auto mt-3 max-w-[340px] animate-[fade-in_900ms_ease-out_1600ms_both] text-[15px] font-medium leading-snug text-white/75 [text-wrap:balance]">
            {preview
              ? 'Preview: only you can see it, and nothing real is paid.'
              : 'For one hour: pumpkins in the streets, haunted vaults and +50% on every haul.'}
          </p>
        </div>
      </div>
    </div>
  );
}

/** The moon (the drawn picture, docs/art-halloween.md), glowing while it's up. */
function Moon({ up, big }: { up: boolean; big?: boolean }) {
  // Bigger in the badge while it's up, poking out of it: that's where the moon lives.
  const size = big ? 62 : up ? 40 : 20;
  return (
    <img
      src={MOON_SRC}
      alt=""
      draggable={false}
      data-moon-pill={big ? undefined : ''}
      width={size}
      height={size}
      style={{ width: size, height: size, maxWidth: 'none' }}
      className={cn(
        'pointer-events-none aspect-square shrink-0 select-none rounded-full object-contain',
        up && !big && '-my-2.5',
        up &&
          (big ? 'shadow-[0_0_36px_8px_rgba(255,40,40,0.45)]' : 'shadow-[0_0_10px_1px_rgba(255,40,40,0.35)]'),
      )}
    />
  );
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const until = (ms: number) => {
  const m = Math.max(1, Math.ceil(ms / 60_000));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
};

export function MoonPill(props: {
  moon: { from: number; to: number };
  now: number;
  preview?: boolean;
  onOpen?: () => void;
}) {
  const { moon, now } = props;
  const up = now >= moon.from && now < moon.to;
  return (
    <button
      onClick={props.onOpen}
      className={cn(
        'press pointer-events-auto inline-flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3 text-left text-white max-sm:py-1 max-sm:pr-2.5',
        up
          ? 'bg-[linear-gradient(135deg,#3a0610,#7a0c18)] shadow-[0_6px_18px_rgba(0,0,0,0.4)] ring-1 ring-inset ring-[#ff5a5a]/50'
          : 'glass',
      )}
    >
      <Moon up={up} />
      <span className="leading-none">
        <span
          className={cn(
            'block font-display text-[12px] tracking-wide max-sm:text-[11px]',
            up ? 'text-[#ff8a8a]' : 'text-white/70',
          )}
        >
          {up ? (props.preview ? 'PREVIEW' : 'BLOOD MOON') : 'Blood Moon in'}
        </span>
        <span className="mt-0.5 block text-[14px] font-semibold tabular-nums max-sm:text-[13px]">
          {up ? `${clock(moon.to - now)} left` : until(moon.from - now)}
        </span>
      </span>
    </button>
  );
}

/** A pumpkin, for the card (there's no pumpkin in the icon set). */
function PumpkinIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[20px] w-[20px]" aria-hidden>
      <path d="M12.4 6.2c.2-1.6 1.2-2.7 2.8-3.1l.4 1.1c-1 .3-1.6 1-1.8 2.1z" fill="#5e8c22" />
      <ellipse cx="8" cy="13.5" rx="5" ry="6.2" fill="#e8730f" />
      <ellipse cx="16" cy="13.5" rx="5" ry="6.2" fill="#e8730f" />
      <ellipse cx="12" cy="13.5" rx="5.2" ry="6.8" fill="#ff9a2e" />
      <path
        d="M9 11.6l1.6-1.6.6 2.1zM15 11.6l-1.6-1.6-.6 2.1zM8.6 15.2c1.8 1.6 5 1.6 6.8 0l-.9 1.9h-5z"
        fill="#4a1600"
      />
    </svg>
  );
}

const ROWS = [
  {
    icon: <Ghost size={20} weight="fill" className="text-[#9dffd9]" />,
    bg: 'bg-[#0e2a25]',
    title: 'Haunted vaults',
    line: 'The lights go out. Follow the glints of cash, watch for red eyes, and keep away from the ghost: it drifts through walls.',
  },
  {
    icon: <PumpkinIcon />,
    bg: 'bg-[#3a1a06]',
    title: 'Pumpkin Rush',
    line: 'Pumpkins full of cash pop up all over the city and hop away when you get close. Corner one to grab it; the gold ones are quick and pay $1,500.',
  },
  {
    icon: <Coins size={20} weight="fill" className="text-[#ffd23f]" />,
    bg: 'bg-[#3a2c06]',
    title: '+50% on every haul',
    line: 'Every robbery carried home while the moon is up pays half as much again.',
  },
  {
    icon: <Crosshair size={20} weight="bold" className="text-[#ff5a6a]" />,
    bg: 'bg-[#3a0a12]',
    title: 'Most Wanted, every day',
    line: 'Yesterday’s top robber has a bounty on their head. Tag them in the city to take it.',
  },
];

/** What the Blood Moon is, in full, with a way to try it now. */
export function MoonCard(props: {
  moon: { from: number; to: number };
  now: number;
  preview: boolean;
  /** The owner only: try it before the week (a preview in this browser). */
  onTry?: () => void;
  onEnd: () => void;
  onClose: () => void;
}) {
  const { moon, now, preview } = props;
  const up = now >= moon.from && now < moon.to;
  return (
    <div
      className="pointer-events-auto fixed inset-0 z-50 grid place-items-center bg-black/55 p-4 backdrop-blur-[3px] animate-[glass-in_260ms_ease-out]"
      onClick={props.onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[400px] overflow-hidden rounded-[28px] bg-[#120a14]/95 text-white shadow-[0_30px_80px_rgba(120,0,20,0.55)] ring-1 ring-inset ring-[#ff5a5a]/25 animate-[glass-in_420ms_cubic-bezier(.2,.9,.3,1)]"
      >
        <div className="relative flex items-center gap-5 bg-[radial-gradient(120%_140%_at_85%_-10%,rgba(255,40,40,0.45),transparent_60%)] px-6 pb-4 pt-6">
          <span className="grid h-[62px] w-[62px] place-items-center">
            <Moon up big />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-[24px] leading-none text-[#ff8a8a]">The Blood Moon</h2>
            <p className="mt-1.5 text-[13px] leading-snug text-white/70">
              {preview
                ? 'Preview: practice only, nothing real is paid'
                : up
                  ? `Up now · ${clock(moon.to - now)} left`
                  : `Every night 27-31 Oct · 18:00-19:00 UTC · next in ${until(moon.from - now)}`}
            </p>
          </div>
          <button
            onClick={props.onClose}
            aria-label="Close"
            className="press absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-white/10 text-white/80"
          >
            <X size={16} weight="bold" />
          </button>
        </div>
        <ul className="grid gap-3 px-6 py-2">
          {ROWS.map((r) => (
            <li key={r.title} className="flex items-start gap-3">
              <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-[11px]', r.bg)}>
                {r.icon}
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold leading-tight">{r.title}</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-white/65">{r.line}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="px-6 pb-6 pt-4">
          {preview ? (
            <button onClick={props.onEnd} className="btn press btn-glass w-full">
              <span>End the preview</span>
            </button>
          ) : up ? (
            <button onClick={props.onClose} className="btn press btn-primary w-full">
              <span>Go hunting</span>
            </button>
          ) : !props.onTry ? (
            <button onClick={props.onClose} className="btn press btn-primary w-full">
              <span>Got it</span>
            </button>
          ) : (
            <>
              <button onClick={props.onTry} className="btn press btn-primary w-full">
                <span>Try it now</span>
              </button>
              <p className="mt-2 text-center text-[12px] leading-snug text-white/50">
                Owner test: the Blood Moon city, practice pumpkins round you, and a haunted practice vault.
                Only you see it, and nothing real is paid.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
