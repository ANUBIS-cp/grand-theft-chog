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

/** WalletConnect (Reown) project: lets phone browsers log in with a wallet app. Not a secret. */
const WC_PROJECT = process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? 'da4e2d280f0359a97043c8c1ad3122a0';
type WcProvider = Eip1193 & { connected?: boolean; accounts?: string[] };
let wc: Promise<WcProvider> | null = null;

/** WalletConnect as one more wallet: a QR code on a computer, or straight into the wallet app on a phone. */
export function walletConnectOption(): WalletOption {
  const provider: Eip1193 = {
    async request(args) {
      wc ??= import('@walletconnect/ethereum-provider').then(({ EthereumProvider }) =>
        EthereumProvider.init({
          projectId: WC_PROJECT,
          chains: [143],
          showQrModal: true,
          rpcMap: { 143: 'https://rpc.monad.xyz' },
          metadata: {
            name: 'Grand Theft Chog',
            description: 'Rob rival gangs with your Chog.',
            url: window.location.origin,
            icons: [`${window.location.origin}/icon.png`],
          },
        }),
      ) as unknown as Promise<WcProvider>;
      const p = await wc!;
      if (args.method === 'eth_requestAccounts' && !p.connected)
        await (p as unknown as { enable(): Promise<string[]> }).enable();
      return p.request(args);
    },
  };
  return { id: 'walletconnect', name: 'Phone wallet (WalletConnect)', icon: null, provider };
}

/** True on a phone or tablet browser. */
export const onPhone = () =>
  typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

export class LoginError extends Error {}

export interface LoginPrep {
  address: string;
  message: string;
}

/** Step 1: connect and build the login message (asks the server for a fresh nonce). */
export async function prepareLogin(wallet: WalletOption): Promise<LoginPrep> {
  let accounts: string[];
  try {
    accounts = (await wallet.provider.request({ method: 'eth_requestAccounts' })) as string[];
  } catch {
    throw new LoginError('The wallet did not connect. Try again and approve the connection.');
  }
  const address = accounts[0];
  if (!address) throw new LoginError('The wallet has no account unlocked.');
  const nonceRes = await fetch('/api/auth/nonce', { cache: 'no-store' });
  if (!nonceRes.ok) throw new LoginError('Could not reach Grand Theft Chog. Try again in a moment.');
  const { nonce } = (await nonceRes.json()) as { nonce: string };
  const message = createSiweMessage({
    address: address as `0x${string}`,
    chainId: 143,
    domain: window.location.host,
    nonce,
    uri: window.location.origin,
    version: '1',
    statement: 'Log in to Grand Theft Chog. This costs nothing and does not move any tokens.',
  });
  return { address, message };
}

/**
 * Step 2: sign the message (no gas, no tokens move) and start a session. On a phone this is its own tap, so
 * the request goes out (and the wallet app can open) straight from the tap.
 */
export async function finishLogin(wallet: WalletOption, prep: LoginPrep): Promise<string> {
  let signature: string;
  try {
    signature = (await wallet.provider.request({
      method: 'personal_sign',
      params: [toHex(prep.message), prep.address],
    })) as string;
  } catch {
    throw new LoginError('You did not sign the login message, so you are not logged in.');
  }
  const res = await fetch('/api/auth/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: prep.message, signature }),
  });
  if (!res.ok) throw new LoginError('The login signature was not accepted. Try again.');
  return prep.address.toLowerCase();
}

/** Connect, sign one message (no gas, no tokens move), and start a session. */
export async function logIn(wallet: WalletOption): Promise<string> {
  return finishLogin(wallet, await prepareLogin(wallet));
}

/** A phone wallet already connected through WalletConnect (it survives the page reloading). */
export function hasWalletConnectSession(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) ?? '';
      if (
        k.startsWith('wc@2:client') &&
        k.endsWith('//session') &&
        (localStorage.getItem(k) ?? '[]') !== '[]'
      )
        return true;
    }
  } catch {
    /* storage blocked */
  }
  return false;
}

/** A link that opens the connected phone wallet app, to go and approve a request. */
export async function walletAppLink(): Promise<string | null> {
  if (!wc) return null;
  const p = (await wc) as unknown as {
    session?: { peer?: { metadata?: { redirect?: { native?: string; universal?: string } } } };
  };
  const r = p.session?.peer?.metadata?.redirect;
  return r?.universal || r?.native || null;
}

export async function logOut(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST' });
}

// ---------- $CHOG burns ----------

const CHOG_TOKEN = '0x350035555E10d9AfAF1566AaebfCeD5BA6C27777';
const MONAD = {
  chainId: '0x8f',
  chainName: 'Monad',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: ['https://rpc.monad.xyz'],
  blockExplorerUrls: ['https://monadscan.com'],
};

/** The wallet that holds `address` (the one you logged in with), found again after a page load. */
async function walletFor(address: string): Promise<Eip1193> {
  if (wc) {
    const p = await wc;
    if (p.connected && p.accounts?.some((a) => a.toLowerCase() === address.toLowerCase())) return p;
  }
  const list = await new Promise<WalletOption[]>((ok) => {
    let last: WalletOption[] = [];
    const stop = discoverWallets((l) => (last = l));
    setTimeout(() => {
      stop();
      ok(last);
    }, 500);
  });
  for (const w of list) {
    const acc = (await w.provider.request({ method: 'eth_accounts' }).catch(() => [])) as string[];
    if (acc.some((a) => a.toLowerCase() === address.toLowerCase())) return w.provider;
  }
  const first = list[0]?.provider;
  // No wallet in this browser (a phone): use WalletConnect.
  return first ?? walletConnectOption().provider;
}

/**
 * Burns `amount` $CHOG from your own wallet with $CHOG's own burn() (no approval, nothing else can be taken)
 * and returns the transaction hash for the server to check.
 */
export async function burnChog(address: string, amount: number): Promise<`0x${string}`> {
  const w = await walletFor(address);
  const accounts = (await w.request({ method: 'eth_requestAccounts' }).catch(() => [])) as string[];
  const from = accounts.find((a) => a.toLowerCase() === address.toLowerCase());
  if (!from) throw new LoginError('Switch your wallet to the account you logged in with.');
  try {
    await w.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: MONAD.chainId }] });
  } catch (e) {
    if ((e as { code?: number }).code !== 4902)
      throw new LoginError('Switch your wallet to Monad and try again.');
    await w.request({ method: 'wallet_addEthereumChain', params: [MONAD] });
  }
  // burn(uint256): selector 0x42966c68, then the amount in wei.
  const wei = BigInt(amount) * 10n ** 18n;
  const data = `0x42966c68${wei.toString(16).padStart(64, '0')}`;
  try {
    return (await w.request({
      method: 'eth_sendTransaction',
      params: [{ from, to: CHOG_TOKEN, data }],
    })) as `0x${string}`;
  } catch {
    throw new LoginError('The burn was not sent. Nothing was spent.');
  }
}
