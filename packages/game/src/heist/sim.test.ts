import { describe, expect, it } from 'vitest';
import { UNIT, buildLevel, distances, type Dir, type VaultDef } from './level.ts';
import { powersFor } from './powers.ts';
import { IDLE, LOCKDOWN, inLight, replay, startHeist, step, type Input } from './sim.ts';
import { FIRST_VAULT, VAULTS } from './vaults.ts';

const go = (d: Dir | -1, n: number): Input[] => Array.from({ length: n }, () => ({ d, p: -1 }));
const UP = 0 as Dir;
const RIGHT = 1 as Dir;
const DOWN = 2 as Dir;
const LEFT = 3 as Dir;

/** A tiny vault for rule tests: no guards unless a test adds them. */
const room = (rows: string[], extra: Partial<VaultDef> = {}): VaultDef => ({
  id: 'test',
  name: 'Test',
  rooms: [],
  rows,
  guards: [],
  cameras: [],
  lasers: [],
  safeValue: 100,
  seconds: 60,
  ...extra,
});

describe('vaults', () => {
  it.each(VAULTS.map((v) => [v.id, v] as const))('%s: every coin, bag and safe can be reached', (_, def) => {
    const l = buildLevel(def);
    const dist = distances(l, l.start[0], l.start[1]);
    for (const x of l.loot) expect(dist[x.y * l.w + x.x], `${x.kind} at ${x.x},${x.y}`).toBeGreaterThan(0);
    for (const s of l.safes) {
      const near = [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ].some(([dx, dy]) => (dist[(s.y + dy!) * l.w + s.x + dx!] ?? -1) >= 0);
      expect(near).toBe(true);
    }
    expect(dist[l.exit[1] * l.w + l.exit[0]]).toBeGreaterThan(0);
  });
});

describe('moving', () => {
  const l = buildLevel(room(['#####', '#@..#', '#...#', '##E##']));

  it('walks one tile every 8 ticks and stops at a wall', () => {
    const s = startHeist(l, []);
    for (const i of go(RIGHT, 8)) step(s, l, i);
    expect([s.player.x, s.player.y]).toEqual([2 * UNIT, 1 * UNIT]);
    for (const i of go(RIGHT, 30)) step(s, l, i);
    expect(s.player.x).toBe(3 * UNIT);
  });

  it('finishes the tile it started when you let go', () => {
    const s = startHeist(l, []);
    for (const i of [...go(RIGHT, 2), ...go(-1, 20)]) step(s, l, i);
    expect(s.player.x).toBe(2 * UNIT);
  });

  it("won't leave through the exit with empty pockets", () => {
    const lv = buildLevel(room(['#####', '#...#', '#.@.#', '##E##']));
    const s = startHeist(lv, []);
    for (const i of go(DOWN, 20)) step(s, lv, i);
    expect(s.phase).toBe('play');
  });
});

describe('loot and getting out', () => {
  const l = buildLevel(room(['#####', '#c$B#', '#.@.#', '##E##']));

  it('picks up what it walks over and escapes with it, with a bonus for never being seen', () => {
    const s = startHeist(l, []);
    for (const i of [...go(UP, 8), ...go(LEFT, 8), ...go(DOWN, 8), ...go(RIGHT, 8), ...go(DOWN, 8)])
      step(s, l, i);
    expect(s.carried).toBe(60);
    expect(s.phase).toBe('escaped');
    expect(s.score).toBe(90);
    expect(s.swept).toBe(false);
  });

  it('pays +25% on top for cleaning the place out', () => {
    const lv = buildLevel(room(['#####', '#$$.#', '#.@.#', '##E##']));
    const s = startHeist(lv, []);
    for (const i of [...go(UP, 8), ...go(LEFT, 8), ...go(DOWN, 8), ...go(RIGHT, 8), ...go(DOWN, 8)])
      step(s, lv, i);
    expect(s.phase).toBe('escaped');
    expect(s.swept).toBe(true);
    // 100 carried, x1.5 never seen, +25% cleaned out.
    expect(s.score).toBe(187);
  });

  it('cracks a safe by pushing into it', () => {
    const lv = buildLevel(room(['#####', '#.S.#', '#.@.#', '##E##']));
    const s = startHeist(lv, []);
    for (const i of go(UP, 44)) step(s, lv, i);
    expect(s.safes[0]!.open).toBe(false);
    step(s, lv, { d: UP, p: -1 });
    expect(s.safes[0]!.open).toBe(true);
    expect(s.carried).toBe(100);
  });

  it('opening the safe trips a silent alarm: 20 seconds to get out', () => {
    const lv = buildLevel(room(['#####', '#.S.#', '#.@.#', '##E##']));
    const s = startHeist(lv, []);
    for (const i of go(UP, 45)) step(s, lv, i);
    // It starts counting the tick the safe opens.
    expect(s.lockdown).toBe(LOCKDOWN - 1);
    for (const i of go(-1, LOCKDOWN - 2)) step(s, lv, i);
    expect(s.phase).toBe('play');
    step(s, lv, IDLE);
    expect(s.phase).toBe('alarm');
    expect(s.alarmBy).toBe('lockdown');
  });

  it('cracks four times faster with a lockpick', () => {
    const lv = buildLevel(room(['#####', '#.S.#', '#.@.#', '##E##']));
    const s = startHeist(lv, ['lockpick']);
    for (const i of go(UP, 12)) step(s, lv, i);
    expect(s.safes[0]!.open).toBe(true);
  });
});

