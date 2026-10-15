'use client';
import { Fire } from '@phosphor-icons/react';
import { useState } from 'react';
import { cn } from '@/lib/cn';
import { LoginError, burnChog } from '@/lib/wallet';

// $CHOG in the city: bail, Wanted posters and gang banners. You burn from your own wallet with $CHOG's own
// burn(), and the server reads the burn off the chain before it does anything.

export type BurnKind = 'bail' | 'poster' | 'banner';
export interface Burns {
  posters: { chog: number; name: string; line: string; until: number }[];
  banners: { gang: string; until: number }[];
  burned: number;
  prices: Record<BurnKind, number>;
  lines: string[];
}

const SAY: Record<string, string> = {
  login: 'Log in first.',
  'not-yours': 'That Chog isn’t in your wallet.',
  'not-in-jail': 'Your Chog is already out of jail.',
  'own-chog': 'You can’t put a poster on your own Chog.',
  'no-gang': 'That Chog isn’t in a gang yet.',
  'burn-not-found': 'The burn hasn’t shown up on Monad yet. Wait a moment and try again.',
  'burn-failed': 'The burn failed on Monad, so nothing happened. Nothing was spent but gas.',
  'burn-too-small': 'That transaction didn’t burn enough $CHOG from your wallet.',
  'burn-too-old': 'That burn is too old to use.',
  'burn-used': 'That burn was already used.',
  'slow-down': 'Slow down a little and try again.',
};

async function post(body: unknown) {
  const r = await fetch('/api/chog/burn', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await r.json().catch(() => ({ ok: false, error: 'down' }))) as {
    ok: boolean;
    error?: string;
    price?: number;
    balance?: number | null;
  };
}

/** One button that checks, asks the wallet to burn, then has the server read the burn. */
export function BurnButton(props: {
  kind: BurnKind;
  chogId: number;
  line?: number;
  address: string | null;
  price: number;
  label: string;
  className?: string;
  onDone: () => void;
}) {
  const [step, setStep] = useState<'idle' | 'check' | 'wallet' | 'chain'>('idle');
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    setErr(null);
    if (!props.address) return setErr(SAY.login!);
    const ask = { kind: props.kind, chogId: props.chogId, line: props.line };
    try {
      setStep('check');
      const c = await post(ask);
      if (!c.ok) throw new Error(SAY[c.error ?? ''] ?? 'That didn’t work. Try again.');
      if (c.balance !== null && c.balance !== undefined && c.balance < props.price)
        throw new Error(`You have ${Math.floor(c.balance)} $CHOG. This needs ${props.price}.`);
      setStep('wallet');
      const tx = await burnChog(props.address, props.price);
      setStep('chain');
      const d = await post({ ...ask, tx });
      if (!d.ok) throw new Error(SAY[d.error ?? ''] ?? 'The burn went through but wasn’t accepted. Tell us.');
      setStep('idle');
      props.onDone();
    } catch (e) {
      setStep('idle');
      setErr(e instanceof LoginError || e instanceof Error ? e.message : 'That didn’t work. Try again.');
    }
  };
  const busy = step !== 'idle';
  return (
    <div>
      <button
        disabled={busy}
        onClick={go}
        className={cn(
          'flex w-full items-center justify-center gap-2 rounded-[10px] border-[3px] border-ink bg-[#ff7a1a] px-3 pb-1.5 pt-2 font-display text-[18px] uppercase leading-none text-ink shadow-[0_3px_0_0_#000] active:translate-y-[2px] disabled:opacity-60',
          props.className,
        )}
      >
        <Fire size={18} weight="fill" />
        <span>
          {step === 'check'
            ? 'Checking…'
            : step === 'wallet'
              ? 'Confirm in your wallet…'
              : step === 'chain'
                ? 'Reading the burn…'
                : `${props.label} · ${props.price} $CHOG`}
        </span>
      </button>
      {err && <p className="mt-1.5 text-[13px] leading-snug text-[#ff8a80]">{err}</p>}
    </div>
  );
}

/** Put a Wanted poster on a rival Chog: pick a line, then burn. */
export function PosterPicker(props: {
  chogId: number;
  burns: Burns;
  address: string | null;
  onDone: () => void;
}) {
  const [line, setLine] = useState(1);
  const up = props.burns.posters.find((p) => p.chog === props.chogId);
  return (
    <div className="mt-3 rounded-[10px] border-2 border-white/10 p-2.5">
      <div className="text-[12px] uppercase tracking-wide text-white/50">
        {up ? `Wanted: “${up.line}”` : 'Wanted poster for 24 hours'}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {props.burns.lines.map((l, i) => (
          <button
            key={l}
            onClick={() => setLine(i)}
            className={cn(
              'rounded-full border-2 px-2 py-0.5 text-[12px] font-semibold',
              i === line ? 'border-ink bg-[#f3e3b5] text-[#c1121f]' : 'border-white/20 text-white/70',
            )}
          >
            {l}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-[12px] leading-snug text-white/55">
        Everyone sees WANTED over it. Its getaways get an extra cop, and the gang that catches it gets $100
        more.
      </p>
      <BurnButton
        kind="poster"
        chogId={props.chogId}
        line={line}
        address={props.address}
        price={props.burns.prices.poster}
        label={up ? 'Another day' : 'Put it up'}
        className="mt-2"
        onDone={props.onDone}
      />
    </div>
  );
}
