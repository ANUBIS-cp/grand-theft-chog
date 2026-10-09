import { GANGS, displayName, getChog } from '@chog-city/data';
import { vaultDef } from '@chog-city/game/heist';
import { rushMap, rushRules, rushSeed } from '@chog-city/game/rush';
import { runForReplay } from '@chog-city/server';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GANG_COLOR } from '@/lib/theme';
import { db } from '@/server/db';
import { ReplayView, RushReplayView } from './replay-view';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

const money = (n: number) => `$${n.toLocaleString('en-US')}`;
const name = (id: number) => displayName(getChog(id)!);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const run = await runForReplay(await db(), (await params).id);
  if (!run) return { title: 'Replay not found · Chog City' };
  const what = run.prisoner
    ? `${name(run.chogId)} ${run.result === 'escaped' ? 'broke' : 'tried to break'} ${name(run.prisoner)} out of jail`
    : run.result === 'escaped'
      ? `${name(run.chogId)} robbed ${GANGS[run.target].name} of ${money(run.moved)}`
      : `${name(run.chogId)} got caught robbing ${GANGS[run.target].name}`;
  return { title: `${what} · Chog City`, description: 'Watch the robbery, move by move.' };
}

/** Plays back a robbery exactly as it happened: the server keeps every run's key presses. */
export default async function ReplayPage({ params }: Props) {
  const run = await runForReplay(await db(), (await params).id);
  const rush = run ? rushMap(run.vault) : null;
  const def = run && !rush ? vaultDef(run.vault) : undefined;
  if (!run || (!rush && !def)) notFound();
  const owner = run.prisoner
    ? { name: 'The jail', color: '#ff5a4f', ink: '#111111' }
    : { name: GANGS[run.target].name, color: GANG_COLOR[run.target].bg, ink: GANG_COLOR[run.target].fg };
  const player = { id: run.chogId, name: name(run.chogId), gang: GANGS[run.gang].name, powers: run.powers };
  const guards = run.guards.map((id) => ({ id, name: name(id) }));
  const rescue = run.prisoner ? { id: run.prisoner, name: name(run.prisoner) } : undefined;
  const replay = {
    inputs: run.inputs,
    moved: run.moved,
    robbers: GANGS[run.gang].name,
    defenders: run.defenders,
  };
  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-[#0b0918]">
      <header className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-1.5 text-[13px] text-white/70 sm:px-4">
        <Link href="/" className="font-display text-[18px] uppercase leading-none text-white">
          Chog City
        </Link>
        <p className="min-w-0 truncate">
          <Link href={`/chog/${run.chogId}`} className="font-semibold text-white hover:underline">
            {name(run.chogId)}
          </Link>{' '}
          of {GANGS[run.gang].name}
          {run.revenge ? ', on a revenge hit' : ''}
        </p>
      </header>
      <div className="min-h-0 w-full flex-1">
        {rush ? (
          <RushReplayView
            mapId={rush.id}
            rules={rushRules(run.tier, !!run.prisoner)}
            seed={rushSeed(run.id)}
            player={player}
            guards={guards}
            owner={owner}
            rescue={rescue}
            replay={replay}
          />
        ) : (
          <ReplayView
            vault={def!}
            tier={run.tier}
            player={player}
            guards={guards}
            owner={owner}
            rescue={rescue}
            replay={replay}
          />
        )}
      </div>
    </main>
  );
}
