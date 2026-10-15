import { CHOGS, gangOptions } from '@chog-city/data';
import { HOUR, dayStart } from '@chog-city/game';
import { BUST_FINE, START_CASH } from '@chog-city/game/heist';
import { encodeLock, perfectLock } from '@chog-city/game/lock';
import { encodeRushInputs, rushSeed, type RushInput } from '@chog-city/game/rush';
import { encodeAbiParameters, encodeEventTopics } from 'viem';
import { beforeEach, describe, expect, it } from 'vitest';
import { BURN_DAY_MS, CHOG_ABI, CHOG_TOKEN, applyBurn, burnsNow, readBurn } from './burns.ts';
import type { Db } from './db/index.ts';
import {
  HeistRefused,
  POSTER_BOUNTY,
  finishGetaway,
  finishRun,
  heistRecord,
  lockRun,
  setGang,
  startRun,
  vaultCash,
} from './heists.ts';
import { setOwners } from './ownership.ts';
import { testDb } from './test-db.ts';

const A = '0x00000000000000000000000000000000000000aa';
const B = '0x00000000000000000000000000000000000000bb';
const ZERO = '0x0000000000000000000000000000000000000000';
const NOW = dayStart(20_400) + 3 * HOUR;
const born = (g: 'lazoor' | 'mcga') =>
  CHOGS.filter((c) => gangOptions(c).born.includes(g) && !gangOptions(c).anyGang);
const lazoorChog = born('lazoor')[0]!.id;
const mcgaChog = born('mcga')[0]!.id;
const go = (d: 0 | 1 | 2 | 3, n: number): RushInput[] => Array.from({ length: n }, () => ({ d }));
const grabAndGo = encodeRushInputs([...go(3, 12), ...go(1, 12), ...go(2, 10)]);

/** A pretend chain that has one receipt: a $CHOG Transfer of `chog` from `from` to `to`. */
function chain(opts: {
  from?: string;
  to?: string;
  chog?: number;
  status?: 'success' | 'reverted';
  at?: number;
}) {
  const { from = A, to = ZERO, chog = 30, status = 'success', at = NOW } = opts;
  const topics = encodeEventTopics({
    abi: CHOG_ABI,
    eventName: 'Transfer',
    args: { from: from as `0x${string}`, to: to as `0x${string}` },
  });
  return {
    waitForTransactionReceipt: async () =>
      ({
        status,
        blockNumber: 7n,
        logs: [
          {
            address: CHOG_TOKEN,
            topics,
            data: encodeAbiParameters([{ type: 'uint256' }], [BigInt(chog) * 10n ** 18n]),
          },
        ],
      }) as never,
    getBlock: async () => ({ timestamp: BigInt(Math.floor(at / 1000)) }) as never,
  };
}
const TX = (n: number) => `0x${n.toString(16).padStart(64, '0')}` as `0x${string}`;

let db: Db;
beforeEach(async () => {
  ({ db } = await testDb());
  await setOwners(db, [
    { tokenId: lazoorChog, owner: A, block: 1 },
    { tokenId: mcgaChog, owner: B, block: 1 },
  ]);
  await setGang(db, A, lazoorChog, 'lazoor');
  await setGang(db, B, mcgaChog, 'mcga');
});

const code = (p: Promise<unknown>) =>
  p.then(
    () => 'ok',
    (e) => (e instanceof HeistRefused ? e.code : String(e)),
  );

