import { describe, expect, it } from 'vitest';
import { TRACK_MS, trackAt, trackFrame, trackLength, validTrack, type GetawayTrack } from './track.ts';

const t: GetawayTrack = {
  cops: [12, 40],
  frames: [
    trackFrame({ x: 1, y: 2 }, [
      { x: 5, y: 5 },
      { x: 9, y: 9 },
    ]),
    trackFrame({ x: 2, y: 2 }, [
      { x: 4, y: 5 },
      { x: 9, y: 8 },
    ]),
  ],
  outcome: 'caught',
  who: 'police',
  by: null,
};

describe('getaway track', () => {
  it('plays back between frames', () => {
    expect(trackLength(t)).toBe(TRACK_MS);
    const mid = trackAt(t, TRACK_MS / 2);
    expect(mid.me).toEqual({ x: 1.5, y: 2 });
    expect(mid.cops[0]).toEqual({ x: 4.5, y: 5 });
    expect(trackAt(t, 99_999).me).toEqual({ x: 2, y: 2 });
  });
  it('checks what a live server sent', () => {
    expect(validTrack(t)).toBe(true);
    expect(validTrack({ ...t, frames: [[1, 2, 3]] })).toBe(false);
    expect(validTrack({ ...t, frames: [[-1, 2, 3, 4, 5, 6]] })).toBe(false);
    expect(validTrack({ ...t, outcome: 'won' })).toBe(false);
    expect(validTrack(null)).toBe(false);
  });
});
