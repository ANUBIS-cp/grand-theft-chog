import { describe, expect, it } from 'vitest';
import { ALL_RUSH_MAPS, Cell, buildMap, cellAt, distanceMap, type Dir, type RushMapDef } from './map.ts';
import { rushRules } from './rules.ts';
import { DT, RUSH, TPS, startRush, stepRush, type RushInput, type RushState } from './sim.ts';

const UP = 0 as Dir;
const RIGHT = 1 as Dir;
const DOWN = 2 as Dir;
const LEFT = 3 as Dir;
const NO_GUARDS = { guards: 0, safeValue: 500, hunt: 0 };

const def = (rows: string[]): RushMapDef => ({ id: 't', name: 'Test', seconds: 60, rows });
const run = (
  s: RushState,
  m: ReturnType<typeof buildMap>,
  rules: typeof NO_GUARDS,
  input: RushInput,
  n: number,
) => {
  const ev = [];
  for (let i = 0; i < n; i++) ev.push(...stepRush(s, m, rules, input));
  return ev;
};

describe('rush maps', () => {
  it.each(ALL_RUSH_MAPS.map((d) => [d.id, d] as const))('%s: everything can be reached', (_, d) => {
    const m = buildMap(d);
    const dist = distanceMap(m, m.start.x, m.start.y);
    const at = (p: { x: number; y: number }) => dist[p.y * m.w + p.x]!;
    for (const c of [...m.coins, ...m.stacks, ...m.flips, ...m.guards, ...m.lasers])
      expect(at(c), `${c.x},${c.y}`).toBeGreaterThanOrEqual(0);
    expect(at(m.exit)).toBeGreaterThan(0);
    const s = m.safe!;
    expect(cellAt(m, s.x, s.y)).toBe(Cell.Safe);
    expect(
      [
        at({ x: s.x - 1, y: s.y }),
        at({ x: s.x + 1, y: s.y }),
        at({ x: s.x, y: s.y + 1 }),
        at({ x: s.x, y: s.y - 1 }),
      ].some((v) => v >= 0),
    ).toBe(true);
    expect(m.corners).toHaveLength(4);
  });
});

describe('moving', () => {
  const m = buildMap(def(['#######', '#,,,,,#', '#,###,#', '#,,@,,#', '###E###']));

  it('runs along a corridor at full speed and stops at the wall', () => {
    const s = startRush(m, NO_GUARDS, [], 1);
    run(s, m, NO_GUARDS, { d: RIGHT }, Math.round(TPS / RUSH.speed));
    expect(s.me.x).toBeCloseTo(4.5, 1);
    run(s, m, NO_GUARDS, { d: RIGHT }, 30);
    expect(s.me.x).toBeCloseTo(5.5, 5);
  });

  it('turns into a side corridor pressed a little early, and keeps going until it can', () => {
    const s = startRush(m, NO_GUARDS, [], 1);
    // Heading right, holding up: no way up until column 5, so it carries on and turns there.
    run(s, m, NO_GUARDS, { d: RIGHT }, 3);
    run(s, m, NO_GUARDS, { d: UP }, 40);
    expect(s.me.x).toBeCloseTo(5.5, 5);
    expect(s.me.y).toBeLessThan(2.6);
  });

  it('stops when you let go, after a short tap still counts', () => {
    const s = startRush(m, NO_GUARDS, [], 1);
    run(s, m, NO_GUARDS, { d: LEFT }, 1);
    run(s, m, NO_GUARDS, { d: -1 }, 30);
    const x = s.me.x;
    expect(x).toBeLessThan(3.5);
    run(s, m, NO_GUARDS, { d: -1 }, 30);
    expect(s.me.x).toBe(x);
  });
});

describe('cash and combos', () => {
  it('a run of coins builds the combo, and stops building once you pause', () => {
    const m = buildMap(def(['###############', '#@............#', '######E########']));
    const s = startRush(m, NO_GUARDS, [], 1);
    const ev = run(s, m, NO_GUARDS, { d: RIGHT }, 80);
    const coins = ev.filter((e) => e.t === 'coin');
    expect(coins).toHaveLength(12);
    expect(coins.at(-1)!.mult).toBe(2);
    expect(s.carried).toBe(RUSH.coin * (10 + 2 * 2));
  });

  it('escapes with the cash, +25% for cleaning the place out', () => {
    const m = buildMap(def(['#####', '#$@.#', '##E##']));
    const s = startRush(m, NO_GUARDS, [], 1);
    run(s, m, NO_GUARDS, { d: LEFT }, 10);
    run(s, m, NO_GUARDS, { d: RIGHT }, 20);
    run(s, m, NO_GUARDS, { d: LEFT }, 4);
    run(s, m, NO_GUARDS, { d: DOWN }, 20);
    expect(s.phase).toBe('escaped');
    expect(s.swept).toBe(true);
    expect(s.score).toBe(Math.floor(s.carried * 1.25));
  });

  it("can't leave with empty pockets", () => {
    const m = buildMap(def(['#####', '#,@,#', '##E##']));
    const s = startRush(m, NO_GUARDS, [], 1);
    run(s, m, NO_GUARDS, { d: DOWN }, 30);
    expect(s.phase).toBe('play');
  });
});

