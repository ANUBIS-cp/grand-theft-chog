'use client';
import { ArrowsClockwise, Check, ClipboardText, Copy, ShieldCheck, Wallet } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { ConnectPanel } from '@/components/connect-panel';
import { cn } from '@/lib/cn';
import { chogImage } from '@/lib/images';

// Getting in as your own Chog without connecting a wallet to a site you've never seen:
// 1. Type (or paste) your wallet address: your Chogs show up at once, read from Monad, and you can walk the city
//    and try the practice vault as one straight away.
// 2. To rob for real, prove the wallet is yours: send yourself a small amount of MON (it comes straight
//    back). The game watches Monad and signs you in the moment it lands, for 30 days.
// Connecting a wallet the usual way is still there for anyone who prefers it.

export interface PeekChog {
  id: number;
  name: string;
  powers: string[];
}

export interface Peek {
  address: string;
  chogs: PeekChog[];
  picked: number;
}

type Step = 'address' | 'found' | 'verify' | 'done' | 'connect';

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function ChogPass(props: {
  /** Walk in as this Chog (read-only: practice only until the wallet is proved). */
  onPeek: (p: Peek) => void;
  /** Signed in for real (by the send to yourself, or a connected wallet). */
  onLoggedIn: () => void;
  /** Already looked up this session: start on its Chogs. */
  peek?: Peek | null;
  /** Open straight on the proof step. */
  verifyFirst?: boolean;
}) {
  const [step, setStep] = useState<Step>(props.peek ? (props.verifyFirst ? 'verify' : 'found') : 'address');
  const [address, setAddress] = useState(props.peek?.address ?? '');
  const [chogs, setChogs] = useState<PeekChog[]>(props.peek?.chogs ?? []);
  const [picked, setPicked] = useState<number | null>(props.peek?.picked ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function find() {
    const a = address.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(a)) {
      setError('That doesn’t look like a wallet address. It starts with 0x and has 42 characters.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/chogs/of?address=${a}`);
      const d = (await r.json()) as { chogs?: PeekChog[]; error?: string };
      if (!r.ok)
        throw new Error(
          d.error === 'SLOW_DOWN' ? 'Too many tries. Wait a moment.' : 'Couldn’t look that up.',
        );
      if (!d.chogs?.length) {
        setError('No Chogs in this wallet. Check the address, or keep exploring as a guest.');
        return;
      }
      setChogs(d.chogs);
      setPicked(d.chogs[0]!.id);
      setStep('found');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t look that up.');
    } finally {
      setBusy(false);
    }
  }

  async function paste() {
    try {
      const t = (await navigator.clipboard.readText()).trim();
      if (t) setAddress(t);
    } catch {
      /* not allowed: they can paste by hand */
    }
  }

  const peekNow = (): Peek => ({
    address: address.trim().toLowerCase(),
    chogs,
    picked: picked ?? chogs[0]!.id,
  });

  if (step === 'connect')
    return (
      <div>
        <ConnectPanel onLoggedIn={props.onLoggedIn} />
        <button
          onClick={() => setStep(chogs.length ? 'found' : 'address')}
          className="mt-3 w-full text-[14px] font-semibold text-label-2 underline underline-offset-2"
        >
          Back
        </button>
      </div>
    );

  if (step === 'address')
    return (
      <div className="text-white">
        <p className="text-[15px] leading-snug text-label-2">
          Enter the wallet that holds your Chog and it walks straight in. No connecting, no signing.
        </p>
        <label className="mt-5 block text-[13px] font-semibold text-label-2" htmlFor="cw-address">
          Your wallet address
        </label>
        <div className="mt-1.5 flex items-center gap-2 rounded-[16px] bg-black/35 p-1.5 ring-1 ring-inset ring-white/12 focus-within:ring-[#ffd666]/70">
          <input
            id="cw-address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void find()}
            placeholder="0x…"
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            inputMode="text"
            className="min-w-0 flex-1 bg-transparent px-2.5 py-2 font-mono text-[15px] text-white outline-none placeholder:text-white/30"
          />
          <button
            onClick={paste}
            className="press flex shrink-0 items-center gap-1.5 rounded-[12px] bg-white/10 px-3 py-2 text-[13px] font-semibold"
          >
            <ClipboardText size={16} weight="bold" />
            Paste
          </button>
        </div>
        {error && <Alert text={error} />}
        <button onClick={find} disabled={busy || !address.trim()} className="btn press btn-gold mt-4 w-full">
          <span className="pt-1">{busy ? 'Looking on Monad…' : 'Find my Chogs'}</span>
        </button>
        <Or />
        <button onClick={() => setStep('connect')} className="btn press btn-glass w-full">
          <Wallet size={18} weight="fill" />
          <span className="pt-0.5">Connect a wallet instead</span>
        </button>
      </div>
    );

  if (step === 'found')
    return (
      <div className="text-white">
        <p className="text-[15px] leading-snug text-label-2">
          {chogs.length === 1 ? 'Found your Chog.' : `Found ${chogs.length} Chogs.`} Pick who walks in.
        </p>
        <div className="-mx-1 mt-4 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
          {chogs.map((c) => (
            <button
              key={c.id}
              onClick={() => setPicked(c.id)}
              className={cn(
                'press relative w-[104px] shrink-0 snap-start rounded-[20px] p-1.5 text-left transition-[box-shadow,transform]',
                picked === c.id
                  ? 'bg-[#ffd666]/15 shadow-[0_0_0_2px_#ffd666,0_10px_30px_rgba(255,214,102,0.25)]'
                  : 'bg-white/[0.06] shadow-[0_0_0_1px_rgba(255,255,255,0.08)]',
              )}
            >
              <img
                src={chogImage(c.id, 256)}
                alt=""
                className="aspect-square w-full rounded-[14px] object-cover"
              />
              <span className="mt-1.5 block truncate px-1 text-[13px] font-semibold">{c.name}</span>
              {picked === c.id && (
                <span className="absolute right-2.5 top-2.5 grid h-6 w-6 place-items-center rounded-full bg-[#ffd666] text-ink">
                  <Check size={14} weight="bold" />
                </span>
              )}
            </button>
          ))}
        </div>
        <button onClick={() => props.onPeek(peekNow())} className="btn press btn-gold mt-3 w-full">
          <span className="pt-1">Walk in as {chogs.find((c) => c.id === picked)?.name ?? 'your Chog'}</span>
        </button>
        <p className="mt-2 text-center text-[12px] text-label-2">Explore and practise straight away.</p>

        <button
          onClick={() => setStep('verify')}
          className="press mt-5 flex w-full items-center gap-3 rounded-[20px] bg-gradient-to-br from-[#7c5cff]/25 to-[#ff5c93]/15 p-4 text-left ring-1 ring-inset ring-white/12"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-white/12">
            <ShieldCheck size={24} weight="fill" className="text-[#b9a6ff]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-semibold">Verify to rob for real</span>
            <span className="block text-[13px] leading-snug text-label-2">
              Send yourself a small amount of MON. It takes about a minute, and then your robberies count for
              real.
            </span>
          </span>
        </button>
        <button
          onClick={() => setStep('address')}
          className="mt-3 w-full text-[13px] font-semibold text-label-2 underline underline-offset-2"
        >
          Use a different wallet
        </button>
      </div>
    );

  if (step === 'verify')
    return (
      <Verify
        address={address.trim()}
        onBack={() => setStep('found')}
        onDone={() => {
          setStep('done');
          setTimeout(props.onLoggedIn, 1600);
        }}
      />
    );

  return (
    <div className="py-6 text-center text-white">
      <div className="mx-auto grid h-16 w-16 animate-[star-pop_420ms_ease-out_both] place-items-center rounded-full bg-sys-green text-black shadow-[0_0_40px_rgba(48,209,88,0.45)]">
        <Check size={32} weight="bold" />
      </div>
      <h3 className="mt-4 font-display text-[26px] leading-none">You’re verified</h3>
      <p className="mt-2 text-[15px] text-label-2">
        Welcome to Chog World. You stay signed in on this device for 30 days.
      </p>
    </div>
  );
}

/** Step 2: the amount to send to yourself, and a live watch on Monad until it lands. */
function Verify(props: { address: string; onBack: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState<string | null>(null);
  const [until, setUntil] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [sentOther, setSentOther] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState<string | null>(null);
  const done = useRef(props.onDone);
  done.current = props.onDone;

  async function start() {
    setError(null);
    setExpired(false);
    setSentOther(false);
    try {
      const r = await fetch('/api/auth/proof', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address: props.address }),
      });
      const d = (await r.json()) as { amount?: string; expiresAt?: number; error?: string };
      if (!r.ok || !d.amount) {
        setError(
          d.error === 'NO_CHOGS'
            ? 'This wallet doesn’t hold a Chog.'
            : d.error === 'SLOW_DOWN'
              ? 'Too many tries. Wait a minute and try again.'
              : 'Couldn’t start. Try again.',
        );
        return;
      }
      setAmount(d.amount);
      setUntil(d.expiresAt ?? Date.now() + 15 * 60_000);
    } catch {
      setError('Couldn’t start. Check your connection and try again.');
    }
  }

  useEffect(() => {
    void start();
    // Once, when this step opens.
  }, []);

  // Watch Monad: a check every 3 seconds while it's open.
  useEffect(() => {
    if (!amount || expired) return;
    let stop = false;
    const tick = async () => {
      try {
        const d = (await (await fetch('/api/auth/proof')).json()) as { state: string; sentOther?: boolean };
        if (stop) return;
        if (d.state === 'done') return done.current();
        if (d.state === 'expired') setExpired(true);
        if (d.sentOther) setSentOther(true);
      } catch {
        /* try again next tick */
      }
    };
    const t = setInterval(tick, 3000);
    const c = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      stop = true;
      clearInterval(t);
      clearInterval(c);
    };
  }, [amount, expired]);

  const copy = async (what: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1400);
    } catch {
      /* copy by hand */
    }
  };

  const left = Math.max(0, until - now);
  const mm = Math.floor(left / 60_000);
  const ss = Math.floor((left % 60_000) / 1000);

  return (
    <div className="text-white">
      <p className="text-[15px] leading-snug text-label-2">
        Send yourself this exact amount of MON. It comes right back to you, so all it costs is the network
        fee.
      </p>

      {/* The ticket: the amount, and where it goes (from you, back to you). */}
      <div className="relative mt-4 overflow-hidden rounded-[22px] bg-gradient-to-br from-[#2a1d55] via-[#1d1638] to-[#121024] p-5 ring-1 ring-inset ring-white/12">
        <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-[#7c5cff]/30 blur-3xl" />
        <span className="absolute -left-3 top-[58%] h-6 w-6 rounded-full bg-[#0b0918]" />
        <span className="absolute -right-3 top-[58%] h-6 w-6 rounded-full bg-[#0b0918]" />
        <div className="relative flex items-end justify-between gap-3">
          <div>
            <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#b9a6ff]">
              Send exactly
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-display text-[44px] leading-none tabular-nums">{amount ?? '…'}</span>
              <span className="rounded-full bg-[#836ef9] px-2.5 py-0.5 text-[13px] font-bold">MON</span>
            </div>
          </div>
          <button
            onClick={() => amount && copy('amount', amount)}
            disabled={!amount}
            className="press flex items-center gap-1.5 rounded-[12px] bg-white/12 px-3 py-2 text-[13px] font-semibold"
          >
            {copied === 'amount' ? <Check size={15} weight="bold" /> : <Copy size={15} weight="bold" />}
            {copied === 'amount' ? 'Copied' : 'Copy'}
          </button>
        </div>
        <div className="relative my-4 border-t-2 border-dashed border-white/15" />
        <div className="relative flex items-center gap-2">
          <AddressChip label="From" address={props.address} />
          <ArrowsClockwise
            size={22}
            weight="bold"
            className="shrink-0 animate-[spin_6s_linear_infinite] text-[#ffd666]"
          />
          <AddressChip label="To" address={props.address} />
        </div>
        <button
          onClick={() => copy('address', props.address)}
          className="press relative mt-3 flex w-full items-center justify-center gap-1.5 rounded-[12px] bg-white/[0.08] py-2 text-[13px] font-semibold"
        >
          {copied === 'address' ? <Check size={15} weight="bold" /> : <Copy size={15} weight="bold" />}
          {copied === 'address' ? 'Copied' : 'Copy my address'}
        </button>
      </div>

      <ol className="mt-4 space-y-2 text-[14px] leading-snug">
        {[
          `Open the wallet that holds your Chog (${short(props.address)}).`,
          `Send ${amount ?? 'the amount'} MON to your own address. Use the copy button below if your wallet asks for it.`,
          'Come back here. You’re signed in the moment it lands.',
        ].map((t, i) => (
          <li key={t} className="flex gap-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/10 text-[12px] font-bold">
              {i + 1}
            </span>
            <span className="pt-0.5 text-label-2">{t}</span>
          </li>
        ))}
      </ol>

      {error ? (
        <Alert text={error} />
      ) : expired ? (
        <div className="mt-4 rounded-[16px] bg-white/[0.06] p-3 text-[14px]">
          This one timed out.{' '}
          <button onClick={start} className="font-semibold underline underline-offset-2">
            Get a new amount
          </button>
        </div>
      ) : (
        <div className="mt-4 flex items-center gap-3 rounded-[16px] bg-white/[0.06] px-4 py-3">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sys-green opacity-60" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-sys-green" />
          </span>
          <span className="flex-1 text-[14px] font-semibold">Watching Monad for your transfer</span>
          {amount && (
            <span className="font-mono text-[13px] tabular-nums text-label-2">
              {mm}:{String(ss).padStart(2, '0')}
            </span>
          )}
        </div>
      )}
      {sentOther && !expired && (
        <p className="mt-2 text-[13px] text-[#ffd666]">
          We saw a transaction from your wallet, but not this one. Make sure it’s exactly {amount} MON, sent
          to your own address.
        </p>
      )}
      <button
        onClick={props.onBack}
        className="mt-4 w-full text-[13px] font-semibold text-label-2 underline underline-offset-2"
      >
        Back
      </button>
    </div>
  );
}

function AddressChip({ label, address }: { label: string; address: string }) {
  return (
    <div className="min-w-0 flex-1 rounded-[14px] bg-black/30 px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-label-2">{label}</div>
      <div className="truncate font-mono text-[14px]">{short(address)}</div>
    </div>
  );
}

function Or() {
  return (
    <div className="my-4 flex items-center gap-3 text-[12px] font-semibold uppercase tracking-[0.1em] text-label-3">
      <span className="h-px flex-1 bg-white/10" />
      or
      <span className="h-px flex-1 bg-white/10" />
    </div>
  );
}

function Alert({ text }: { text: string }) {
  return (
    <p
      role="alert"
      className="mt-3 rounded-[14px] bg-sys-red/15 px-3 py-2.5 text-[14px] font-medium text-sys-red"
    >
      {text}
    </p>
  );
}
