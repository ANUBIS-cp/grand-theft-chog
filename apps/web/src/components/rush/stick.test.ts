import { open, rushMap, rushRules, startRush, stepRush, type RushState } from '@chog-city/game/rush';
import { describe, expect, it } from 'vitest';
import { readStick, stickPick, type Dir, type StickState } from './stick';

const ring = (): StickState => ({ cx: 0, cy: 0, held: [] });
/** The thumb at `deg` degrees (0 = right, 90 = down) and `r` px out. */
const thumb = (l: StickState, deg: number, r = 40) =>
  readStick(l, Math.cos((deg * Math.PI) / 180) * r, Math.sin((deg * Math.PI) / 180) * r);

describe('the phone stick', () => {
  it('reads straight pushes as one way', () => {
    expect(thumb(ring(), 0)).toEqual([1]);
    expect(thumb(ring(), 90)).toEqual([2]);
    expect(thumb(ring(), 180)).toEqual([3]);
    expect(thumb(ring(), 270)).toEqual([0]);
  });
  it('reads a diagonal as both ways, the stronger first', () => {
    expect(thumb(ring(), 60)).toEqual([2, 1]);
    expect(thumb(ring(), 120)).toEqual([2, 3]);
    expect(thumb(ring(), 210)).toEqual([3, 0]);
  });
  it("a thumb pushing roughly down always holds down, whatever it held before", () => {
    const l = ring();
    expect(thumb(l, 180)).toEqual([3]);
    for (let deg = 180; deg >= 100; deg -= 4) thumb(l, deg);
    expect(l.held).toContain(2);
  });
  it('a small wobble does nothing; back to the middle stops', () => {
    const l = ring();
    expect(readStick(l, 7, 4)).toEqual([]);
    expect(readStick(l, 0, -30)).toEqual([0]);
    expect(readStick(l, 2, -3)).toEqual([]);
  });
  it('the ring follows a thumb that goes far past it, so turning back is quick', () => {
    const l = ring();
    expect(readStick(l, 150, 0)).toEqual([1]);
    expect(readStick(l, 70, 0)).toEqual([3]);
  });
});

describe('steering the vault with it', () => {
  const m = rushMap('rush-bank')!;
  const rules = rushRules(1, false, false);
  // Row 14 runs along the bottom; the exit is under x = 9, and nothing else opens downward from row 14.
  const run = (s: RushState, held: () => Dir[], ticks: number) => {
    for (let i = 0; i < ticks && s.phase === 'play'; i++)
      stepRush(s, m, rules, { d: stickPick(m, s, held()), use: false, p: -1 });
  };
  const fresh = (x: number) => {
    const s = startRush(m, rules, [], 1);
    s.guards = [];
    s.carried = 5;
    s.me.x = x;
    s.me.y = 14.5;
    return s;
  };

  it('running left and pushing down-left takes the exit', () => {
    const s = fresh(13.5);
    const l = ring();
    run(s, () => thumb(l, 180), 6);
    run(s, () => thumb(l, 125), 40);
    expect(s.phase).toBe('escaped');
  });
  it('running right and pushing down-right takes the exit', () => {
    const s = fresh(5.5);
    const l = ring();
    run(s, () => thumb(l, 0), 6);
    run(s, () => thumb(l, 60), 40);
    expect(s.phase).toBe('escaped');
  });
  it('ran past it: pushing down-and-back goes back and takes it', () => {
    const s = fresh(9.5);
    const l = ring();
    run(s, () => thumb(l, 180), 12);
    expect(s.me.x).toBeLessThan(8);
    run(s, () => thumb(l, 60), 60);
    expect(s.phase).toBe('escaped');
  });
  it('straight down early, like Pac-Man: keeps going and turns at the opening', () => {
    const s = fresh(13.5);
    const l = ring();
    run(s, () => thumb(l, 180), 6);
    run(s, () => thumb(l, 90), 40);
    expect(s.phase).toBe('escaped');
  });
});

describe('never shakes back and forth', () => {
  it('from every open tile, holding any of the 8 ways, it never shakes between two ways', () => {
    for (const id of ['rush-bank', 'rush-casino']) {
      const m = rushMap(id)!;
      const rules = rushRules(1, false, false);
      let bad = 0;
      let runs = 0;
      for (let y = 0; y < m.h; y++)
        for (let x = 0; x < m.w; x++) {
          if (!open(m, x, y)) continue;
          for (let deg = 0; deg < 360; deg += 45) {
            const s = startRush(m, rules, [], 1);
            s.guards = [];
            s.carried = 0;
            s.me.x = x + 0.5;
            s.me.y = y + 0.5;
            const l = ring();
            // Each change of way, and where it happened.
            const turns: { d: number; i: number }[] = [];
            for (let i = 0; i < 90 && s.phase === 'play'; i++) {
              stepRush(s, m, rules, { d: stickPick(m, s, thumb(l, deg)), use: false, p: -1 });
              if (s.me.dir !== -1 && s.me.dir !== turns.at(-1)?.d) turns.push({ d: s.me.dir, i });
            }
            runs++;
            // A shake: going A, then B, then A again within 8 steps (a quarter of a second). Turning at each
            // corner of a staircase-shaped path, or into the exit, is what holding a diagonal should do.
            for (let i = 2; i < turns.length; i++) {
              const [a, c] = [turns[i - 2]!, turns[i]!];
              if (a.d === c.d && c.i - a.i <= 8) {
                bad++;
                break;
              }
            }
          }
        }
      expect({ id, bad, runs }).toEqual({ id, bad: 0, runs });
    }
  });
});
