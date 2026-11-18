import { CHOGS, gangOptions } from '@chog-city/data';
import { HOUR, chogInfo, dayStart } from '@chog-city/game';
import {
  FIGHT_PAY,
  encodeFightInputs,
  roundFightInput,
  startFight,
  stepFight,
  type FightInput,
} from '@chog-city/game/fight';
import { powersFor } from '@chog-city/game/heist';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { gangVaults, type Db } from './db/index.ts';
import { FightRefused, fightCard, finishFightRun, startFightRun, type StartedFight } from './fights.ts';
import { ensureVaults, setGang } from './heists.ts';
import { setOwners } from './ownership.ts';
import { testDb } from './test-db.ts';

const A = '0x00000000000000000000000000000000000000aa';
const B = '0x00000000000000000000000000000000000000bb';
const NOW = dayStart(20_400) + 3 * HOUR;
const chog = CHOGS.find((c) => gangOptions(c).born.includes('lazoor') && !gangOptions(c).anyGang)!.id;

/** Plays the fight the way a decent player would and records the (rounded) inputs, as the browser does. */
function play(f: StartedFight, walkOnly = false): string {
  const s = startFight({ chog, name: '', powers: f.me }, { chog: f.opponent, name: '', powers: f.them, bot: f.slot + 1 }, f.seed);
  const inputs: FightInput[] = [];
  let held: FightInput = { mx: 0, my: 0 };
  for (let n = 0; n < 30 * 300 && s.phase !== 'over'; n++) {
    if (n % 6 === 0 && !walkOnly) {
      const [me, them] = s.f;
      const dx = them.x - me.x;
      const dy = them.y - me.y;
      const d = Math.hypot(dx, dy) || 1;
      held = { mx: Math.round((dx / d) * 100), my: Math.round((dy / d) * 100), hit: d < 1.7 };
    } else held = { mx: held.mx, my: held.my };
    const i = roundFightInput(held);
    inputs.push(i);
    stepFight(s, [i, { mx: 0, my: 0 }]);
  }
  return encodeFightInputs(inputs);
}

const cash = async (db: Db) => (await db.select().from(gangVaults).where(eq(gangVaults.gang, 'lazoor')))[0]!.cash;
const refused = (p: Promise<unknown>) => p.then(() => 'ok', (e) => (e instanceof FightRefused ? e.code : String(e)));

describe('Fight Night on the server', () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await testDb());
    await setOwners(db, [{ tokenId: chog, owner: A, block: 1 }]);
    await ensureVaults(db);
    await setGang(db, A, chog, 'lazoor');
  });

  it('a replayed win against the warm-up pays the gang vault once and moves the card on', async () => {
    const before = await cash(db);
    const f = await startFightRun(db, { address: A, chogId: chog, now: NOW });
    expect(f.slot).toBe(0);
    expect(f.me).toEqual(powersFor(chogInfo(chog).skills));
    const r = await finishFightRun(db, { address: A, id: f.id, inputs: play(f), now: NOW + 60_000 });
    expect(r.won).toBe(true);
    expect(r.paid).toBe(FIGHT_PAY[0]);
    expect(r.beaten).toBe(1);
    expect(await cash(db)).toBe(before + FIGHT_PAY[0]);
    // The next fight is the second of the night.
    expect((await startFightRun(db, { address: A, chogId: chog, now: NOW + 70_000 })).slot).toBe(1);
  });

  it('standing still loses and pays nothing', async () => {
    const before = await cash(db);
    const f = await startFightRun(db, { address: A, chogId: chog, now: NOW });
    const r = await finishFightRun(db, { address: A, id: f.id, inputs: play(f, true), now: NOW + 60_000 });
    expect(r.won).toBe(false);
    expect(r.paid).toBe(0);
    expect(await cash(db)).toBe(before);
    expect((await fightCard(db, chog, NOW)).beaten).toBe(0);
  });

  it('only the player finishes it, once, and only for their own Chog', async () => {
    const f = await startFightRun(db, { address: A, chogId: chog, now: NOW });
    expect(await refused(finishFightRun(db, { address: B, id: f.id, inputs: play(f), now: NOW + 1000 }))).toBe('no-fight');
    await finishFightRun(db, { address: A, id: f.id, inputs: play(f), now: NOW + 1000 });
    expect(await refused(finishFightRun(db, { address: A, id: f.id, inputs: play(f), now: NOW + 2000 }))).toBe('finished');
    expect(await refused(startFightRun(db, { address: B, chogId: chog, now: NOW }))).toBe('not-yours');
    expect(await refused(finishFightRun(db, { address: A, id: 'nope-nope-nope', inputs: '', now: NOW }))).toBe('no-fight');
  });

  it('the card is the same for everyone that day, with the champion last', async () => {
    const a = await fightCard(db, null, NOW);
    const b = await fightCard(db, null, NOW + HOUR);
    expect(a.ids).toEqual(b.ids);
    expect(a.ids).toHaveLength(6);
  });
});
