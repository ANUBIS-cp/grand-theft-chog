import { SKILLS, type SkillId } from '@chog-city/data';
import { cn } from '@/lib/cn';
import { SkillIcon } from './skill-icons';

/** A skill as a small badge: glyph + name. `muted` for skills the Chog doesn't have. */
export function SkillBadge({
  skill,
  muted,
  compact,
  className,
}: {
  skill: SkillId;
  muted?: boolean;
  compact?: boolean;
  className?: string;
}) {
  return (
    <span
      title={SKILLS[skill].description}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border-2 font-semibold leading-none',
        compact ? 'h-7 px-2 text-[12px]' : 'h-8 px-2.5 text-[13px]',
        muted ? 'border-ink-faint bg-transparent text-ink-soft' : 'border-ink bg-white text-ink',
        className,
      )}
    >
      <SkillIcon skill={skill} width={compact ? 15 : 17} height={compact ? 15 : 17} />
      {SKILLS[skill].name}
    </span>
  );
}

/** Just the glyph in a circle, for crew slots and tight spaces. */
export function SkillDot({
  skill,
  size = 34,
  filled,
  className,
}: {
  skill: SkillId | 'any';
  size?: number;
  filled?: boolean;
  className?: string;
}) {
  return (
    <span
      title={skill === 'any' ? 'Any Chog' : SKILLS[skill].name}
      className={cn(
        'inline-grid place-items-center rounded-full border-2 border-ink',
        filled ? 'bg-ink text-paper-raised' : 'bg-white text-ink',
        className,
      )}
      style={{ width: size, height: size }}
    >
      {skill === 'any' ? (
        <span className="font-display text-[15px] leading-none" style={{ paddingTop: 2 }}>
          ANY
        </span>
      ) : (
        <SkillIcon skill={skill} width={size * 0.56} height={size * 0.56} />
      )}
    </span>
  );
}