describe('the safe', () => {
  const m = buildMap(def(['#####', '#,S,#', '#,@,#', '##E##']));

  it('cracks with three presses in the green, and pays out', () => {
    const s = startRush(m, NO_GUARDS, [], 1);
    run(s, m, NO_GUARDS, { d: -1, use: true }, 1);
    expect(s.safe!.dialing).toBe(true);
    for (let k = 0; k < 600 && !s.safe!.open; k++) {
      const off = Math.abs(((s.safe!.needle - s.safe!.zone + 540) % 360) - 180);
      stepRush(s, m, NO_GUARDS, { d: -1, use: off < 8 });
    }
    expect(s.safe!.open).toBe(true);
    expect(s.carried).toBe(500);
    expect(s.guards).toHaveLength(0);
  });

  it('a miss makes a noise that brings the guards', () => {
    const s = startRush(m, NO_GUARDS, [], 1);
    run(s, m, NO_GUARDS, { d: -1, use: true }, 1);
    let missed = false;
    for (let k = 0; k < 200 && !missed; k++) {
      const off = Math.abs(((s.safe!.needle - s.safe!.zone + 540) % 360) - 180);
      missed = stepRush(s, m, NO_GUARDS, { d: -1, use: off > 120 && k > 6 }).some((e) => e.t === 'miss');
    }
    expect(missed).toBe(true);
    expect(s.noise).not.toBeNull();
    expect(s.alarm).toBeGreaterThan(0);
  });
});

describe('guards', () => {
  const m = buildMap(def(['#########', '#.......#', '#.#####.#', '#G..@..F#', '####E####']));
  const ONE = { guards: 1, safeValue: 0, hunt: 0 };

  it('a hunting guard tags you if you stand still: each tag costs a heart and cash, the last one busts you', () => {
    const s = startRush(m, ONE, [], 1);
    s.clock = RUSH.waves[0]!; // straight into a hunt
    s.carried = 100;
    const ev = run(s, m, ONE, { d: -1 }, 120);
    const tag = ev.find((e) => e.t === 'tag');
    expect(tag).toMatchObject({ lost: 30, hearts: RUSH.hearts - 1 });
    run(s, m, ONE, { d: -1 }, 600);
    expect(s.phase).toBe('busted');
    expect(s.caughtBy).toBe(0);
  });

  it('the loudspeaker flips the chase: run into a guard to knock it out for a bonus', () => {
    const m = buildMap(def(['#########', '#G...@.F#', '####E####']));
    const s = startRush(m, ONE, [], 1);
    s.clock = RUSH.waves[0]!;
    const ev = run(s, m, ONE, { d: RIGHT }, 25);
    expect(ev.some((e) => e.t === 'flip')).toBe(true);
    expect(s.guards[0]!.mode).toBe('panic');
    const more = run(s, m, ONE, { d: LEFT }, 90);
    expect(more.some((e) => e.t === 'knock')).toBe(true);
    expect(s.phase).toBe('play');
  });

  it('a defender steers their own guard', () => {
    const s = startRush(m, ONE, [], 1);
    s.guards[0]!.human = 'p1';
    const x = s.guards[0]!.x;
    for (let i = 0; i < 10; i++) stepRush(s, m, ONE, { d: -1 }, { p1: { d: RIGHT } });
    expect(s.guards[0]!.x).toBeGreaterThan(x + 1);
  });
});

describe('the clock', () => {
  it('runs out: the doors lock and you are busted', () => {
    const m = buildMap(def(['#####', '#,@,#', '##E##']));
    const s = startRush(m, NO_GUARDS, [], 1);
    run(s, m, NO_GUARDS, { d: -1 }, Math.ceil(60 / DT) + 2);
    expect(s.phase).toBe('busted');
  });
});

