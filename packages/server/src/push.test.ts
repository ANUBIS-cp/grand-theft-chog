import { CHOGS, gangOptions } from '@chog-city/data';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { delegations, type Db } from './db/index.ts';
import { setGang } from './heists.ts';
import { setOwners } from './ownership.ts';
import { PUSH_GAP_MS, dropPushSub, notifyRaid, savePushSub, setPushSender, testPush } from './push.ts';
import { testDb } from './test-db.ts';

const A = '0x00000000000000000000000000000000000000aa';
const B = '0x00000000000000000000000000000000000000bb';
const C = '0x00000000000000000000000000000000000000cc';
const NOW = Date.UTC(2026, 10, 20, 12);
const born = (g: 'lazoor' | 'mcga') => CHOGS.find((c) => gangOptions(c).born.includes(g) && !gangOptions(c).anyGang)!.id;
const lazoorChog = born('lazoor');
const mcgaChog = born('mcga');
const sub = (n: string) => ({ endpoint: `https://push.example/${n}`, keys: { p256dh: `p-${n}`, auth: `a-${n}` } });

describe('raid alerts', () => {
  let db: Db;
  let sent: { endpoint: string; msg: { title: string; body: string; url: string } }[];
  let gone: Set<string>;
  beforeEach(async () => {
    ({ db } = await testDb());
    sent = [];
    gone = new Set();
    setPushSender(async (s, payload) => {
      if (gone.has(s.endpoint)) return { gone: true };
      sent.push({ endpoint: s.endpoint, msg: JSON.parse(payload) });
      return { gone: false };
    });
    await setOwners(db, [
      { tokenId: lazoorChog, owner: A, block: 1 },
      { tokenId: mcgaChog, owner: B, block: 1 },
    ]);
    await setGang(db, A, lazoorChog, 'lazoor');
    await setGang(db, B, mcgaChog, 'mcga');
    await savePushSub(db, A, sub('a'));
    await savePushSub(db, B, sub('b'));
  });
  afterEach(() => setPushSender(null));

  const raid = (now = NOW, runId = 'run-1') =>
    notifyRaid(db, { target: 'lazoor', gang: 'mcga', chogId: mcgaChog, robber: B, runId, now });

  it("tells the robbed gang, not the robber, with a link to that robbery", async () => {
    expect(await raid()).toBe(1);
    expect(sent.map((s) => s.endpoint)).toEqual(['https://push.example/a']);
    expect(sent[0]!.msg.url).toBe('/play?raid=run-1');
    expect(sent[0]!.msg.title).toContain('vault is being robbed');
  });

  it('buzzes a phone at most once every few minutes', async () => {
    await raid(NOW);
    expect(await raid(NOW + 60_000, 'run-2')).toBe(0);
    expect(await raid(NOW + PUSH_GAP_MS + 1, 'run-3')).toBe(1);
  });

  it('also tells someone the owner lets play their Chogs', async () => {
    await db.insert(delegations).values({ owner: A, player: C, signature: '0x' });
    await savePushSub(db, C, sub('c'));
    expect(await raid()).toBe(2);
  });

  it('forgets a phone that unsubscribed, and a wallet can turn its own alerts off', async () => {
    gone.add('https://push.example/a');
    expect(await raid()).toBe(0);
    gone.clear();
    expect(await raid(NOW + PUSH_GAP_MS * 2)).toBe(0);
    await savePushSub(db, A, sub('a2'));
    await dropPushSub(db, B, sub('a2').endpoint);
    expect(await raid(NOW + PUSH_GAP_MS * 3)).toBe(1);
    await dropPushSub(db, A, sub('a2').endpoint);
    expect(await raid(NOW + PUSH_GAP_MS * 4)).toBe(0);
  });

  it('a test alert goes to your own phones right away', async () => {
    await raid();
    expect(await testPush(db, A, NOW + 1000)).toBe(1);
    expect(sent.at(-1)!.msg.title).toBe('Raid alerts are on');
  });
});
