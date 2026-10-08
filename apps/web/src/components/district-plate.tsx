import { DISTRICTS, type DistrictId } from '@chog-city/data';
import { DISTRICT_COLOR } from '@/lib/theme';
import { cn } from '@/lib/cn';

/** A street-name plate for a district. */
export function DistrictPlate({
  district,
  size = 'md',
  className,
}: {
  district: DistrictId;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const c = DISTRICT_COLOR[district];
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-[5px] border-2 border-ink font-display uppercase leading-none tracking-wide',
        'shadow-[inset_0_0_0_2px_rgb(255_255_255/0.55)]',
        size === 'sm' && 'px-1.5 pb-[1px] pt-[3px] text-[13px]',
        size === 'md' && 'px-2.5 pb-[2px] pt-[5px] text-[17px]',
        size === 'lg' && 'px-3.5 pb-[3px] pt-[7px] text-[26px]',
        className,
      )}
      style={{ background: c.bg, color: c.fg }}
    >
      {DISTRICTS[district].name}
    </span>
  );
}
