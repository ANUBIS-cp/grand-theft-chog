'use client';
import { GANGS, type GangId } from '@chog-city/data';
import { POWERS, vaultDef, type PowerId } from '@chog-city/game/heist';
import { ArrowBendUpLeft, Lock, ShieldCheck, SignOut } from '@phosphor-icons/react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ConnectPanel } from '@/components/connect-panel';
import { HeistGame, type RealResult } from '@/components/heist/heist-game';
import { SkillIcon } from '@/components/skill-icons';
import { cn } from '@/lib/cn';
import { chogImage } from '@/lib/images';
import { useLive } from '@/lib/live';
import { GANG_COLOR } from '@/lib/theme';
import { ago, formatLeft } from '@/lib/time';
import { logOut } from '@/lib/wallet';
import { VaultDoor } from './vault-door';

interface VaultRow {
  gang: GangId;
  cash: number;
  tier: number;
  vault: string;
  members: number;
  guards: number[];
}
interface Hit {
  id: string;
  chogId: number;
  gang: GangId;
  target: GangId;
  result: 'escaped' | 'busted';
  moved: number;
  caughtBy: number | null;
  revenge: boolean;
  at: number;
}
interface MyChog {
  id: number;
  name: string;
  gang: GangId | null;
  gangChoices: GangId[];
  jailedUntil: number | null;
  hitToday: GangId[];
  powers: PowerId[];
  record: { stolen: number; escapes: number; busts: number; catches: number; best: number };
}
interface Run {
  id: string;
  vault: string;
  tier: number;
  target: GangId;
  revenge: boolean;
  powers: PowerId[];
  guards: { id: number; name: string }[];
}

const POWER_ICON: Record<PowerId, Parameters<typeof SkillIcon>[0]['skill']> = {
  hide: 'stealth',
  zap: 'laser',
  sprint: 'runner',
  distract: 'clown',
  hack: 'tech',
  tackle: 'muscle',
  bribe: 'smooth',
  magnet: 'money',
  blink: 'magic',
  scare: 'undead',
  lockpick: 'jailbird',
};

const START_ERRORS: Record<string, string> = {
  jailed: 'This Chog is in jail.',
  'done-today': 'This Chog already hit that vault today.',
  'own-gang': 'That’s your own gang’s vault.',
  'no-gang': 'Pick a gang first.',
  'not-yours': 'That Chog isn’t in your wallet any more.',
  'slow-down': 'Too fast. Wait a few seconds.',
};

const money = (n: number) => `$${n.toLocaleString('en-US')}`;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const d = (await r.json().catch(() => ({}))) as T & { ok?: boolean; error?: string };
  if (!r.ok || d.ok === false) throw new Error(START_ERRORS[d.error ?? ''] ?? 'Something went wrong. Try again.');
  return d;
}

