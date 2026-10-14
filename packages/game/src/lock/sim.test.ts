import { GANG_IDS } from '@chog-city/data';
import { describe, expect, it } from 'vitest';
import {
  DIAL,
  LEFT,
  LOCK_LIMIT,
  RIGHT,
  SPAN,
  TAP,
  WIRE,
  decodeLock,
  dialNumber,
  encodeLock,
  faceOf,
  lockFor,
  replayLock,
  showing,
  startLock,
  stepLock,
  type LockInput,
  type LockState,
} from './sim.ts';

/** A perfect player: taps exactly when it would land, and turns the dial the short way. */
function solve(s: LockState): LockInput[] {
  const inputs: LockInput[] = [];
  const peek = () => structuredClone(s);
  while (s.phase === 'play') {
    let i: LockInput = 0;
    if (s.kind === 'tumbler') {
      const t = peek();
      stepLock(t, 0);
      // Tap on the step the pin would be in the band after moving.
      const y = t.pins[s.done]!.y;
      if (Math.abs(y - SPAN / 2) <= 60) i = TAP;
    } else if (s.kind === 'wires') {
      if (showing(s) === null && s.tick % 6 === 0) i = WIRE(s.order[s.done]!);
    } else if (s.kind === 'reels') {
      const t = peek();
      stepLock(t, 0);
      const r = t.reels[s.done]!;
      if (faceOf(r.at) === s.target && Math.abs((r.at % SPAN) - 0) < 400) i = TAP;
    } else {
      const want = s.combo[s.done]!;
      const d = (want - dialNumber(s.dial) + DIAL) % DIAL;
      if (d !== 0) i = d <= DIAL / 2 ? RIGHT : LEFT;
    }
    inputs.push(i);
    stepLock(s, i);
  }
  return inputs;
}

describe('break-in locks', () => {
  it('every gang has a lock and all four kinds are used', () => {
    expect(new Set(GANG_IDS.map(lockFor)).size).toBe(4);
  });

  it('a careful player opens every gang lock quietly, in time', () => {
    for (const gang of GANG_IDS)
      for (let seed = 1; seed <= 25; seed++) {
        const s = startLock(gang, seed * 7919);
        const inputs = solve(s);
        expect(s.phase, `${gang} ${seed}`).toBe('open');
        expect(s.tick, `${gang} ${seed}`).toBeLessThan(LOCK_LIMIT);
        expect(replayLock(gang, seed * 7919, decodeLock(encodeLock(inputs))!).quiet).toBe(true);
      }
  });

  it('doing nothing forces the door, loudly', () => {
    for (const gang of GANG_IDS) {
      const r = replayLock(gang, 42, []);
      expect(r.state.phase).toBe('forced');
      expect(r.quiet).toBe(false);
    }
  });

  it('mashing is loud', () => {
    const r = replayLock('royals', 3, Array(LOCK_LIMIT).fill(TAP));
    expect(r.quiet).toBe(false);
  });

  it('a wrong wire starts the order again', () => {
    const s = startLock('lazoor', 9);
    while (showing(s) !== null) stepLock(s, 0);
    stepLock(s, 0);
    stepLock(s, WIRE(s.order[0]!));
    expect(s.done).toBe(1);
    const wrong = [0, 1, 2, 3, 4].find((w) => w !== s.order[1])!;
    stepLock(s, WIRE(wrong));
    expect(s.done).toBe(0);
    expect(s.slips).toBe(1);
  });

  it('same seed and inputs give the same result; another seed a different lock', () => {
    const a = startLock('btc-maxis', 5);
    const b = startLock('btc-maxis', 5);
    const c = startLock('btc-maxis', 6);
    expect(a).toEqual(b);
    expect(a.combo).not.toEqual(c.combo);
  });

  it('rejects junk input text', () => {
    expect(decodeLock('AAZ')).toBeNull();
    expect(decodeLock('A'.repeat(LOCK_LIMIT + 10))).toBeNull();
  });
});
