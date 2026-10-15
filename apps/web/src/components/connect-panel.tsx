'use client';
import { Wallet } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label, Panel } from '@/components/ui/panel';
import { LoginError, discoverWallets, logIn, type WalletOption } from '@/lib/wallet';

export function ConnectPanel({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [wallets, setWallets] = useState<WalletOption[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stop = discoverWallets(setWallets);
    const t = setTimeout(() => setWallets((w) => w ?? []), 700);
    return () => {
      stop();
      clearTimeout(t);
    };
  }, []);

  async function go(w: WalletOption) {
    setBusy(w.id);
    setError(null);
    try {
      await logIn(w);
      onLoggedIn();
    } catch (e) {
      setError(e instanceof LoginError ? e.message : 'Something went wrong while logging in. Try again.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Panel className="mx-auto max-w-[460px] p-5 sm:p-6">
      <Label>Step 1 of 3</Label>
      <h1 className="mt-2 font-display text-[30px] leading-tight">
        Connect the wallet that holds your Chog
      </h1>
      <p className="mt-3 text-[15px] leading-snug text-ink-soft">
        You&apos;ll sign one message to log in. It costs nothing and doesn&apos;t move any tokens.
      </p>

      <div className="mt-5 space-y-2.5">
        {wallets === null && (
          <div className="h-12 animate-pulse rounded-[6px] bg-ink-faint" aria-label="Looking for wallets" />
        )}
        {wallets?.map((w) => (
          <Button
            key={w.id}
            variant="secondary"
            className="w-full justify-start !px-3"
            loading={busy === w.id}
            disabled={!!busy && busy !== w.id}
            onClick={() => go(w)}
          >
            {w.icon ? (
              <img src={w.icon} alt="" width={24} height={24} className="rounded-[5px]" />
            ) : (
              <Wallet size={22} weight="bold" />
            )}
            {w.name}
          </Button>
        ))}
        {wallets?.length === 0 && (
          <div className="rounded-[6px] border-2 border-dashed border-ink-faint p-4 text-[14px] leading-snug">
            <p className="font-semibold">No wallet found in this browser.</p>
            <p className="mt-1 text-ink-soft">
              On a phone, open this page inside your wallet app&apos;s browser (MetaMask, Rabby, Phantom,
              OKX). On a computer, install a wallet extension and reload.
            </p>
          </div>
        )}
      </div>
      {error && (
        <p
          role="alert"
          className="mt-4 rounded-[6px] border-2 border-jail bg-white p-3 text-[14px] font-semibold text-jail"
        >
          {error}
        </p>
      )}
      <p className="mt-5 text-[12px] leading-snug text-ink-soft">
        Keep your Chogs in a cold wallet? Log in with it once, then let your everyday wallet play them.
      </p>
    </Panel>
  );
}
