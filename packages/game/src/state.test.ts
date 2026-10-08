import { describe, expect, it } from 'vitest';
import { HOUR, MOVES_PER_DAY } from './constants.ts';
import {
  addWanted,
  currentWanted,
  levelOf,
  movesLeft,
  newChogState,
  refresh,
  sendToJail,
  xpToNext,
} from './state.ts';
import { T0 } from './test-helpers.ts';
import { dayStart, dayOf } from './time.ts';

describe('state', () => {
  it('starts with 100 cash, level 1 and 5 moves', () => {
    const s = newChogState(7, T0);
    expect(s.cash).toBe(100);
    expect(levelOf(s.xp)).toBe(1);
    expect(movesLeft(s, T0)).toBe(MOVES_PER_DAY);
  });

  it('resets daily counters at the reset', () => {
    const s = { ...newChogState(1, T0), movesUsed: 5, timesRobbedToday: 3, doneToday: ['a@b'] };
    expect(movesLeft(s, T0)).toBe(0);
    const tomorrow = dayStart(dayOf(T0) + 1) + 1;
    const r = refresh(s, tomorrow);
    expect(r.movesUsed).toBe(0);
    expect(r.timesRobbedToday).toBe(0);
    expect(r.doneToday).toEqual([]);
    expect(movesLeft(s, tomorrow)).toBe(MOVES_PER_DAY);
  });

  it('wears off one star every 6 hours', () => {
    let s = addWanted(newChogState(1, T0), 5, T0);
    expect(currentWanted(s, T0)).toBe(5);
    expect(currentWanted(s, T0 + 13 * HOUR)).toBe(3);
    s = refresh(s, T0 + 13 * HOUR);
    expect(s.wanted).toBe(3);
    // the leftover hour still counts toward the next star
    expect(currentWanted(s, T0 + 18 * HOUR)).toBe(2);
    expect(currentWanted(s, T0 + 100 * HOUR)).toBe(0);
  });

  it('caps stars at 5 and never goes below 0', () => {
    expect(addWanted(newChogState(1, T0), 9, T0).wanted).toBe(5);
    expect(addWanted(newChogState(1, T0), -3, T0).wanted).toBe(0);
  });

  it('jails for 2 hours plus 1 per star and clears the stars', () => {
    const s = sendToJail(addWanted(newChogState(1, T0), 3, T0), T0);
    expect(s.jailUntil).toBe(T0 + 5 * HOUR);
    expect(s.wanted).toBe(0);
    expect(s.stats.jailHours).toBe(5);
    expect(refresh(s, T0 + 5 * HOUR).jailUntil).toBe(0);
  });

  it('levels up at the XP table', () => {
    expect(levelOf(29)).toBe(1);
    expect(levelOf(30)).toBe(2);
    expect(levelOf(1830)).toBe(10);
    expect(levelOf(99_999)).toBe(10);
    expect(xpToNext(25)).toBe(5);
    expect(xpToNext(5000)).toBe(0);
  });
});
