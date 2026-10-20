import { GANG_IDS, GANGS, displayName, getChog, type GangId } from '@chog-city/data';
import { tierNow, vaultFor } from '@chog-city/game/heist';
import { gangMembers, recentHits, vaults } from '@chog-city/server';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageShell } from '@/components/ui/page-shell';
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
  return { title: GANG_IDS.includes(g) ? `${GANGS[g].name} · Grand Theft Chog` : 'Gang not found · Grand Theft Chog' };
}

export default async function GangPage({ params }: Props) {
  const gang = (await params).gang as GangId;
  if (!GANG_IDS.includes(gang)) notFound();
  const d = await db();
  const [vs, members, hits] = await Promise.all([vaults(d), gangMembers(d, gang), recentHits(d, 30, gang)]);
  const now = Date.now();
  const cash = Object.fromEntries(GANG_IDS.map((g) => [g, vs[g].cash])) as Record<GangId, number>;
  const ranked = [...GANG_IDS].sort((a, b) => cash[b] - cash[a]);
  const rank = ranked.indexOf(gang) + 1;
  const tier = tierNow(vs[gang].cash, vs[gang], now);
  const traits = GANGS[gang].from.map(([, v]) => v);

  const c = GANG_COLOR[gang];
  return (
    <PageShell tint={c.bg}>
      <section className="glass-strong relative overflow-hidden rounded-[32px] p-5 sm:p-8">
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: `linear-gradient(160deg, ${c.bg}55, transparent 60%)` }}
        />
        <div className="relative grid items-center gap-6 sm:grid-cols-[1.1fr_1fr]">
          <img
            src={`/art/city/gang-${gang}.webp`}
            alt={`${GANGS[gang].name}'s building`}
            className="mx-auto max-h-[240px] w-full object-contain drop-shadow-[0_20px_30px_rgba(0,0,0,0.55)]"
          />
          <div>
            <p className="flex items-center gap-2 text-[14px] font-semibold text-label-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.bg }} />#{rank} of{' '}
              {GANG_IDS.length}
            </p>
            <h1 className="mt-1 font-display text-[42px] leading-[1.02] sm:text-[52px]">
              {GANGS[gang].name}
            </h1>
            <p className="mt-2 font-display text-[34px] leading-none tabular-nums text-sys-gold">
              {money(cash[gang])}
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-[13px]">
              <span className="rounded-full bg-white/10 px-3 py-1">{vaultFor(gang).name}</span>
              <span className="rounded-full bg-white/10 px-3 py-1">Defence: {LEVEL[tier]}</span>
              <span className="rounded-full bg-white/10 px-3 py-1">{members.length} members</span>
            </div>
            <p className="mt-4 text-[13px] leading-snug text-label-2">
              Who joins: Chogs wearing {traits.slice(0, 4).join(', ')}
              {traits.length > 4 ? ` and ${traits.length - 4} more` : ''}.
            </p>
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <section aria-labelledby="members">
          <h2 id="members" className="px-1 font-display text-[24px]">
            Members
          </h2>
          {members.length === 0 ? (
            <p className="mt-2 px-1 text-[14px] text-label-2">Nobody has joined yet.</p>
          ) : (
            <ol className="group-list glass mt-3">
              {members.map((m, i) => (
                <li key={m.id}>
                  <Link
                    href={`/chog/${m.id}`}
                    className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-white/[0.06]"
                  >
                    <span className="w-5 text-center text-[14px] font-semibold tabular-nums text-label-3">
                      {i + 1}
                    </span>
                    <img src={chogImage(m.id, 96)} alt="" className="h-10 w-10 rounded-[12px] object-cover" />
                    <span className="flex-1 truncate text-[15px] font-semibold">
                      {displayName(getChog(m.id)!)}
                    </span>
                    <span className="text-right text-[12px] text-label-2">
                      <strong className="block text-[15px] font-semibold tabular-nums text-sys-gold">
                        {money(m.stolen)}
                      </strong>
                      caught {m.catches}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>
        <section aria-labelledby="hits">
          <h2 id="hits" className="px-1 font-display text-[24px]">
            Latest hits
          </h2>
          {hits.length === 0 ? (
            <p className="mt-2 px-1 text-[14px] text-label-2">No hits yet.</p>
          ) : (
            <ul className="group-list glass mt-3">
              {hits.map((h) => {
                const ours = h.gang === gang;
                const won = (ours && h.result === 'escaped') || (!ours && h.result === 'busted');
                return (
                  <li key={h.id}>
                    <Link
                      href={`/replay/${h.id}`}
                      className="flex items-center gap-3 px-4 py-3 text-[14px] transition-colors hover:bg-white/[0.06]"
                    >
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${won ? 'bg-sys-green' : 'bg-sys-red'}`}
                      />
                      <span className="flex-1 leading-snug">
                        {ours
                          ? h.result === 'escaped'
                            ? `Robbed ${GANGS[h.target].name} of ${money(h.moved)}`
                            : `Got caught robbing ${GANGS[h.target].name}`
                          : h.result === 'escaped'
                            ? `${GANGS[h.gang].name} took ${money(h.moved)} from us`
                            : `Caught a ${GANGS[h.gang].name} robber${h.moved ? ` (+${money(h.moved)} fine)` : ''}`}
                      </span>
                      <span className="shrink-0 text-[12px] text-label-3">{ago(h.at, now)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </PageShell>
  );
}
