import { createPublicClient, defineChain, http } from 'viem';

export const monad = defineChain({
  id: 143,
  name: 'Monad',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.monad.xyz'] } },
  blockExplorers: { default: { name: 'Monadscan', url: 'https://monadscan.com' } },
});

let client: ReturnType<typeof createPublicClient> | null = null;

/** Read-only client. MONAD_RPC can point at a keyed RPC; never log it. */
export function publicClient() {
  client ??= createPublicClient({
    chain: monad,
    transport: http(process.env.MONAD_RPC ?? 'https://rpc.monad.xyz', { retryCount: 2, timeout: 10_000 }),
  });
  return client;
}
