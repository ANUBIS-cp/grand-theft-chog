import { cn } from '@/lib/cn';
import { chogImage } from '@/lib/images';
import { Stars } from './stars';

type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
const px: Record<Size, number> = { xs: 36, sm: 56, md: 96, lg: 168, xl: 280 };

/**
 * A Chog as a sticker: the art in an ink frame. Optional overlays: jail bars, Wanted stars, level.
 * The art is never covered by more than a corner chip, except jail bars, which are the point.
 */
export function ChogPortrait({
  id,
  name,
  size = 'md',
  jailed,
  wanted = 0,
  level,
  className,
  priority,
}: {
  id: number;
  name: string;
  size?: Size;
  jailed?: boolean;
  wanted?: number;
  level?: number;
  className?: string;
  priority?: boolean;
}) {
  const w = px[size];
  const img = w <= 96 ? (w <= 48 ? 96 : 256) : 640;
  const small = w < 96;
  return (
    <figure
      className={cn(
        'relative shrink-0 overflow-hidden border-2 border-ink bg-paper-sunk',
        small ? 'rounded-[5px]' : 'rounded-[8px] shadow-hard',
        className,
      )}
      style={{ width: w, height: w }}
    >
      {/* A plain img on purpose: images are pre-sized on our server, no optimizer needed. */}
      <img
        src={chogImage(id, img as 96 | 256 | 640)}
        alt={name}
        width={w}
        height={w}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        className="h-full w-full object-cover"
      />
      {jailed && (
        <span
          aria-label="In jail"
          className="absolute inset-0 bg-[repeating-linear-gradient(90deg,transparent_0_14%,var(--color-ink)_14%_18%)] opacity-90"
        />
      )}
      {!small && wanted > 0 && (
        <span className="absolute left-1.5 top-1.5 rounded-[4px] border-2 border-ink bg-paper-raised px-1 py-0.5">
          <Stars n={wanted} size={size === 'md' ? 10 : 13} />
        </span>
      )}
      {!small && level !== undefined && (
        <span className="absolute bottom-1.5 right-1.5 rounded-[4px] border-2 border-ink bg-ink px-1.5 pb-[1px] pt-[3px] font-display text-[13px] leading-none text-paper-raised">
          LV {level}
        </span>
      )}
    </figure>
  );
}