describe('$CHOG burns', () => {
  it('reads a burn off the chain: from your wallet, to nobody, enough, recent', async () => {
    const ask = { tx: TX(1), address: A, price: 30, now: NOW };
    expect(await readBurn(chain({}), ask)).toBe(30);
    expect(await code(readBurn(chain({ from: B }), ask))).toBe('burn-too-small');
    expect(await code(readBurn(chain({ to: B }), ask))).toBe('burn-too-small');
    expect(await code(readBurn(chain({ chog: 29 }), ask))).toBe('burn-too-small');
    expect(await code(readBurn(chain({ status: 'reverted' }), ask))).toBe('burn-failed');
    expect(await code(readBurn(chain({ at: NOW - 2 * HOUR }), ask))).toBe('burn-too-old');
  });

  it('bail gets your Chog out of jail now, and a burn can only be used once', async () => {
    // Bust A's Chog so it's in jail.
    const run = await startRun(db, { address: A, chogId: lazoorChog, target: 'mcga', now: NOW });
    await lockRun(db, {
      address: A,
      runId: run.id,
      inputs: encodeLock(perfectLock('mcga', rushSeed(run.id))),
      now: NOW + 500,
    });
    await finishRun(db, { address: A, runId: run.id, inputs: '', now: NOW + 60_000 });
    const t = NOW + 70_000;
    expect((await heistRecord(db, lazoorChog))!.jailedUntil!.getTime()).toBeGreaterThan(t);
    // Not yours: refused before anyone burns.
    expect(
      await code(applyBurn(db, { address: B, kind: 'bail', chogId: lazoorChog, tx: TX(1), amount: 30 }, t)),
    ).toBe('not-yours');
    await applyBurn(db, { address: A, kind: 'bail', chogId: lazoorChog, tx: TX(1), amount: 30 }, t);
    expect((await heistRecord(db, lazoorChog))!.jailedUntil!.getTime()).toBe(t);
    expect(
      await code(applyBurn(db, { address: A, kind: 'bail', chogId: lazoorChog, tx: TX(1), amount: 30 }, t)),
    ).toBe('not-in-jail');
    expect((await burnsNow(db, t)).burned).toBe(30);
  });

  it('a poster goes on a rival for a day (a second adds a day) and pays a bounty when it is caught', async () => {
    expect(
      await code(
        applyBurn(
          db,
          { address: A, kind: 'poster', chogId: lazoorChog, line: 1, tx: TX(2), amount: 60 },
          NOW,
        ),
      ),
    ).toBe('own-chog');
    await applyBurn(
      db,
      { address: B, kind: 'poster', chogId: lazoorChog, line: 1, tx: TX(2), amount: 60 },
      NOW,
    );
    expect(
      await code(
        applyBurn(
          db,
          { address: B, kind: 'poster', chogId: lazoorChog, line: 1, tx: TX(2), amount: 60 },
          NOW,
        ),
      ),
    ).toBe('burn-used');
    await applyBurn(
      db,
      { address: B, kind: 'poster', chogId: lazoorChog, line: 2, tx: TX(3), amount: 60 },
      NOW,
    );
    const up = await burnsNow(db, NOW);
    expect(up.posters).toEqual([{ chog: lazoorChog, line: 'Owes us money', until: NOW + 2 * BURN_DAY_MS }]);
    // A's postered Chog robs MCGA, has more police on the way home, and is caught.
    const run = await startRun(db, { address: A, chogId: lazoorChog, target: 'mcga', now: NOW });
    await lockRun(db, {
      address: A,
      runId: run.id,
      inputs: encodeLock(perfectLock('mcga', rushSeed(run.id))),
      now: NOW + 500,
    });
    const out = await finishRun(db, { address: A, runId: run.id, inputs: grabAndGo, now: NOW + 60_000 });
    expect(out.getaway?.wanted).toBe(true);
    await finishGetaway(db, { runId: run.id, outcome: 'caught', by: null, now: NOW + 80_000 });
    expect((await vaultCash(db)).mcga).toBe(START_CASH + BUST_FINE + POSTER_BOUNTY);
  });

  it("a banner flies for the buyer's gang for a day", async () => {
    await applyBurn(db, { address: A, kind: 'banner', chogId: lazoorChog, tx: TX(4), amount: 150 }, NOW);
    expect((await burnsNow(db, NOW)).banners).toEqual([{ gang: 'lazoor', until: NOW + BURN_DAY_MS }]);
    expect((await burnsNow(db, NOW + BURN_DAY_MS + 1)).banners).toEqual([]);
  });
});
