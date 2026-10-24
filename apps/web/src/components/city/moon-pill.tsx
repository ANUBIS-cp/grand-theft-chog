import { Coins, Crosshair, Ghost, X } from '@phosphor-icons/react';
import { cn } from '@/lib/cn';

// The Blood Moon in the corner, under the map: a countdown to the next one during (and just before) Halloween
// week, and while it's up, how long is left, pulsing red.

/** The moon itself, in CSS: a red disc with a few craters and a glow. */
function Moon({ up, big }: { up: boolean; big?: boolean }) {
  return (
    <span
      className={cn(
        'relative inline-block shrink-0 rounded-full',
        big ? 'h-[18px] w-[18px] scale-[3.4]' : 'h-[18px] w-[18px]',
        up && 'shadow-[0_0_14px_4px_rgba(255,40,40,0.55)]',
      )}
      style={{ background: 'radial-gradient(circle at 35% 35%, #ff9a7a 0%, #e0262c 55%, #7a0c18 100%)' }}
    >
      <span className="absolute left-[4px] top-[9px] h-[4px] w-[4px] rounded-full bg-[#5a0812]/45" />
      <span className="absolute left-[10px] top-[4px] h-[3px] w-[3px] rounded-full bg-[#5a0812]/40" />
      <span className="absolute left-[11px] top-[11px] h-[2.5px] w-[2.5px] rounded-full bg-[#5a0812]/35" />
    </span>
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
          ? 'bg-[linear-gradient(135deg,#3a0610,#7a0c18)] shadow-[0_0_24px_rgba(255,40,50,0.45)] ring-1 ring-inset ring-[#ff5a5a]/60'
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
    line: 'Pumpkins full of cash pop up all over the city. Follow the column of light. First Chog to one keeps it; the gold ones pay $1,500.',
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
                Owner test: the red city, practice pumpkins round you, and a haunted practice vault. Only you
                see it, and nothing real is paid.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