describe('guards', () => {
  const hall = (extra: Partial<VaultDef>) =>
    buildLevel(room(['#########', '#.......#', '#@......#', '#.......#', '####E####'], extra));

  it('sees you in front, not behind or through walls', () => {
    const l = hall({});
    // Facing east (angle 0) from tile 1,1.
    expect(inLight(l, UNIT, UNIT, 0, 4 * UNIT, UNIT, 5 * UNIT)).toBe(true);
    expect(inLight(l, 4 * UNIT, UNIT, 0, UNIT, UNIT, 5 * UNIT)).toBe(false);
    expect(inLight(l, UNIT, UNIT, 0, 7 * UNIT, UNIT, 5 * UNIT)).toBe(false);
    const walled = buildLevel(room(['#######', '#..#..#', '#@.#..#', '###E###']));
    expect(inLight(walled, UNIT, UNIT, 0, 5 * UNIT, UNIT, 5 * UNIT)).toBe(false);
  });

  it('raises the alarm when a light stays on you, then catches you', () => {
    const l = hall({ guards: [{ route: [[5, 2]], wait: 0 }] });
    const s = startHeist(l, []);
    // A guard turning on the spot will face west at some point.
    let alarm = false;
    for (let t = 0; t < 400 && !alarm; t++) alarm = step(s, l, IDLE).some((e) => e.t === 'alarm');
    expect(alarm).toBe(true);
    expect(s.phase).toBe('alarm');
    for (let t = 0; t < 200 && s.phase === 'alarm'; t++) step(s, l, IDLE);
    expect(s.phase).toBe('busted');
    expect(s.caughtBy).toBe(0);
  });

  it('a hidden Chog is not seen', () => {
    const l = hall({ guards: [{ route: [[4, 2]], wait: 0 }] });
    const s = startHeist(l, ['hide']);
    step(s, l, { d: -1, p: 0 });
    for (let t = 0; t < 80; t++) step(s, l, IDLE);
    expect(s.phase).toBe('play');
  });

  it('a tackle knocks a guard out instead of getting caught', () => {
    const l = hall({ guards: [{ route: [[3, 2]], wait: 0 }] });
    const s = startHeist(l, ['tackle']);
    step(s, l, { d: RIGHT, p: 0 });
    for (const i of go(RIGHT, 12)) step(s, l, i);
    expect(s.phase).not.toBe('busted');
    expect(s.guards[0]!.stun).toBeGreaterThan(0);
  });
});

describe('lasers and cameras', () => {
  it('a laser that is on raises the alarm; a hacked one does not', () => {
    const def = room(['#####', '#.c.#', '#.L.#', '#.@.#', '##E##'], {
      lasers: [{ across: true, on: 1000, off: 1, phase: 0 }],
    });
    const l = buildLevel(def);
    const s = startHeist(l, []);
    for (const i of go(UP, 10)) step(s, l, i);
    expect(s.phase).toBe('alarm');

    const h = startHeist(l, ['hack']);
    step(h, l, { d: -1, p: 0 });
    for (const i of go(UP, 10)) step(h, l, i);
    expect(h.phase).toBe('play');
  });
});

describe('replays', () => {
  it('the same inputs always give the same run', () => {
    const l = buildLevel(FIRST_VAULT);
    let seed = 7;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const inputs: Input[] = [];
    for (let i = 0; i < 1800; i++)
      inputs.push({
        d: rand() < 0.15 ? -1 : (Math.floor(rand() * 4) as Dir),
        p: rand() < 0.01 ? Math.floor(rand() * 2) : -1,
      });
    const powers = powersFor(['laser', 'stealth']);
    const a = replay(l, powers, inputs);
    const b = replay(l, powers, inputs);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(['escaped', 'busted']).toContain(a.phase);
  });

  it('a quick grab-and-go on the first vault gets out clean', () => {
    const l = buildLevel(FIRST_VAULT);
    const s = replay(l, [], [...go(UP, 16), ...go(DOWN, 16), ...go(DOWN, 8)]);
    expect(s.phase).toBe('escaped');
    expect(s.score).toBe(Math.floor(50 * 1.5));
  });
});
