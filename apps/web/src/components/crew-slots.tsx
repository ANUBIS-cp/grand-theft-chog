import type { Slot } from '@chog-city/game';
import { cn } from '@/lib/cn';
import { ChogPortrait } from './chog-portrait';
import { SkillDot } from './skill-badge';

export interface SlotView {
  slot: Slot;
  chog?: { id: number; name: string } | null;
}

/** A row of crew slots: each one shows the skill it needs, or the Chog that filled it. */
export function CrewSlots({
  slots,
  size = 44,
  className,
}: {
  slots: SlotView[];
  size?: number;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {slots.map((s, i) => {
        const need = s.slot === 'any' ? 'any' : s.slot.anyOf[0]!;
        const alt = s.slot !== 'any' && s.slot.anyOf.length > 1 ? s.slot.anyOf.slice(1) : [];
        return (
          <div key={i} className="relative">
            {s.chog ? (
              <ChogPortrait
                id={s.chog.id}
                name={s.chog.name}
                size="xs"
                className="!h-[44px] !w-[44px] rounded-full"
              />
            ) : (
              <SkillDot skill={need} size={size} className="border-dashed" />
            )}
            {alt.length > 0 && !s.chog && (
              <span className="absolute -bottom-1 -right-1 rounded-full border-2 border-ink bg-paper-raised px-1 font-mono text-[10px] leading-[14px]">
                +{alt.length}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
