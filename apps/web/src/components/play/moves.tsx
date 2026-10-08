import { MOVES_PER_DAY } from '@chog-city/game';
import { cn } from '@/lib/cn';

/** Five dots: filled = moves left today. */
export function MovesDots({ left, className }: { left: number; className?: string }) {
  return (
    <span
      className={cn('inline-flex items-center gap-1', className)}
      role="img"
      aria-label={`${left} of ${MOVES_PER_DAY} moves left today`}
    >
      {Array.from({ length: MOVES_PER_DAY }, (_, i) => (
        <span
          key={i}
          className={cn(
            'h-2.5 w-2.5 rounded-full border-2 border-ink',
            i < left ? 'bg-pink' : 'bg-transparent',
          )}
        />
      ))}
    </span>
  );
}
