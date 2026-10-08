'use client';
import { createSiweMessage } from 'viem/siwe';
import { toHex } from 'viem';

// Browser wallets announce themselves with EIP-6963 (MetaMask, Rabby, Phantom, OKX, Backpack...).
// Mobile wallet apps' built-in browsers do the same, or at least expose window.ethereum.

export interface Eip1193 {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}
export interface WalletOption {
  id: string;
  name: string;
  icon: string | null;
  provider: Eip1193;
}

export function discoverWallets(onChange: (list: WalletOption[]) => void): () => void {
  const found = new Map<string, WalletOption>();
  const announce = (ev: Event) => {
    const d = (
      ev as CustomEvent<{
        info: { uuid: string; name: string; icon: string; rdns: string };
        provider: Eip1193;
      }>
    ).detail;
    if (!d?.info || !d.provider) return;
    found.set(d.info.rdns || d.info.uuid, {
      id: d.info.rdns || d.info.uuid,
      name: d.info.name,
      icon: d.info.icon,
      provider: d.provider,
    });
    onChange([...found.values()]);
  };
  window.addEventListener('eip6963:announceProvider', announce);
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  // Older wallets: window.ethereum only.
  const t = setTimeout(() => {
    const eth = (window as unknown as { ethereum?: Eip1193 }).ethereum;
    if (found.size === 0 && eth)
      onChange([{ id: 'injected', name: 'Browser wallet', icon: null, provider: eth }]);
  }, 400);
  return () => {
    window.removeEventListener('eip6963:announceProvider', announce);
    clearTimeout(t);
  };
}

export class LoginError extends Error {}

/** Connect, sign one message (no gas, no tokens move), and start a session. */
export async function logIn(wallet: WalletOption): Promise<string> {
  let accounts: string[];
  try {
    accounts = (await wallet.provider.request({ method: 'eth_requestAccounts' })) as string[];
  } catch {
    throw new LoginError('The wallet did not connect. Try again and approve the connection.');
  }
  const address = accounts[0];
  if (!address) throw new LoginError('The wallet has no account unlocked.');
  const nonceRes = await fetch('/api/auth/nonce', { cache: 'no-store' });
  if (!nonceRes.ok) throw new LoginError('Could not reach Chog City. Try again in a moment.');
  const { nonce } = (await nonceRes.json()) as { nonce: string };
  const message = createSiweMessage({
    address: address as `0x${string}`,
    chainId: 143,
    domain: window.location.host,
    nonce,
    uri: window.location.origin,
    version: '1',
    statement: 'Log in to Chog City. This costs nothing and does not move any tokens.',
  });
  let signature: string;
  try {
    signature = (await wallet.provider.request({
      method: 'personal_sign',
      params: [toHex(message), address],
    })) as string;
  } catch {
    throw new LoginError('You did not sign the login message, so you are not logged in.');
  }
  const res = await fetch('/api/auth/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message, signature }),
  });
  if (!res.ok) throw new LoginError('The login signature was not accepted. Try again.');
  return address.toLowerCase();
}

export async function logOut(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST' });
}
