import { GANG_IDS, GANGS, displayName, getChog, type GangId } from '@chog-city/data';
import { tierFor, vaultFor } from '@chog-city/game/heist';
import { gangMembers, recentHits, vaultCash } from '@chog-city/server';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { VaultDoor } from '@/components/war/vault-door';
import { chogImage } from '@/lib/images';
import { GANG_COLOR } from '@/lib/theme';
import { ago } from '@/lib/time';
import { db } from '@/server/db';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ gang: string }> };

const money = (n: number) => `$${n.toLocaleString('en-US')}`;
const LEVEL = ['Light', 'Guarded', 'Heavy', 'Fortress'];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const g = (await params).gang as GangId;
  return { title: GANG_IDS.includes(g) ? `${GANGS[g].name} · Chog City` : 'Gang not found · Chog City' };
}

export default async function GangPage({ params }: Props) {
  const gang = (await params).gang as GangId;
  if (!GANG_IDS.includes(gang)) notFound();
  const d = await db();
  const [cash, members, hits] = await Promise.all([
    vaultCash(d),
    gangMembers(d, gang),
    recentHits(d, 30, gang),
  ]);
  const ranked = [...GANG_IDS].sort((a, b) => cash[b] - cash[a]);
  const rank = ranked.indexOf(gang) + 1;
  const tier = tierFor(cash[gang]);
  const now = Date.now();
  const traits = GANGS[gang].from.map(([, v]) => v);

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
      <div className="mx-auto max-w-[960px] px-4 pb-16">
        <section
          className="flex flex-wrap items-center gap-5 rounded-[16px] border-2 border-ink p-5 shadow-[5px_5px_0_0_#000]"
          style={{ background: GANG_COLOR[gang].bg, color: GANG_COLOR[gang].fg }}
        >
          <VaultDoor color={GANG_COLOR[gang].bg} tier={tier} size={96} />
          <div>
            <p className="text-[13px] font-semibold uppercase tracking-wide opacity-80">#{rank} of 16</p>
            <h1 className="font-display text-[48px] uppercase leading-none">{GANGS[gang].name}</h1>
            <p className="mt-1 font-display text-[36px] leading-none tabular-nums">{money(cash[gang])}</p>
            <p className="mt-1 text-[13px] opacity-80">
              {vaultFor(gang).name} · defences: {LEVEL[tier]} · joined by {traits.slice(0, 3).join(', ')}
              {traits.length > 3 ? '…' : ''}
            </p>
          </div>
        </section>

        <div className="mt-8 grid gap-8 md:grid-cols-2">
          <section aria-labelledby="members">
            <h2 id="members" className="font-display text-[30px] uppercase leading-none">
              Members
            </h2>
            {members.length === 0 ? (
              <p className="mt-2 text-[14px] text-white/60">Nobody has joined yet.</p>
            ) : (
              <ol className="mt-3 divide-y divide-white/10 rounded-[12px] border-2 border-white/10">
                {members.map((m, i) => (
                  <li key={m.id}>
                    <Link
                      href={`/chog/${m.id}`}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-white/5"
                    >
                      <span className="w-5 text-center font-display text-[16px] text-white/50">{i + 1}</span>
                      <img
                        src={chogImage(m.id, 96)}
                        alt=""
                        className="h-9 w-9 rounded-full border-2 border-ink"
                      />
                      <span className="flex-1 truncate font-semibold">{displayName(getChog(m.id)!)}</span>
                      <span className="text-right text-[12px] text-white/60">
                        <strong className="block text-[15px] text-[#ffd666]">{money(m.stolen)}</strong>
                        caught {m.catches}
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </section>
          <section aria-labelledby="hits">
            <h2 id="hits" className="font-display text-[30px] uppercase leading-none">
              Latest hits
            </h2>
            {hits.length === 0 ? (
              <p className="mt-2 text-[14px] text-white/60">No hits yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-white/10 rounded-[12px] border-2 border-white/10">
                {hits.map((h) => {
                  const ours = h.gang === gang;
                  const won = (ours && h.result === 'escaped') || (!ours && h.result === 'busted');
                  return (
                    <li key={h.id} className="flex items-center gap-3 px-3 py-2.5 text-[14px]">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${won ? 'bg-[#5fd17e]' : 'bg-jail'}`} />
                      <span className="flex-1">
                        {ours
                          ? h.result === 'escaped'
                            ? `Robbed ${GANGS[h.target].name} of ${money(h.moved)}`
                            : `Got caught robbing ${GANGS[h.target].name}`
                          : h.result === 'escaped'
                            ? `${GANGS[h.gang].name} took ${money(h.moved)} from us`
                            : `Caught a ${GANGS[h.gang].name} robber${h.moved ? ` (+${money(h.moved)} fine)` : ''}`}
                      </span>
                      <span className="shrink-0 text-[12px] text-white/50">{ago(h.at, now)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
