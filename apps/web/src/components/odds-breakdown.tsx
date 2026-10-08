import type { Odds } from '@chog-city/game';
import { cn } from '@/lib/cn';

/** Why the odds are what they are: one line per part, so nothing is hidden. */
export function OddsBreakdown({ odds, className }: { odds: Odds; className?: string }) {
  const sum = odds.parts.reduce((s, p) => s + p.pct, 0);
  return (
    <div className={cn('font-mono text-[13px]', className)}>
      <ul className="space-y-1">
        {odds.parts.map((p) => (
          <li key={p.label} className="flex items-baseline justify-between gap-4">
            <span className="text-ink-soft">{p.label}</span>
            <span className={cn('tabular-nums', p.pct < 0 ? 'text-jail' : 'text-ink')}>
              {p.label === 'Base' ? '' : p.pct > 0 ? '+' : ''}
              {p.pct}%
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex items-baseline justify-between border-t-2 border-ink pt-2 font-semibold">
        <span>Your odds</span>
        <span className="tabular-nums">{odds.odds}%</span>
      </div>
      {sum !== odds.odds && (
        <p className="mt-1 text-[11px] text-ink-soft">Odds always stay between 5% and 95%.</p>
      )}
    </div>
  );
}
