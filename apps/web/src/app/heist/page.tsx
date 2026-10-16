import {
  CHOGS,
  GANGS,
  canJoinGang,
  displayName,
  gangOptions,
  getChog,
  pickFaces,
  tokenIdFor,
  type GangId,
} from '@chog-city/data';
import { chogInfo } from '@chog-city/game';
import { powersFor } from '@chog-city/game/heist';
import { RUSH_BANK, RUSH_CASINO, rushRules } from '@chog-city/game/rush';
import type { Metadata } from 'next';
import Link from 'next/link';
import { RushGame } from '@/components/rush/rush-game';
import { GANG_COLOR } from '@/lib/theme';

export const metadata: Metadata = {
  title: 'Heist · Chog World',
  description: 'Rob a rival gang’s vault: grab the cash, crack the safe, dodge the guards, get out.',
};

/** Shown when nobody picked a Chog: a Lazoor Gang Chog with laser eyes and a mask. */
const DEFAULT_CHOG = 1595;

export default async function HeistPage({
  searchParams,
}: {
  searchParams: Promise<{ chog?: string; map?: string; tier?: string }>;
}) {
  const { chog: asked, map, tier } = await searchParams;
  const mapId = map === 'casino' ? RUSH_CASINO.id : RUSH_BANK.id;
  const level = Math.max(0, Math.min(3, Number(tier) || 1));
  const number = Number(asked);
  const valid = Number.isInteger(number) && number >= 1 && number <= CHOGS.length;
  const chog = getChog(tokenIdFor(valid ? number : DEFAULT_CHOG))!;
  const opts = gangOptions(chog);
  const mine: GangId | null = canJoinGang(chog, 'lazoor') ? 'lazoor' : (opts.born[0] ?? null);
  const owner: GangId = mine === 'lazoor' ? 'mcga' : 'lazoor';
  const guards = pickFaces(owner, 4, [chog.id]).map((id) => ({ id, name: displayName(getChog(id)!) }));

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-[#0b0918]">
      <header className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-1.5 text-[13px] text-white/70 sm:px-4">
        <Link href="/" className="font-display text-[13px] leading-none text-white">
          Chog World
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
          <button className="h-7 rounded-[4px] bg-white/15 px-2 font-semibold text-white hover:bg-white/25">
            Go
          </button>
        </form>
      </header>
      <div className="min-h-0 w-full flex-1">
        <RushGame
          mapId={mapId}
          rules={rushRules(level)}
          coach
          player={{
            id: chog.id,
            name: displayName(chog),
            gang: mine ? GANGS[mine].name : null,
            powers: powersFor(chogInfo(chog.id).skills),
          }}
          guards={guards}
          owner={{ name: GANGS[owner].name, color: GANG_COLOR[owner].bg, ink: GANG_COLOR[owner].fg }}
        />
      </div>
    </main>
  );
}
