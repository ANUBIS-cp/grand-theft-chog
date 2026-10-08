import { DISTRICT_IDS } from '@chog-city/data';
import { describe, expect, it } from 'vitest';
import { boardFor, findOffer, fullBoard } from './board.ts';
import { JOBS } from './jobs.ts';

const none = new Set<'halloween'>();
const halloween = new Set<'halloween'>(['halloween']);

describe('job board', () => {
  it('posts jobs in every open district, with the anywhere jobs on each board', () => {
    for (const d of DISTRICT_IDS.filter((x) => x !== 'radioactive-zone')) {
      const b = boardFor(100, d, none);
      expect(b.length).toBeGreaterThanOrEqual(5);
      expect(b.some((o) => o.job.id === 'clean-streets')).toBe(true);
      expect(b.some((o) => o.job.id === 'jailbreak')).toBe(true);
    }
  });

  it('keeps the Radioactive Zone and Halloween jobs closed until the event', () => {
    expect(boardFor(100, 'radioactive-zone', none)).toEqual([]);
    expect(fullBoard(100, none).some((o) => o.job.event)).toBe(false);
    expect(boardFor(100, 'radioactive-zone', halloween).some((o) => o.job.id === 'summon')).toBe(true);
  });

  it('has exactly one hot job per district, paying 50% more, the same for everyone that day', () => {
    for (const d of DISTRICT_IDS.filter((x) => x !== 'radioactive-zone')) {
      const b = boardFor(100, d, none);
      const hot = b.filter((o) => o.hot);
      expect(hot).toHaveLength(1);
      expect(hot[0]!.job.kind).not.toBe('legal');
      expect(hot[0]!.pay).toBe(Math.floor(hot[0]!.job.pay * 1.5));
      expect(boardFor(100, d, none)).toEqual(b);
    }
  });

  it('changes the hot jobs from day to day', () => {
    const hotOn = (day: number) =>
      fullBoard(day, none)
        .filter((o) => o.hot)
        .map((o) => o.key)
        .join();
    const days = new Set(Array.from({ length: 20 }, (_, i) => hotOn(100 + i)));
    expect(days.size).toBeGreaterThan(5);
  });

  it('finds offers by key and rejects junk', () => {
    expect(findOffer(100, 'skim-atm@mon-square', none)?.job.name).toBe('Skim the ATM');
    expect(findOffer(100, 'clean-streets@aqua-docks', none)?.district).toBe('aqua-docks');
    expect(findOffer(100, 'skim-atm@aqua-docks', none)).toBeUndefined();
    expect(findOffer(100, 'nope', none)).toBeUndefined();
    expect(findOffer(100, 'haunt@radioactive-zone', none)).toBeUndefined();
  });

  it('has unique job ids and sane numbers', () => {
    expect(new Set(JOBS.map((j) => j.id)).size).toBe(JOBS.length);
    for (const j of JOBS) {
      expect(j.baseOdds).toBeGreaterThan(0);
      expect(j.baseOdds).toBeLessThanOrEqual(95);
      expect(j.slots.length).toBeGreaterThan(0);
      if (j.kind === 'solo' || j.kind === 'legal') expect(j.slots).toHaveLength(1);
    }
  });
});
