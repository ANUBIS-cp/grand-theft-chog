'use client';
import { useEffect, useState } from 'react';

export function formatLeft(ms: number): string {
  if (ms <= 0) return 'now';
  const m = Math.ceil(ms / 60_000);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
}

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
