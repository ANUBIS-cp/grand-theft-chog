'use client';
import { useEffect, useState } from 'react';
import { formatLeft } from '@/lib/time';

export { formatLeft };

/** "9h 12m", ticking. Renders the server value first so there is no layout jump. */
export function Countdown({ to, className }: { to: number; className?: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);
  return (
    <time dateTime={new Date(to).toISOString()} className={className} suppressHydrationWarning>
      {now === null ? '' : formatLeft(to - now)}
    </time>
  );
}
