import { monad } from '@chog-city/server';
import { createPublicClient, http } from 'viem';

export { monad };

let client: ReturnType<typeof createPublicClient> | null = null;

/** Read-only client. MONAD_RPC can point at a keyed RPC; never log it. */
export function publicClient() {
  client ??= createPublicClient({
    chain: monad,
    transport: http(process.env.MONAD_RPC ?? 'https://rpc.monad.xyz', { retryCount: 2, timeout: 10_000 }),
  });
  return client;
}
