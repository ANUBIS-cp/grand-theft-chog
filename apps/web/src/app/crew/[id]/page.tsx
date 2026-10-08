import { SKILLS } from '@chog-city/data';
import { boardFor, JOBS_BY_ID, type Crew } from '@chog-city/game';
import { activeEvents } from '@chog-city/server';
import { crews } from '@chog-city/server/db';
import { eq } from 'drizzle-orm';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CrewCard } from '@/components/play/crew-card';
import { SiteHeader } from '@/components/site-header';
import { Label } from '@/components/ui/panel';
import { nameOf } from '@/lib/describe';
import { db } from '@/server/db';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

async function load(id: string): Promise<Crew | null> {
  if (!/^\d+-\d+$/.test(id)) return null;
  const [row] = await (await db()).select().from(crews).where(eq(crews.id, id));
  return row ? { ...row, createdAt: row.createdAt.getTime() } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const c = await load((await params).id);
  const job = c ? JOBS_BY_ID.get(c.offerKey.split('@')[0]!) : null;
  return { title: job ? `Join the crew: ${job.name} · Chog City` : 'Crew · Chog City' };
}

/** The invite link people share. Shows the crew and sends players to the Crews tab to join. */
export default async function CrewPage({ params }: Props) {
  const crew = await load((await params).id);
  if (!crew) notFound();
  const [jobId, district] = crew.offerKey.split('@') as [string, string];
  const offer =
    boardFor(crew.day, district as never, activeEvents(Date.now())).find((o) => o.job.id === jobId) ?? null;
  const open = offer?.job.slots.filter((_, i) => crew.slots[i] === null) ?? [];
  const needs = open.map((s) => (s === 'any' ? 'any Chog' : s.anyOf.map((k) => SKILLS[k].name).join(' or ')));

  return (
    <main className="mx-auto max-w-[620px] px-4 pb-20 sm:px-6">
      <SiteHeader />
      <div className="pt-8">
        <Label>{nameOf(crew.leaderId)} is putting a crew together</Label>
        <CrewCard crew={crew} offer={offer} className="mt-4">
          {crew.status === 'open' ? (
            <>
              <p className="text-[15px] font-semibold">Still needed: {needs.join(', ')}.</p>
              <Link
                href="/play?tab=crews"
                className="flex h-14 items-center justify-center rounded-[6px] border-2 border-ink bg-pink pt-1 font-display text-[22px] uppercase leading-none shadow-hard"
              >
                Join with my Chog
              </Link>
              <p className="text-[12px] text-ink-soft">
                You&apos;ll log in with your wallet, then pick this crew on the Crews tab. Open crews close at
                18:00 UTC.
              </p>
            </>
          ) : (
            <p className="text-[14px] text-ink-soft">
              This crew is closed. Start your own from the Jobs tab.
            </p>
          )}
        </CrewCard>
      </div>
    </main>
  );
}
