'use client';
import type { DistrictId, GangId, SkillId } from '@chog-city/data';
import type { Crew, GameEvent, JobTemplate, MoveInput, Scores, TurfChange } from '@chog-city/game';
import type { ChogView } from './views';

export interface Board {
  day: number;
  now: number;
  nextReset: number;
  holders: Partial<Record<DistrictId, GangId>>;
  changes: TurfChange[];
  commitment: string;
  offers: { key: string; district: DistrictId; pay: number; hot: boolean; job: JobTemplate }[];
}

export interface MeChog extends ChogView {
  owner: string;
  delegated: boolean;
}

export interface FeedItem {
  id: number;
  at: number;
  event: GameEvent;
}

export interface TargetRow {
  id: number;
  cash: number;
  wanted: number;
  active: boolean;
  gang: GangId | null;
  jailUntil: number;
  robbedToday: number;
}

export interface GangRow {
  gang: GangId;
  members: number;
  holds: DistrictId[];
  pointsToday: number;
  districtDays: number;
}

export interface Recap {
  day: number;
  jobs: number;
  jobsWon: number;
  robberies: number;
  arrests: number;
  jailed: number;
  biggestJob: FeedItem | null;
  mostRobbed: { id: number; times: number } | null;
  topEarner: { id: number; cash: number } | null;
  changes: { district: DistrictId; from: GangId | null; to: GangId | null }[];
}

export type MoveResponse =
  { ok: true; events: FeedItem[]; chogs: ChogView[]; crew: Crew | null } | { ok: false; error: string };

async function get<T>(path: string): Promise<T> {
  const r = await fetch(path, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return (await r.json()) as T;
}

export const api = {
  me: () => get<{ address: string | null; chogs: MeChog[] }>('/api/me'),
  board: () => get<Board>('/api/board'),
  feed: () => get<{ events: FeedItem[] }>('/api/feed'),
  chog: (id: number) => get<{ chog: ChogView; owner: string | null; events: FeedItem[] }>(`/api/chog/${id}`),
  turf: () =>
    get<{ day: number; scores: Scores; holders: Partial<Record<DistrictId, GangId>>; nextReset: number }>(
      '/api/turf',
    ),
  targets: (kind: 'rob' | 'arrest' | 'jailed') => get<{ targets: TargetRow[] }>(`/api/targets?kind=${kind}`),
  finder: (skill: SkillId) =>
    get<{ chogs: (TargetRow & { lastSeen: number })[] }>(`/api/finder?skill=${skill}`),
  gangs: () => get<{ gangs: GangRow[] }>('/api/gangs'),
  recap: (day?: number) => get<Recap>(day === undefined ? '/api/recap' : `/api/recap?day=${day}`),
  inbox: () => get<{ items: FeedItem[] }>('/api/inbox'),
  crews: () => get<{ open: Crew[]; mine: Crew[] }>('/api/crews'),
  crew: (id: string) => get<{ crew: Crew }>(`/api/crew/${id}`),
  async move(input: MoveInput): Promise<MoveResponse> {
    const r = await fetch('/api/move', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    const body = (await r.json().catch(() => null)) as MoveResponse | null;
    return body ?? { ok: false, error: r.status === 429 ? 'SLOW_DOWN' : 'NETWORK' };
  },
};

/** Plain-words text for every error a move can return. */
export const ERROR_TEXT: Record<string, string> = {
  IN_JAIL: 'Your Chog is in jail. Wait it out or pay bail.',
  NO_MOVES: 'No moves left today. They refill at 18:00 UTC.',
  LEVEL_TOO_LOW: 'Your Chog needs a higher level for this job.',
  MISSING_SKILL: "Your Chog doesn't have the skill this job needs.",
  DONE_TODAY: 'Your Chog already did this job today.',
  DISTRICT_CLOSED: 'This district is closed right now.',
  UNKNOWN_JOB: "That job isn't on today's board any more. The board changes at 18:00 UTC.",
  NOT_YOUR_CHOG: "That Chog isn't in your wallet.",
  NOT_LOGGED_IN: 'You are logged out. Log in again.',
  SLOW_DOWN: 'Too many moves at once. Wait a second and try again.',
  GANG_NOT_ALLOWED: "Your Chog's traits don't allow that gang.",
  GANG_COOLDOWN: 'You can switch gang once every 7 days.',
  TARGET_IN_JAIL: "That Chog is in jail. You can't rob someone in jail.",
  TARGET_ROBBED_OUT: 'That Chog has been robbed enough today. Pick someone else.',
  SAME_OWNER: "You can't rob or arrest your own Chogs.",
  SELF: "A Chog can't do that to itself.",
  NOT_A_GUARD: 'Only Chogs with the Guard skill can arrest.',
  TARGET_NOT_WANTED: 'You can only arrest Chogs with 3 or more Wanted stars.',
  NOT_IN_JAIL: "That Chog isn't in jail any more.",
  NOT_ENOUGH_CASH: "Your Chog doesn't have enough cash for that.",
  IN_A_CREW: 'Your Chog is already in a crew. Finish or leave that one first.',
  CREW_NOT_OPEN: 'That crew is closed: it already ran, or it was from yesterday.',
  SLOT_TAKEN: 'Someone just took that slot. Pick another one.',
  NOT_IN_CREW: "Your Chog isn't in that crew.",
  UNKNOWN_CREW: "That crew doesn't exist.",
  BAD_TARGET: "That target doesn't work for this move.",
  WRONG_JOB_TYPE: 'That job needs a crew.',
  NETWORK: 'Could not reach Chog City. Check your connection and try again.',
};

export function errorText(code: string): string {
  return ERROR_TEXT[code] ?? 'That move did not go through. Try again.';
}
