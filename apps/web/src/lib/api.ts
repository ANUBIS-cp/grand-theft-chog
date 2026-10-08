'use client';
import type { DistrictId, GangId } from '@chog-city/data';
import type { Crew, GameEvent, JobTemplate, MoveInput, TurfChange } from '@chog-city/game';
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
  NETWORK: 'Could not reach Chog City. Check your connection and try again.',
};

export function errorText(code: string): string {
  return ERROR_TEXT[code] ?? 'That move did not go through. Try again.';
}
