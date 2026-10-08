import { GANGS, SKILLS, displayName, getChog, skillSources } from '@chog-city/data';
import { chogInfo } from '@chog-city/game';
import { POWERS, powersFor } from '@chog-city/game/heist';
import { chogHits, heistRecord, isChogId, ownerOf } from '@chog-city/server';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SkillIcon } from '@/components/skill-icons';
import { GANG_COLOR } from '@/lib/theme';
import { chogImage } from '@/lib/images';
import { ago, formatLeft } from '@/lib/time';
import { db } from '@/server/db';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

const money = (n: number) => `$${n.toLocaleString('en-US')}`;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = Number((await params).id);
  const c = isChogId(id) ? getChog(id) : undefined;
  if (!c) return { title: 'Chog not found · Chog City' };
  const name = displayName(c);
  return { title: `${name} · Chog City`, description: `${name}'s heists, powers and gang in Chog City.` };
}

export default async function ChogPage({ params }: Props) {
  const id = Number((await params).id);
  if (!isChogId(id)) notFound();
  const chog = getChog(id)!;
  const name = displayName(chog);
  const now = Date.now();
  const d = await db();
  const [record, owner, hits] = await Promise.all([heistRecord(d, id), ownerOf(d, id), chogHits(d, id)]);
  const skills = chogInfo(id).skills;
  const powers = powersFor(skills);
  const gang = record?.gang ?? null;
  const jailed = record?.jailedUntil && record.jailedUntil.getTime() > now ? record.jailedUntil.getTime() : null;
  const stats: [string, string][] = [
    ['Stolen', money(record?.stolen ?? 0)],
    ['Escapes', String(record?.escapes ?? 0)],
    ['Busted', String(record?.busts ?? 0)],
    ['Robbers caught', String(record?.catches ?? 0)],
    ['Best run', money(record?.best ?? 0)],
  ];

  return (
    <main className="min-h-dvh bg-[#0b0918] text-white">
      <header className="mx-auto flex max-w-[960px] items-center justify-between px-4 py-3">
        <Link href="/" className="font-display text-[22px] uppercase leading-none">
          Chog City
        </Link>
        <Link href="/" className="text-[13px] font-semibold hover:underline">
          Gang vaults
        </Link>
      </header>
      <div className="mx-auto grid max-w-[960px] gap-8 px-4 pb-16 pt-2 md:grid-cols-[320px_1fr]">
        <section>
          <img
            src={chogImage(id, 640)}
            alt={name}
            className="aspect-square w-full rounded-[14px] border-2 border-ink shadow-[5px_5px_0_0_#000]"
          />
          <h1 className="mt-4 font-display text-[44px] uppercase leading-none">{name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-white/60">
            {gang ? (
              <Link
                href={`/gangs/${gang}`}
                className="rounded-[5px] border-2 border-ink px-1.5 pt-1 font-display text-[15px] uppercase leading-none"
                style={{ background: GANG_COLOR[gang].bg, color: GANG_COLOR[gang].fg }}
              >
                {GANGS[gang].name}
              </Link>
            ) : (
              <span>No gang yet</span>
            )}
            {owner && <span>Owner {owner.slice(0, 6)}…{owner.slice(-4)}</span>}
          </div>
          {jailed && (
            <p className="mt-3 inline-block rounded-[6px] bg-jail px-2 py-1 text-[13px] font-semibold">
              In jail, out in {formatLeft(jailed - now)}
            </p>
          )}
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              href="/"
              className="inline-flex h-12 items-center rounded-[8px] border-2 border-ink bg-pink px-4 pt-1 font-display text-[20px] uppercase leading-none text-ink shadow-[3px_3px_0_0_#000]"
            >
              Play
            </Link>
            <Link
              href={`/heist?chog=${chog.metadataId}`}
              className="inline-flex h-12 items-center rounded-[8px] border-2 border-ink bg-[#ffd666] px-4 pt-1 font-display text-[20px] uppercase leading-none text-ink shadow-[3px_3px_0_0_#000]"
            >
              Practice as it
            </Link>
          </div>
        </section>

        <div className="space-y-8">
          <section aria-labelledby="record">
            <h2 id="record" className="font-display text-[30px] uppercase leading-none">
              Record
            </h2>
            <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {stats.map(([k, v]) => (
                <div key={k} className="rounded-[10px] border-2 border-white/10 bg-[#1d1838] px-3 py-2.5">
                  <dt className="text-[12px] text-white/60">{k}</dt>
                  <dd className="font-display text-[24px] leading-none tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section aria-labelledby="powers">
            <h2 id="powers" className="font-display text-[30px] uppercase leading-none">
              Powers
            </h2>
            <p className="mt-1 text-[14px] text-white/60">They come from its traits.</p>
            <ul className="mt-3 space-y-2">
              {powers.map((p) => {
                const skill = skills.find((s) => powersFor([s]).includes(p));
                const from = skill ? skillSources(chog, skill) : [];
                return (
                  <li key={p} className="flex items-start gap-3 rounded-[10px] border-2 border-white/10 bg-[#1d1838] p-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[7px] border-2 border-ink bg-paper-raised text-ink">
                      {skill && <SkillIcon skill={skill} width={26} height={26} />}
                    </span>
                    <div>
                      <strong className="font-display text-[20px] uppercase leading-none">{POWERS[p].name}</strong>
                      <p className="text-[14px] text-white/80">{POWERS[p].does}</p>
                      {from.length > 0 && (
                        <p className="mt-0.5 text-[12px] text-white/50">
                          From {from.map(([type, value]) => `${type}: ${value}`).join(', ')}
                          {skill ? ` (${SKILLS[skill].name})` : ''}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <section aria-labelledby="hits">
            <h2 id="hits" className="font-display text-[30px] uppercase leading-none">
              Latest hits
            </h2>
            {hits.length === 0 ? (
              <p className="mt-2 text-[14px] text-white/60">No hits yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-white/10 rounded-[12px] border-2 border-white/10">
                {hits.map((h) => (
                  <li key={h.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-[14px]">
                    <span>
                      {h.caughtBy === id && h.chogId !== id ? (
                        <>
                          Caught a {GANGS[h.gang].name} robber in its vault
                        </>
                      ) : h.result === 'escaped' ? (
                        <>
                          Robbed {GANGS[h.target].name} of <strong className="text-[#ffd666]">{money(h.moved)}</strong>
                          {h.revenge ? ' (revenge)' : ''}
                        </>
                      ) : (
                        <>Got caught in {GANGS[h.target].name}’s vault</>
                      )}
                    </span>
                    <span className="shrink-0 text-[12px] text-white/50">{ago(h.at, now)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
