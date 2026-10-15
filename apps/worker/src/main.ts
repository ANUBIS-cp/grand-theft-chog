// Chog World worker: keeps owners in sync with the chain and opens each game day on time.
import { ensureDay, expireGetaways, monad, seedStates } from '@chog-city/server';
import { connect } from '@chog-city/server/db';
import { dayOf } from '@chog-city/game';
import { createPublicClient, http } from 'viem';
import { errCode, log } from './log.ts';
import { followTransfers, snapshotOwners } from './owners.ts';

const { db, sql } = connect();
const client = createPublicClient({
  chain: monad,
  transport: http(process.env.MONAD_RPC ?? 'https://rpc.monad.xyz', { retryCount: 2, timeout: 15_000 }),
});
let stopping = false;

async function every(ms: number, name: string, fn: () => Promise<unknown>): Promise<void> {
  while (!stopping) {
    try {
      await fn();
    } catch (e) {
      log(`${name} failed`, { err: errCode(e) });
    }
    await new Promise((r) => setTimeout(r, ms));
  }
}

async function main() {
  const seeded = await seedStates(db, Date.now());
  if (seeded) log('seeded chog states', { seeded });
  for (let attempt = 1; ; attempt++) {
    try {
      await snapshotOwners(db, client);
      break;
    } catch (e) {
      log('owner snapshot failed', { attempt, err: errCode(e) });
      await new Promise((r) => setTimeout(r, Math.min(60_000, attempt * 5000)));
    }
  }
  let lastDay = -1;
  await Promise.all([
    every(2_000, 'transfers', () => followTransfers(db, client)),
    every(15_000, 'days', async () => {
      const day = dayOf(Date.now());
      await ensureDay(db, day);
      if (day !== lastDay) log('game day ready', { day });
      lastDay = day;
    }),
    // A getaway the live server never reported on is banked, so its failure doesn't cost the player.
    every(30_000, 'getaways', async () => {
      const n = await expireGetaways(db, Date.now());
      if (n) log('banked unreported getaways', { n });
    }),
  ]);
}

for (const sig of ['SIGINT', 'SIGTERM'] as const)
  process.on(sig, () => {
    stopping = true;
    log('stopping');
    setTimeout(() => sql.end().finally(() => process.exit(0)), 3000);
  });

main().catch((e) => {
  log('worker crashed', { err: errCode(e) });
  process.exit(1);
});
