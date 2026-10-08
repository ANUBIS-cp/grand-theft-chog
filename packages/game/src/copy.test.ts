import { JOB_LINES } from '@chog-city/data';
import { describe, expect, it } from 'vitest';
import { JOBS } from './jobs.ts';

describe('game text', () => {
  it('has a win and a lose line for every job', () => {
    for (const j of JOBS) {
      expect(JOB_LINES[j.id]?.win.length, j.id).toBeGreaterThan(0);
      expect(JOB_LINES[j.id]?.lose.length, j.id).toBeGreaterThan(0);
    }
  });
});
