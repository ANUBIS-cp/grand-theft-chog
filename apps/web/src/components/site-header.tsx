import Link from 'next/link';
import { cn } from '@/lib/cn';

export function SiteHeader({ right, className }: { right?: React.ReactNode; className?: string }) {
  return (
    <header className={cn('flex h-16 items-center justify-between gap-3 border-b-2 border-ink', className)}>
      <Link
        href="/"
        className="shrink-0 whitespace-nowrap font-display text-[26px] uppercase leading-none tracking-tight pt-1 sm:text-[28px]"
        aria-label="Chog City home"
      >
        Chog City
      </Link>
      <nav className="flex min-w-0 items-center gap-1.5 sm:gap-2">{right}</nav>
    </header>
  );
}
