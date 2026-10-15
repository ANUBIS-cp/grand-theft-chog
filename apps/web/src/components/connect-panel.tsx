'use client';
import { DeviceMobile, Wallet } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import {
  LoginError,
  discoverWallets,
  logIn,
  onPhone,
  walletConnectOption,
  type WalletOption,
} from '@/lib/wallet';

// Log in with the wallet that holds your Chog: any wallet in this browser, or a phone wallet app through
// WalletConnect (a QR code on a computer, straight into the app on a phone).

export function ConnectPanel({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [wallets, setWallets] = useState<WalletOption[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phone, setPhone] = useState(false);

  useEffect(() => {
    setPhone(onPhone());
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

  const wcOption = walletConnectOption();
  // On a phone with no wallet in the browser, WalletConnect is the way in: put it first.
  const list = wallets ? (phone && wallets.length === 0 ? [wcOption] : [...wallets, wcOption]) : null;

  return (
    <div className="p-1 text-white">
      <p className="text-[15px] leading-snug text-label-2">
        Use the wallet that holds your Chog. You sign one message to log in: it costs nothing and doesn&apos;t
        move any tokens.
      </p>

      <div className="group-list mt-5">
        {list === null && <div className="h-14 animate-pulse" aria-label="Looking for wallets" />}
        {list?.map((w) => (
          <button
            key={w.id}
            onClick={() => go(w)}
            disabled={!!busy && busy !== w.id}
            className="press flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.06] disabled:opacity-40"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-[10px] bg-white/10">
              {w.icon ? (
                <img src={w.icon} alt="" width={36} height={36} />
              ) : w.id === 'walletconnect' ? (
                <DeviceMobile size={20} weight="fill" className="text-sys-blue" />
              ) : (
                <Wallet size={20} weight="fill" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[16px] font-semibold">{w.name}</span>
              {w.id === 'walletconnect' && (
                <span className="block text-[13px] text-label-2">
                  {phone ? 'Opens your wallet app' : 'Scan a QR code with your phone'}
                </span>
              )}
            </span>
            {busy === w.id && (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            )}
          </button>
        ))}
      </div>
      {error && (
        <p
          role="alert"
          className="mt-4 rounded-[14px] bg-sys-red/15 px-3 py-2.5 text-[14px] font-medium text-sys-red"
        >
          {error}
        </p>
      )}
      <p className={cn('mt-4 text-[12px] leading-snug text-label-3')}>
        Keep your Chogs in a cold wallet? Log in with it once, then let your everyday wallet play them.
      </p>
    </div>
  );
}
