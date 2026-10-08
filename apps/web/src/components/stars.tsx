import { cn } from '@/lib/cn';

/** Wanted stars, 0 to 5. */
export function Stars({ n, size = 16, className }: { n: number; size?: number; className?: string }) {
  return (
    <span
      className={cn('inline-flex items-center gap-[2px]', className)}
      role="img"
      aria-label={`${n} of 5 Wanted stars`}
    >
      {Array.from({ length: 5 }, (_, i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="m12 2.8 2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3-4.6-4.4 6.3-.9z"
            fill={i < n ? 'var(--color-wanted)' : 'transparent'}
            stroke={i < n ? 'var(--color-ink)' : 'var(--color-ink-faint)'}
            strokeWidth={2}
            strokeLinejoin="round"
          />
        </svg>
      ))}
    </span>
  );
}
