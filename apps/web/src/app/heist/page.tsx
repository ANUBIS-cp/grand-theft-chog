import { CHOGS, GANGS, canJoinGang, displayName, gangOptions, getChog, tokenIdFor, type GangId } from '@chog-city/data';
import { chogInfo } from '@chog-city/game';
import { FIRST_VAULT, powersFor } from '@chog-city/game/heist';
import type { Metadata } from 'next';
import Link from 'next/link';
import { HeistGame } from '@/components/heist/heist-game';
import { GANG_COLOR } from '@/lib/theme';

export const metadata: Metadata = {
  title: 'Heist · Chog City',
  description: 'Sneak your Chog into a rival gang’s vault, grab the cash, get out.',
};

/** Shown when nobody picked a Chog: a Lazoor Gang Chog with laser eyes and a mask. */
const DEFAULT_CHOG = 1595;

export default async function HeistPage({ searchParams }: { searchParams: Promise<{ chog?: string }> }) {
  const { chog: asked } = await searchParams;
  const number = Number(asked);
  const valid = Number.isInteger(number) && number >= 1 && number <= CHOGS.length;
  const chog = getChog(tokenIdFor(valid ? number : DEFAULT_CHOG))!;
  const opts = gangOptions(chog);
  const mine: GangId | null = canJoinGang(chog, 'lazoor') ? 'lazoor' : (opts.born[0] ?? null);
  const owner: GangId = mine === 'lazoor' ? 'mcga' : 'lazoor';
  const crew = CHOGS.filter((c) => c.id !== chog.id && gangOptions(c).born.includes(owner));
  const guards = [crew[0], crew[Math.floor(crew.length / 3)], crew[Math.floor((crew.length * 2) / 3)]]
    .filter((c) => !!c)
    .map((c) => ({ id: c.id, name: displayName(c) }));

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-[#0b0918]">
      <header className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-1.5 text-[13px] text-white/70 sm:px-4">
        <Link href="/" className="font-display text-[18px] uppercase leading-none text-white">
          Chog City
        </Link>
        <form action="/heist" className="flex items-center gap-1.5">
          <label htmlFor="chog" className="hidden sm:inline">
            Play as Chog #
          </label>
          <label htmlFor="chog" className="sm:hidden">
            Chog #
          </label>
          <input
            id="chog"
            name="chog"
            inputMode="numeric"
            defaultValue={chog.metadataId}
            className="h-7 w-16 rounded-[4px] border border-white/25 bg-white/10 px-1.5 font-mono text-[13px] text-white"
          />
          <button className="h-7 rounded-[4px] bg-white/15 px-2 font-semibold text-white hover:bg-white/25">Go</button>
        </form>
      </header>
      <div className="min-h-0 w-full flex-1">
        <HeistGame
          vault={FIRST_VAULT}
          player={{ id: chog.id, name: displayName(chog), gang: mine ? GANGS[mine].name : null, powers: powersFor(chogInfo(chog.id).skills) }}
          guards={guards}
          owner={{ name: GANGS[owner].name, color: GANG_COLOR[owner].bg, ink: GANG_COLOR[owner].fg }}
        />
      </div>
    </main>
  );
}
