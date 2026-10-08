'use client';
import { ChogPortrait } from '@/components/chog-portrait';
import { cn } from '@/lib/cn';
import type { ChogView } from '@/lib/views';

/** Every Chog in the wallet; tap one to play it. */
export function MyChogs({
  chogs,
  selected,
  onSelect,
}: {
  chogs: ChogView[];
  selected: number;
  onSelect: (id: number) => void;
}) {
  if (chogs.length < 2) return null;
  return (
    <nav aria-label="Your Chogs" className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
      <ul className="flex gap-2.5">
        {chogs.map((c) => (
          <li key={c.id}>
            <button
              onClick={() => onSelect(c.id)}
              aria-pressed={c.id === selected}
              className={cn(
                'flex w-[78px] flex-col items-center gap-1 rounded-[8px] border-2 p-1.5 transition-colors',
                c.id === selected
                  ? 'border-ink bg-paper-raised shadow-hard-sm'
                  : 'border-transparent hover:bg-ink-faint',
              )}
            >
              <ChogPortrait id={c.id} name={c.name} size="sm" jailed={!!c.jailUntil} />
              <span className="w-full truncate text-center text-[11px] font-semibold">
                {c.name.replace('Chog ', '')}
              </span>
              <span className="font-mono text-[10px] text-ink-soft">
                {c.jailUntil ? 'in jail' : `${c.movesLeft} moves`}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
