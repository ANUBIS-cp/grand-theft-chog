import { describe, expect, it } from 'vitest';
import { PROOF_MS, finishProof, getProof, isProofTx, monAmount, startProof } from './proofs.ts';
import { testDb } from './test-db.ts';

describe('signing in by a send to yourself', () => {
  it('names an amount from 0.0100 to 0.0999 MON and only a self-send of exactly that counts', async () => {
    const { db } = await testDb();
    const a = '0x00000000000000000000000000000000000000aa';
    const p = await startProof(db, { address: a, nonce: 4, block: 100, now: 1_000 });
    const mon = Number(monAmount(p.amountWei));
    expect(mon).toBeGreaterThanOrEqual(0.01);
    expect(mon).toBeLessThan(0.1);
    expect(monAmount(p.amountWei)).toMatch(/^0\.0\d{3}$/);
    expect(p.expiresAt).toBe(1_000 + PROOF_MS);
    expect(isProofTx(p, { from: a, to: a, value: p.amountWei })).toBe(true);
    expect(isProofTx(p, { from: a.toUpperCase(), to: a, value: p.amountWei })).toBe(true);
    // Someone else's wallet, a send to another address, or the wrong amount: no.
    expect(isProofTx(p, { from: '0xbb', to: a, value: p.amountWei })).toBe(false);
    expect(isProofTx(p, { from: a, to: '0xbb', value: p.amountWei })).toBe(false);
    expect(isProofTx(p, { from: a, to: a, value: p.amountWei + 1n })).toBe(false);
    // Done once.
    expect(await finishProof(db, p.id, '0xtx', 2_000)).toBe(true);
    expect(await finishProof(db, p.id, '0xtx', 2_000)).toBe(false);
    expect((await getProof(db, p.id))!.tx).toBe('0xtx');
    expect(await getProof(db, 'bad id!')).toBeNull();
  });
});
