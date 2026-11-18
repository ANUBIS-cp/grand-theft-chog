import { describe, expect, it } from 'vitest';
import { FIGHT, FIGHT_TPS, startFight, stepFight, type FightInput, type FighterSetup } from './sim.ts';

const idle: FightInput = { mx: 0, my: 0 };
const bot = (level: number, powers: FighterSetup['powers'] = ['zap', 'hide']): FighterSetup => ({
  chog: level,
  name: `Bot ${level}`,
  powers,
  bot: level,
});
const player = (powers: FighterSetup['powers'] = ['hack', 'hide']): FighterSetup => ({ chog: 7, name: 'You', powers });

function runToEnd(a: FighterSetup, b: FighterSetup, seed: number, script?: (tick: number) => FightInput) {
  const s = startFight(a, b, seed);
  const inputs: FightInput[] = [];
  for (let n = 0; n < FIGHT_TPS * 400 && s.phase !== 'over'; n++) {
    const mine = script ? script(s.tick) : idle;
    inputs.push(mine);
    stepFight(s, [mine, idle]);
  }
  return { s, inputs };
}

describe('Fight Night', () => {
  it('plays a fight the same way twice from the same seed and inputs (the server replays it)', () => {
    const script = (t: number): FightInput => ({ mx: t % 90 < 45 ? 100 : -40, my: (t % 37) - 18, hit: t % 11 === 0, dash: t % 70 === 0, p1: t % 200 === 5 });
    const a = runToEnd(player(), bot(4), 1234, script);
    const b = startFight(player(), bot(4), 1234);
    for (const i of a.inputs) stepFight(b, [i, idle]);
    expect(b.tick).toBe(a.s.tick);
    expect(b.winner).toBe(a.s.winner);
    expect(b.f.map((f) => [f.x, f.y, f.pct])).toEqual(a.s.f.map((f) => [f.x, f.y, f.pct]));
  });

  it('always ends: two of three falls, in a bounded time', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { s } = runToEnd(bot(3), bot(5), seed);
      expect(s.phase).toBe('over');
      expect(Math.max(...s.wins)).toBe(FIGHT.falls);
    }
  });

  it('walking into the ropes bounces you back; it never takes you out', () => {
    // The other side does nothing; you hold the stick into the ropes for the whole fall.
    const still: FighterSetup = { chog: 2, name: 'Still', powers: ['sprint'] };
    const s = startFight(player(), still, 5);
    for (let n = 0; n < FIGHT_TPS * 20; n++) stepFight(s, [{ mx: 0, my: -100 }, idle]);
    expect(s.f[0].out).toBe(false);
    expect(Math.abs(s.f[0].y)).toBeLessThanOrEqual(s.ring + 1e-9);
  });

  it('a hit on someone already hurt sends them through the ropes and out', () => {
    const still: FighterSetup = { chog: 2, name: 'Still', powers: ['sprint'] };
    const s = startFight(player(), still, 9);
    while (s.phase !== 'fight') stepFight(s, [idle, idle]);
    s.f[1].pct = 160;
    s.f[1].x = s.ring - 0.6;
    s.f[0].x = s.ring - 1.4;
    s.f[0].fx = 1;
    s.f[0].fy = 0;
    let out = false;
    for (let n = 0; n < FIGHT_TPS * 2 && !out; n++) {
      stepFight(s, [{ mx: 0, my: 0, hit: n === 0 }, idle]);
      out = s.f[1].out || s.events.some((e) => e.k === 'out');
    }
    expect(out).toBe(true);
    expect(s.wins[0]).toBe(1);
  });

  it('the champion beats a level-1 fighter almost every time', () => {
    let champ = 0;
    for (let seed = 1; seed <= 30; seed++) if (runToEnd(bot(1), bot(6), seed).s.winner === 1) champ++;
    expect(champ).toBeGreaterThanOrEqual(26);
  });

  it('powers: hack takes 20 off your number; hide lets a hit pass through', () => {
    const still: FighterSetup = { chog: 2, name: 'Still', powers: ['sprint'] };
    const s = startFight(player(['hack', 'hide']), still, 3);
    while (s.phase !== 'fight') stepFight(s, [idle, idle]);
    s.f[0].pct = 50;
    stepFight(s, [{ mx: 0, my: 0, p1: true }, idle]);
    expect(s.f[0].pct).toBe(30);
    // They swing at you while you're hidden: the hit doesn't land.
    s.f[0].x = 0;
    s.f[0].y = 0;
    s.f[1].x = 1.15;
    s.f[1].y = 0;
    s.f[1].fx = -1;
    s.f[1].fy = 0;
    stepFight(s, [{ mx: 0, my: 0, p2: true }, { mx: 0, my: 0, hit: true }]);
    for (let n = 0; n < 12; n++) stepFight(s, [idle, idle]);
    expect(s.f[0].pct).toBe(30);
  });
});
