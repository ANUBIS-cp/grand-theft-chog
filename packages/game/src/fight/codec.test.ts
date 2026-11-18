import { describe, expect, it } from 'vitest';
import { decodeFightInputs, encodeFightInputs, replayFight, roundFightInput } from './codec.ts';
import { startFight, stepFight, type FightInput } from './sim.ts';

describe('recorded fights', () => {
  it('encode and decode give back the same rounded inputs, and replay ends the same', () => {
    const me = { chog: 1, name: '', powers: ['zap', 'hide'] as never };
    const them = { chog: 2, name: '', powers: ['tackle'] as never, bot: 3 };
    const s = startFight(me, them, 77);
    const inputs: FightInput[] = [];
    for (let n = 0; n < 30 * 120 && s.phase !== 'over'; n++) {
      const i = roundFightInput({ mx: Math.round(Math.cos(n / 40) * 100), my: Math.round(Math.sin(n / 23) * 90), hit: n % 9 === 0, dash: n % 61 === 0, p1: n % 150 === 3 });
      inputs.push(i);
      stepFight(s, [i, { mx: 0, my: 0 }]);
    }
    const text = encodeFightInputs(inputs);
    expect(text.length).toBeLessThan(inputs.length * 2);
    expect(decodeFightInputs(text)).toEqual(inputs);
    const r = replayFight(me, them, 77, decodeFightInputs(text)!);
    expect([r.tick, r.winner, r.f[0].pct, r.f[1].pct]).toEqual([s.tick, s.winner, s.f[0].pct, s.f[1].pct]);
  });
  it('refuses garbage', () => {
    expect(decodeFightInputs('ab')).toBeNull();
    expect(decodeFightInputs('!!!')).toBeNull();
  });
});
