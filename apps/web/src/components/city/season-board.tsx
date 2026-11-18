'use client';

import { GANGS, type GangId } from '@chog-city/data';
import { Crown, SealCheck, ShieldCheck } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { chogImage } from '@/lib/images';
import { GANG_COLOR } from '@/lib/theme';

// The season tab on the gang board: who is winning this month's titles right now, and when the season ends.

interface Leader {
  chogId: number;
  gang: GangId;
  amount: number;
  name: string;
}
interface Past {
  season: number;
  gang: GangId | null;
  robberName: string | null;
  guardName: string | null;
}
interface Data {
  season: number;
  endsAt: number;
  startCash: number;
  gangs: { gang: GangId; cash: number; stolen: number }[];
  robbers: Leader[];
  guards: Leader[];
  past: Past[];
}

const money = (n: number) => `$${n.toLocaleString('en-US')}`;

function endsIn(ms: number) {
  if (ms <= 0) return 'ending now';
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  if (d >= 2) return `ends in ${d} days`;
  if (d === 1) return `ends in 1 day ${h}h`;
  return `ends in ${h}h ${Math.ceil((ms % 3_600_000) / 60_000)}m`;
}

const gangText = (g: GangId) => (GANG_COLOR[g].bg === '#141414' ? GANG_COLOR[g].fg : GANG_COLOR[g].bg);

export function SeasonBoard(props: { now: number; myGang: GangId | null; onGang: (g: GangId) => void }) {
  const { now, myGang } = props;
  const [data, setData] = useState<Data | null | undefined>(undefined);
  useEffect(() => {
    void fetch('/api/season', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => setData(null));
  }, []);
  if (data === undefined) return <p className="mt-4 text-[14px] text-white/50">Loading…</p>;
  if (data === null)
    return <p className="mt-4 text-[14px] text-white/60">The season board isn’t available right now.</p>;

  const people = (list: Leader[], what: (l: Leader) => string, empty: string) =>
    list.length === 0 ? (
      <p className="mt-2 rounded-[14px] bg-white/[0.04] px-3 py-2.5 text-[13px] leading-snug text-white/60">
        {empty}
      </p>
    ) : (
      <ol className="mt-2 flex flex-col gap-1.5">
        {list.map((l, i) => (
          <li key={l.chogId} className="flex items-center gap-2.5 rounded-[14px] bg-white/[0.05] p-1.5 pr-3">
            <img
              src={chogImage(l.chogId, 96)}
              alt=""
              className="h-10 w-10 shrink-0 rounded-[10px] object-cover"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-semibold">
                {i === 0 && <span className="mr-1 text-sys-gold">1st</span>}
                {l.name}
              </span>
              <span className="block truncate text-[12px]" style={{ color: gangText(l.gang) }}>
                {GANGS[l.gang].name}
              </span>
            </span>
            <span className="shrink-0 text-[13px] font-semibold tabular-nums text-white/85">{what(l)}</span>
          </li>
        ))}
      </ol>
    );

  return (
    <div className="mt-3">
      <div className="rounded-[20px] bg-[linear-gradient(160deg,rgba(255,210,63,0.16),rgba(255,255,255,0.03))] p-4 ring-1 ring-inset ring-[#ffd23f]/20">
        <p className="font-display text-[22px] leading-none">
          Season {data.season} <span className="text-sys-gold">{endsIn(data.endsAt - now)}</span>
        </p>
        <p className="mt-2 text-[14px] leading-snug text-white/80">
          When it ends, the winners get a title written on their Chog for good. It stays with the Chog even if
          it’s sold. Then every vault starts again at {money(data.startCash)}.
        </p>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <section>
          <h3 className="flex items-center gap-1.5 font-display text-[17px] leading-none">
            <Crown size={18} weight="fill" className="text-sys-gold" /> Richest gang
          </h3>
          <p className="mt-1 text-[12px] leading-snug text-white/55">
            Biggest vault when the season ends. Every Chog in it that robbed or guarded gets the title.
          </p>
          <ol className="mt-2 flex flex-col gap-1.5">
            {data.gangs.map((g, i) => (
              <li key={g.gang}>
                <button
                  onClick={() => props.onGang(g.gang)}
                  className="press flex w-full items-center gap-2.5 rounded-[14px] bg-white/[0.05] p-1.5 pr-3 text-left hover:bg-white/[0.08]"
                >
                  <img
                    src={`/art/city/gang-${g.gang}.webp`}
                    alt=""
                    className="h-10 w-10 shrink-0 object-contain"
                  />
                  <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">
                    {i === 0 && <span className="mr-1 text-sys-gold">1st</span>}
                    {GANGS[g.gang].name}
                    {myGang === g.gang && (
                      <span className="ml-1.5 text-[11px] font-semibold text-sys-pink">Your gang</span>
                    )}
                  </span>
                  <span className="shrink-0 text-[13px] font-semibold tabular-nums text-sys-gold">
                    {money(g.cash)}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </section>
        <section>
          <h3 className="flex items-center gap-1.5 font-display text-[17px] leading-none">
            <SealCheck size={18} weight="fill" className="text-sys-gold" /> Top robber
          </h3>
          <p className="mt-1 text-[12px] leading-snug text-white/55">Most cash stolen and brought home.</p>
          {people(
            data.robbers,
            (l) => `stole ${money(l.amount)}`,
            'Nobody yet. Rob a vault and get home with the bag to get on here.',
          )}
        </section>
        <section>
          <h3 className="flex items-center gap-1.5 font-display text-[17px] leading-none">
            <ShieldCheck size={18} weight="fill" className="text-sys-gold" /> Best guard
          </h3>
          <p className="mt-1 text-[12px] leading-snug text-white/55">
            Most robbers caught in its gang’s vault or on their way home.
          </p>
          {people(
            data.guards,
            (l) => `caught ${l.amount}`,
            'Nobody yet. Catch a robber in your gang’s vault to get on here.',
          )}
        </section>
      </div>

      {data.past.length > 0 && (
        <section className="mt-5">
          <h3 className="font-display text-[17px] leading-none">Past winners</h3>
          <ul className="mt-2 flex flex-col gap-1.5 text-[14px] text-white/80">
            {data.past.map((p) => (
              <li key={p.season} className="rounded-[14px] bg-white/[0.05] px-3 py-2">
                <strong className="text-white">Season {p.season}:</strong>{' '}
                {[
                  p.gang && `richest gang ${GANGS[p.gang].name}`,
                  p.robberName && `top robber ${p.robberName}`,
                  p.guardName && `best guard ${p.guardName}`,
                ]
                  .filter(Boolean)
                  .join(' · ') || 'no winners'}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
