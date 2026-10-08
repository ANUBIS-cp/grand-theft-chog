'use client';
import { Briefcase, MapTrifold, UsersThree } from '@phosphor-icons/react';
import { ChogPortrait } from '@/components/chog-portrait';
import { cn } from '@/lib/cn';
import type { ChogView } from '@/lib/views';

export type Tab = 'jobs' | 'crews' | 'city' | 'chog';

/** Bottom bar on phones (thumb reach), a row of tabs on wider screens. */
export function TabBar({
  tab,
  onTab,
  chog,
  badges,
}: {
  tab: Tab;
  onTab: (t: Tab) => void;
  chog: ChogView;
  badges: Partial<Record<Tab, number>>;
}) {
  const items: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'jobs', label: 'Jobs', icon: <Briefcase size={22} weight={tab === 'jobs' ? 'fill' : 'bold'} /> },
    {
      id: 'crews',
      label: 'Crews',
      icon: <UsersThree size={22} weight={tab === 'crews' ? 'fill' : 'bold'} />,
    },
    { id: 'city', label: 'City', icon: <MapTrifold size={22} weight={tab === 'city' ? 'fill' : 'bold'} /> },
    {
      id: 'chog',
      label: chog.jailUntil ? 'Jail' : 'My Chog',
      icon: (
        <ChogPortrait
          id={chog.id}
          name={chog.name}
          size="xs"
          jailed={!!chog.jailUntil}
          className="!h-6 !w-6 !rounded-full !border-[1.5px]"
        />
      ),
    },
  ];
  return (
    <nav
      aria-label="Game"
      className={cn(
        'fixed inset-x-0 bottom-0 z-20 border-t-2 border-ink bg-paper-raised pb-[env(safe-area-inset-bottom)]',
        'sm:static sm:z-auto sm:rounded-[8px] sm:border-2 sm:pb-0 sm:shadow-hard',
      )}
    >
      <ul className="mx-auto grid max-w-[640px] grid-cols-4 sm:max-w-none">
        {items.map((it) => (
          <li key={it.id}>
            <button
              onClick={() => onTab(it.id)}
              aria-current={tab === it.id ? 'page' : undefined}
              className={cn(
                'relative flex h-16 w-full flex-col items-center justify-center gap-1 text-[12px] font-semibold sm:h-12 sm:flex-row sm:gap-2 sm:text-[14px]',
                tab === it.id ? 'text-ink' : 'text-ink-soft hover:text-ink',
              )}
            >
              {tab === it.id && (
                <span className="absolute inset-x-3 top-0 h-[3px] rounded-b bg-pink sm:inset-x-6 sm:bottom-0 sm:top-auto sm:rounded-b-none sm:rounded-t" />
              )}
              {it.icon}
              {it.label}
              {!!badges[it.id] && (
                <span className="absolute right-[22%] top-2 grid h-[18px] min-w-[18px] place-items-center rounded-full border-2 border-ink bg-pink px-1 font-mono text-[10px] leading-none text-ink sm:static">
                  {badges[it.id]}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
