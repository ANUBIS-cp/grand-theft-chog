import { cn } from '@/lib/cn';

// The Blood Moon in the corner, under the map: a countdown to the next one during (and just before) Halloween
// week, and while it's up, how long is left, pulsing red.

/** The moon itself, in CSS: a red disc with a few craters and a glow. */
function Moon({ up }: { up: boolean }) {
  return (
    <span
      className={cn(
        'relative inline-block h-[18px] w-[18px] shrink-0 rounded-full',
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

export function MoonPill(props: { moon: { from: number; to: number }; now: number; onOpen?: () => void }) {
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
          {up ? 'BLOOD MOON' : 'Blood Moon in'}
        </span>
        <span className="mt-0.5 block text-[14px] font-semibold tabular-nums max-sm:text-[13px]">
          {up ? `${clock(moon.to - now)} left` : until(moon.from - now)}
        </span>
      </span>
    </button>
  );
}
