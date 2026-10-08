import { cn } from '@/lib/cn';
import type { HTMLAttributes } from 'react';

/** The basic sticker card: raised paper, ink outline, hard shadow. */
export function Panel({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      className={cn('rounded-[8px] border-2 border-ink bg-paper-raised shadow-hard', className)}
    />
  );
}

export function Label({ className, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      {...rest}
      className={cn('font-mono text-[11px] uppercase tracking-[0.12em] text-ink-soft', className)}
    />
  );
}
