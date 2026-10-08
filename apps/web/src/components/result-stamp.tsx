'use client';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/cn';

export type StampKind = 'done' | 'busted' | 'got-away' | 'jailed' | 'free';

const STYLE: Record<StampKind, { text: string; color: string }> = {
  done: { text: 'Done', color: 'var(--color-cash)' },
  busted: { text: 'Busted', color: 'var(--color-jail)' },
  'got-away': { text: 'Got away', color: 'var(--color-ink)' },
  jailed: { text: 'Jailed', color: 'var(--color-jail)' },
  free: { text: 'Free', color: 'var(--color-cash)' },
};

/** The rubber stamp that lands on a result. */
export function ResultStamp({ kind, className }: { kind: StampKind; className?: string }) {
  const reduce = useReducedMotion();
  const s = STYLE[kind];
  return (
    <motion.span
      role="status"
      initial={reduce ? false : { scale: 1.9, opacity: 0, rotate: -14 }}
      animate={{ scale: 1, opacity: 1, rotate: -7 }}
      transition={{ type: 'spring', stiffness: 520, damping: 22, mass: 0.7 }}
      className={cn(
        'inline-block rounded-[10px] border-[5px] px-5 pb-1 pt-3 font-display text-[54px] uppercase leading-none tracking-wide',
        'shadow-[inset_0_0_0_3px_var(--color-paper-raised)]',
        className,
      )}
      style={{ color: s.color, borderColor: s.color, mixBlendMode: 'multiply' }}
    >
      {s.text}
    </motion.span>
  );
}
