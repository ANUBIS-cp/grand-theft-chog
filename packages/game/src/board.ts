import { DISTRICTS, DISTRICT_IDS, type DistrictId } from '@chog-city/data';
import { sha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import { HOT_JOB_PAY_BONUS } from './constants.ts';
import { JOBS, JOBS_BY_ID, type JobTemplate } from './jobs.ts';
import type { Ctx } from './types.ts';

export interface JobOffer {
  /** "jobId@district": what a Chog can do once a day. */
  key: string;
  job: JobTemplate;
  district: DistrictId;
  /** Pay today, with the hot-job bonus included. */
  pay: number;
  hot: boolean;
}

export function isDistrictOpen(district: DistrictId, events: Ctx['events']): boolean {
  return !DISTRICTS[district].eventOnly || events.has('halloween');
}

/** A public, predictable pick (not the secret day seed): everyone can see tomorrow's hot jobs coming. */
function publicPick(label: string, n: number): number {
  const h = sha256(utf8ToBytes(label));
  return (((h[0]! << 8) | h[1]!) >>> 0) % n;
}

/** The jobs posted in a district today. One non-legal job per district pays 50% more. */
export function boardFor(day: number, district: DistrictId, events: Ctx['events']): JobOffer[] {
  if (!isDistrictOpen(district, events)) return [];
  const jobs = JOBS.filter(
    (j) => (j.district === district || j.district === 'anywhere') && (!j.event || events.has(j.event)),
  );
  const hotCandidates = jobs.filter((j) => j.kind !== 'legal' && j.district === district);
  const hotId = hotCandidates.length
    ? hotCandidates[publicPick(`hot:${day}:${district}`, hotCandidates.length)]!.id
    : null;
  return jobs.map((job) => {
    const hot = job.id === hotId;
    return {
      key: `${job.id}@${district}`,
      job,
      district,
      hot,
      pay: Math.floor(job.pay * (hot ? 1 + HOT_JOB_PAY_BONUS : 1)),
    };
  });
}

export function fullBoard(day: number, events: Ctx['events']): JobOffer[] {
  return DISTRICT_IDS.flatMap((d) => boardFor(day, d, events));
}

export function findOffer(day: number, key: string, events: Ctx['events']): JobOffer | undefined {
  const [jobId, district] = key.split('@');
  if (
    !jobId ||
    !district ||
    !JOBS_BY_ID.has(jobId) ||
    !(DISTRICT_IDS as readonly string[]).includes(district)
  )
    return undefined;
  return boardFor(day, district as DistrictId, events).find((o) => o.key === key);
}
