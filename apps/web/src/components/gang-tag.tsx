import { GANGS, type GangId } from '@chog-city/data';
import { GANG_COLOR } from '@/lib/theme';
import { cn } from '@/lib/cn';

/** A gang's tag, like a sticker slapped on a wall: its colour, slightly crooked. */
export function GangTag({
  gang,
  size = 'md',
  tilt = true,
  className,
}: {
  gang: GangId;
  size?: 'sm' | 'md' | 'lg';
  tilt?: boolean;
  className?: string;
}) {
  const c = GANG_COLOR[gang];
  // A stable tilt per gang so the same tag always leans the same way.
  const deg = tilt ? ((gang.length * 7) % 5) - 2.5 : 0;
  return (
    <span
      className={cn(
        'inline-block whitespace-nowrap rounded-[4px] border-2 border-ink font-display uppercase leading-none shadow-hard-sm',
        gang === 'jailbirds' && 'bg-[repeating-linear-gradient(90deg,#d9d9d9_0_6px,#bdbdbd_6px_12px)]',
        size === 'sm' && 'px-1.5 pb-[1px] pt-[3px] text-[13px]',
        size === 'md' && 'px-2 pb-[2px] pt-[5px] text-[18px]',
        size === 'lg' && 'px-3 pb-[3px] pt-[7px] text-[30px]',
        className,
      )}
      style={{
        background: gang === 'jailbirds' ? undefined : c.bg,
        color: c.fg,
        transform: `rotate(${deg}deg)`,
      }}
    >
      {GANGS[gang].name}
    </span>
  );
}
