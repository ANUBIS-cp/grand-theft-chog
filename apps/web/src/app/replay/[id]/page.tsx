import { GANGS, displayName, getChog } from '@chog-city/data';
import { vaultDef } from '@chog-city/game/heist';
import { runForReplay } from '@chog-city/server';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GANG_COLOR } from '@/lib/theme';
import { db } from '@/server/db';
import { ReplayView } from './replay-view';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

const money = (n: number) => `$${n.toLocaleString('en-US')}`;
const name = (id: number) => displayName(getChog(id)!);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const run = await runForReplay(await db(), (await params).id);
  if (!run) return { title: 'Replay not found · Chog City' };
  const what =
    run.result === 'escaped'
      ? `${name(run.chogId)} robbed ${GANGS[run.target].name} of ${money(run.moved)}`
      : `${name(run.chogId)} got caught robbing ${GANGS[run.target].name}`;
  return { title: `${what} · Chog City`, description: 'Watch the robbery, move by move.' };
}

/** Plays back a robbery exactly as it happened: the server keeps every run's key presses. */
export default async function ReplayPage({ params }: Props) {
  const run = await runForReplay(await db(), (await params).id);
  const def = run ? vaultDef(run.vault) : undefined;
  if (!run || !def) notFound();
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
        <ReplayView
          vault={def}
          tier={run.tier}
          player={{ id: run.chogId, name: name(run.chogId), gang: GANGS[run.gang].name, powers: run.powers }}
          guards={run.guards.map((id) => ({ id, name: name(id) }))}
          owner={{
            name: GANGS[run.target].name,
            color: GANG_COLOR[run.target].bg,
            ink: GANG_COLOR[run.target].fg,
          }}
          replay={{ inputs: run.inputs, moved: run.moved, robbers: GANGS[run.gang].name }}
        />
      </div>
    </main>
  );
}