export function WarApp() {
  const [board, setBoard] = useState<{ board: VaultRow[]; hits: Hit[]; resetAt: number } | null>(null);
  const [me, setMe] = useState<{ address: string | null; chogs: MyChog[]; revenge: Record<string, GangId[]> } | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const loadBoard = useCallback(async () => {
    const r = await fetch('/api/war', { cache: 'no-store' });
    if (r.ok) setBoard(await r.json());
  }, []);
  const loadMe = useCallback(async () => {
    const r = await fetch('/api/war/me', { cache: 'no-store' });
    if (r.ok) setMe(await r.json());
  }, []);

  useEffect(() => {
    void loadBoard();
    void loadMe();
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [loadBoard, loadMe]);
  useLive(() => void loadBoard());

  const chogs = me?.chogs ?? [];
  const chog = chogs.find((c) => c.id === picked) ?? chogs[0] ?? null;
  const revenge = chog?.gang ? (me?.revenge[chog.gang] ?? []) : [];

  async function pickGang(gang: GangId) {
    if (!chog) return;
    setBusy('gang');
    setNotice(null);
    try {
      await post('/api/war/gang', { chogId: chog.id, gang });
      await Promise.all([loadMe(), loadBoard()]);
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function hit(target: GangId) {
    if (!chog) return;
    setBusy(target);
    setNotice(null);
    try {
      const d = await post<{ run: Run }>('/api/heist/start', { chogId: chog.id, target });
      setRun(d.run);
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (run && chog) {
    const def = vaultDef(run.vault)!;
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-[#0b0918]">
        <HeistGame
          key={run.id}
          vault={def}
          tier={run.tier}
          player={{ id: chog.id, name: chog.name, gang: chog.gang ? GANGS[chog.gang].name : null, powers: run.powers }}
          guards={run.guards}
          owner={{ name: GANGS[run.target].name, color: GANG_COLOR[run.target].bg, ink: GANG_COLOR[run.target].fg }}
          real={{
            myGang: chog.gang ? GANGS[chog.gang].name : 'your gang',
            finish: async (inputs) => (await post<{ result: RealResult }>('/api/heist/finish', { runId: run.id, inputs })).result,
            onLeave: () => {
              setRun(null);
              void loadMe();
              void loadBoard();
            },
          }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[#0b0918] text-white">
      <header className="mx-auto flex max-w-[960px] items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="font-display text-[22px] uppercase leading-none">
          Chog City
        </Link>
        <div className="flex items-center gap-3 text-[13px] text-white/70">
          <Link href="/heist" className="font-semibold text-white hover:underline">
            Practice
          </Link>
          {me?.address && (
            <button
              className="inline-flex items-center gap-1 hover:text-white"
              onClick={async () => {
                await logOut();
                setMe({ address: null, chogs: [], revenge: {} });
              }}
            >
              {short(me.address)} <SignOut size={14} />
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-[960px] px-4 pb-16">
        {me && !me.address && <Intro onLoggedIn={() => void loadMe()} />}

        {me?.address && chogs.length === 0 && (
          <section className="mt-2 rounded-[12px] border-2 border-white/15 p-5">
            <h2 className="font-display text-[26px] uppercase leading-none">No Chogs in this wallet</h2>
            <p className="mt-2 text-[15px] text-white/70">
              You need a Chog to rob vaults for real. You can still{' '}
              <Link href="/heist" className="font-semibold text-white underline">
                practice
              </Link>
              .
            </p>
          </section>
        )}

        {chog && (
          <section aria-label="Your Chog" className="mt-2">
            {chogs.length > 1 && (
              <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
                {chogs.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setPicked(c.id)}
                    className={cn('shrink-0 rounded-full border-2', c.id === chog.id ? 'border-pink' : 'border-transparent opacity-60 hover:opacity-100')}
                    aria-label={c.name}
                  >
                    <img src={chogImage(c.id, 96)} alt="" className="h-11 w-11 rounded-full border-2 border-ink" />
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-4 rounded-[14px] border-2 border-ink bg-[#1d1838] p-3 shadow-[4px_4px_0_0_#000] sm:p-4">
              <img src={chogImage(chog.id, 256)} alt="" className="h-20 w-20 shrink-0 rounded-[10px] border-2 border-ink sm:h-24 sm:w-24" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/chog/${chog.id}`} className="font-display text-[26px] uppercase leading-none hover:underline">
                    {chog.name}
                  </Link>
                  {chog.gang && (
                    <span
                      className="rounded-[5px] border-2 border-ink px-1.5 pt-1 font-display text-[14px] uppercase leading-none"
                      style={{ background: GANG_COLOR[chog.gang].bg, color: GANG_COLOR[chog.gang].fg }}
                    >
                      {GANGS[chog.gang].name}
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-[13px] text-white/70">
                  Stole <strong className="text-[#ffd666]">{money(chog.record.stolen)}</strong> · {plural(chog.record.escapes, 'escape')} ·{' '}
                  busted {chog.record.busts} · caught {plural(chog.record.catches, 'robber')}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {chog.powers.map((p) => (
                    <span key={p} title={POWERS[p].does} className="inline-flex items-center gap-1 rounded-full bg-white/10 py-0.5 pl-1 pr-2 text-[12px]">
                      <SkillIcon skill={POWER_ICON[p]} width={16} height={16} />
                      {POWERS[p].name}
                    </span>
                  ))}
                </div>
                {chog.jailedUntil && chog.jailedUntil > now && (
                  <p className="mt-2 inline-flex items-center gap-1.5 rounded-[6px] bg-jail px-2 py-1 text-[13px] font-semibold">
                    <Lock size={14} weight="fill" /> In jail, out in {formatLeft(chog.jailedUntil - now)}
                  </p>
                )}
              </div>
            </div>
          </section>
        )}

        {chog && !chog.gang && (
          <section className="mt-6">
            <h2 className="font-display text-[28px] uppercase leading-none">Pick {chog.name}’s gang</h2>
            <p className="mt-1.5 text-[14px] text-white/70">From its traits. This is for good: a Chog reps one gang.</p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {chog.gangChoices.map((g) => (
                <button
                  key={g}
                  disabled={busy === 'gang'}
                  onClick={() => void pickGang(g)}
                  className="rounded-[10px] border-2 border-ink px-3 pb-2 pt-3 text-left font-display text-[20px] uppercase leading-none shadow-[3px_3px_0_0_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                  style={{ background: GANG_COLOR[g].bg, color: GANG_COLOR[g].fg }}
                >
                  {GANGS[g].name}
                </button>
              ))}
            </div>
          </section>
        )}

        {notice && (
          <p role="alert" className="mt-4 rounded-[8px] border-2 border-ink bg-jail px-3 py-2 text-[14px] font-semibold">
            {notice}
          </p>
        )}

        <section aria-labelledby="vaults" className="mt-8">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 id="vaults" className="font-display text-[34px] uppercase leading-none">
              Gang vaults
            </h2>
            {board && <p className="text-[13px] text-white/60">Hits reset in {formatLeft(board.resetAt - now)}</p>}
          </div>
          <p className="mt-1 text-[14px] text-white/70">
            Rob a rival vault and what you get out with goes into yours. Richer vaults have more guards.
          </p>
          <ol className="mt-4 grid gap-3 md:grid-cols-2">
            {(board?.board ?? []).map((v, i) => {
              const mine = chog?.gang === v.gang;
              const done = chog?.hitToday.includes(v.gang);
              const jailed = !!chog?.jailedUntil && chog.jailedUntil > now;
              const isRevenge = revenge.includes(v.gang);
              return (
                <li
                  key={v.gang}
                  className={cn(
                    'flex items-center gap-3 rounded-[14px] border-2 border-ink bg-[#1d1838] p-3 shadow-[3px_3px_0_0_#000]',
                    mine && 'outline outline-2 outline-offset-2 outline-[#ffd666]',
                  )}
                >
                  <span className="w-5 text-center font-display text-[18px] text-white/50">{i + 1}</span>
                  <VaultDoor color={GANG_COLOR[v.gang].bg} tier={v.tier} size={56} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/gangs/${v.gang}`} className="block truncate font-display text-[20px] uppercase leading-none hover:underline">
                      {GANGS[v.gang].name}
                    </Link>
                    <div className="mt-1 font-display text-[26px] leading-none text-[#ffd666] tabular-nums">{money(v.cash)}</div>
                    <div className="mt-1 flex items-center gap-1.5 text-[12px] text-white/60">
                      <span className="flex -space-x-2">
                        {v.guards.slice(0, 3).map((g) => (
                          <img key={g} src={chogImage(g, 96)} alt="" className="h-5 w-5 rounded-full border border-ink" />
                        ))}
                      </span>
                      {v.members} {v.members === 1 ? 'member' : 'members'}
                    </div>
                  </div>
                  {mine ? (
                    <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#ffd666]">
                      <ShieldCheck size={16} weight="fill" /> Yours
                    </span>
                  ) : (
                    <div className="flex flex-col items-end gap-1">
                      {isRevenge && !done && (
                        <span className="inline-flex items-center gap-1 rounded-[4px] bg-pink px-1.5 py-0.5 text-[11px] font-bold uppercase text-ink">
                          <ArrowBendUpLeft size={12} weight="bold" /> Revenge +25%
                        </span>
                      )}
                      <button
                        disabled={!chog?.gang || done || jailed || busy !== null}
                        onClick={() => void hit(v.gang)}
                        className={cn(
                          'h-11 min-w-[76px] rounded-[8px] border-2 border-ink px-3 pt-1 font-display text-[20px] uppercase leading-none',
                          done || jailed || !chog?.gang
                            ? 'bg-white/10 text-white/40'
                            : 'bg-pink text-ink shadow-[3px_3px_0_0_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none',
                        )}
                      >
                        {busy === v.gang ? '…' : done ? 'Done' : 'Hit'}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
            {!board && Array.from({ length: 6 }, (_, i) => <li key={i} className="h-[86px] animate-pulse rounded-[14px] bg-white/5" />)}
          </ol>
        </section>

        <section aria-labelledby="hits" className="mt-10">
          <h2 id="hits" className="font-display text-[34px] uppercase leading-none">
            Latest hits
          </h2>
          {board && board.hits.length === 0 && <p className="mt-2 text-[14px] text-white/60">No hits yet. Be the first.</p>}
          <ul className="mt-3 divide-y divide-white/10 overflow-hidden rounded-[12px] border-2 border-white/10">
            {(board?.hits ?? []).map((h) => (
              <li key={h.id} className="flex items-center gap-3 px-3 py-2.5 text-[14px]">
                <img src={chogImage(h.chogId, 96)} alt="" className="h-8 w-8 shrink-0 rounded-full border-2 border-ink" />
                <p className="min-w-0 flex-1 leading-snug">
                  <span style={{ color: GANG_COLOR[h.gang].bg }} className="font-semibold">
                    {GANGS[h.gang].name}
                  </span>{' '}
                  {h.result === 'escaped' ? (
                    <>
                      robbed{' '}
                      <span style={{ color: GANG_COLOR[h.target].bg }} className="font-semibold">
                        {GANGS[h.target].name}
                      </span>{' '}
                      of <strong className="text-[#ffd666]">{money(h.moved)}</strong>
                      {h.revenge ? ' (revenge)' : ''}
                    </>
                  ) : (
                    <>
                      got caught in{' '}
                      <span style={{ color: GANG_COLOR[h.target].bg }} className="font-semibold">
                        {GANGS[h.target].name}
                      </span>
                      ’s vault{h.moved ? ` and paid ${money(h.moved)}` : ''}
                    </>
                  )}
                </p>
                <span className="shrink-0 text-[12px] text-white/50">{ago(h.at, now)}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}

function Intro({ onLoggedIn }: { onLoggedIn: () => void }) {
  return (
    <section className="mt-4 grid items-center gap-6 md:grid-cols-[1.1fr_1fr]">
      <div>
        <h1 className="font-display text-[48px] uppercase leading-[0.9] sm:text-[64px]">Rob the other gangs</h1>
        <p className="mt-3 max-w-[460px] text-[16px] leading-snug text-white/80">
          Every gang has a vault full of cash. Sneak your Chog into a rival’s vault, grab what you can and get out.
          Whatever you escape with goes into your gang’s vault.
        </p>
        <Link
          href="/heist"
          className="mt-4 inline-flex h-12 items-center rounded-[8px] border-2 border-ink bg-[#ffd666] px-4 pt-1 font-display text-[20px] uppercase leading-none text-ink shadow-[3px_3px_0_0_#000]"
        >
          Practice first, no wallet
        </Link>
      </div>
      <div className="rounded-[14px] bg-paper text-ink">
        <ConnectPanel onLoggedIn={onLoggedIn} />
      </div>
    </section>
  );
}