describe('rules by defence level', () => {
  it('richer vaults get more, faster guards and a fuller safe', () => {
    expect(rushRules(3).guards).toBeGreaterThan(rushRules(0).guards);
    expect(rushRules(3).hunt).toBeGreaterThan(rushRules(0).hunt);
    expect(rushRules(3).safeValue).toBeGreaterThan(rushRules(0).safeValue);
    expect(rushRules(1, true).needSafe).toBe(true);
  });
});

describe('replays and settling', () => {
  it('a recorded run replays to exactly the same end, and settles from it', async () => {
    const { encodeRushInputs, decodeRushInputs, replayRush, settleRush, rushSeed } = await import('./war.ts');
    const { rushMap } = await import('./rules.ts');
    const m = rushMap('rush-bank')!;
    const rules = rushRules(2);
    const seed = rushSeed('some-run-id');
    const s = startRush(m, rules, ['sprint'], seed);
    const inputs: RushInput[] = [];
    // A wandering player: turns every so often, uses a power once.
    for (let i = 0; s.phase === 'play' && i < 3000; i++) {
      const input: RushInput = {
        d: ([UP, LEFT, UP, RIGHT, DOWN] as const)[Math.floor(i / 25) % 5]!,
        ...(i === 40 ? { p: 0 } : {}),
      };
      inputs.push(input);
      stepRush(s, m, rules, input);
    }
    const text = encodeRushInputs(inputs);
    expect(decodeRushInputs(text)).toEqual(
      inputs.map((x) => ({ d: x.d, ...(x.p !== undefined ? { p: x.p } : {}) })),
    );
    const again = replayRush(m, rules, ['sprint'], decodeRushInputs(text)!, seed);
    expect(again.phase).toBe(s.phase);
    expect(again.carried).toBe(s.carried);
    expect(again.tick).toBe(s.tick);
    const settled = settleRush(m, rules, ['sprint'], decodeRushInputs(text)!, seed, 10_000, 10_000, false);
    expect(settled.moved).toBe(s.phase === 'escaped' ? s.score : s.carried + 250);
  });
});

describe('the robber’s screen in a live raid', () => {
  it('rewinding for late defender moves ends exactly where the server is', async () => {
    const { RushTimeline } = await import('./timeline.ts');
    const { replayRush, encodeDefender } = await import('./war.ts');
    const { rushMap } = await import('./rules.ts');
    const m = rushMap('rush-bank')!;
    const rules = rushRules(1);
    const t = new RushTimeline(m, rules, [], 42);
    const robber = (i: number): RushInput => ({
      d: ([LEFT, UP, RIGHT, UP, LEFT, DOWN] as const)[Math.floor(i / 20) % 6]!,
    });
    // The server's truth: a defender joins at step 30 on guard 1 and changes direction every 15 steps.
    const moves: string[] = [];
    const dirAt = (k: number) => ([UP, RIGHT, DOWN, LEFT] as const)[Math.floor(k / 15) % 4]!;
    for (let k = 30; k < 600; k++) moves.push(encodeDefender({ d: dirAt(k) }));
    // The robber hears about each change 6 steps late.
    for (let i = 0; t.s.phase === 'play' && i < 600; i++) {
      t.step(robber(i));
      const heard = i - 6;
      if (heard === 30) t.join({ guard: 1, name: 'd1', at: 30 });
      if (heard >= 30 && (heard - 30) % 15 === 0) t.change('d1', heard, encodeDefender({ d: dirAt(heard) }));
      t.catchUp();
    }
    // Let the last late messages land.
    for (let heard = t.s.tick - 6; heard < t.s.tick; heard++)
      if (heard >= 30 && (heard - 30) % 15 === 0) t.change('d1', heard, encodeDefender({ d: dirAt(heard) }));
    t.catchUp();
    const n = t.s.tick;
    // The server: the same steps, with every defender move on the step it really landed.
    const truth = startRush(m, rules, [], 42);
    for (let k = 0; k < n && truth.phase === 'play'; k++) {
      if (k === 30) truth.guards[1]!.human = 'd1';
      stepRush(truth, m, rules, t.inputs[k]!, k >= 30 ? { d1: { d: dirAt(k) } } : {});
    }
    expect(n).toBeGreaterThan(100);
    expect(truth.tick).toBe(n);
    expect(t.s.phase).toBe(truth.phase);
    expect(t.s.me).toEqual(truth.me);
    expect(t.s.guards.map((g) => [g.x, g.y, g.mode])).toEqual(truth.guards.map((g) => [g.x, g.y, g.mode]));
    expect(t.s.carried).toBe(truth.carried);
    void replayRush;
  });
});
