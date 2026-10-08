import {
  ARREST_LINES,
  BAIL_LINES,
  DISTRICTS,
  GANGS,
  JOB_LINES,
  MISC_LINES,
  ROB_LINES,
  displayName,
  fill,
  getChog,
  line,
} from '@chog-city/data';
import type { GameEvent } from '@chog-city/game';

export const nameOf = (id: number) => {
  const c = getChog(id);
  return c ? displayName(c) : `Chog ${id}`;
};

/** "A", "A and B", "A, B and C". */
export function listNames(ids: number[]): string {
  const n = ids.map(nameOf);
  return n.length <= 1 ? (n[0] ?? '') : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;
}

export type Tone = 'good' | 'bad' | 'neutral';

/**
 * One plain sentence for an event, from the hand-written lines in packages/data/src/copy.ts.
 * `n` picks between line variants so the same event always reads the same.
 * Crew jobs produce one event per member; pass all member IDs as `crew` to name the whole crew.
 */
export function describe(e: GameEvent, n: number, crew?: number[]): { text: string; tone: Tone } {
  switch (e.type) {
    case 'job': {
      const lines = JOB_LINES[e.jobId];
      if (!lines) return { text: `${nameOf(e.chogId)} did a job.`, tone: 'neutral' };
      const text = fill(line(e.success ? lines.win : lines.lose, n), {
        chog: nameOf(e.chogId),
        crew: listNames(crew ?? [e.chogId]),
        pay: e.pay,
        district: DISTRICTS[e.district].name,
        target: '',
      });
      return { text, tone: e.success ? 'good' : 'bad' };
    }
    case 'rob': {
      const set = e.revenge
        ? e.success
          ? ROB_LINES.revengeWin
          : ROB_LINES.revengeLose
        : e.success
          ? ROB_LINES.win
          : ROB_LINES.lose;
      return {
        text: fill(line(set, n), { chog: nameOf(e.chogId), target: nameOf(e.target), loot: e.loot }),
        tone: e.success ? 'good' : 'bad',
      };
    }
    case 'arrest':
      return {
        text: fill(line(e.success ? ARREST_LINES.win : ARREST_LINES.lose, n), {
          chog: nameOf(e.chogId),
          target: nameOf(e.target),
          bounty: e.bounty,
          stars: Math.round(e.bounty / 15),
        }),
        tone: e.success ? 'good' : 'bad',
      };
    case 'bail': {
      const set =
        e.method === 'chog' ? BAIL_LINES.chog : e.chogId === e.target ? BAIL_LINES.self : BAIL_LINES.cash;
      return {
        text: fill(line(set, n), { chog: nameOf(e.chogId), target: nameOf(e.target), amount: e.cost }),
        tone: 'neutral',
      };
    }
    case 'gang':
      return {
        text: fill(line(MISC_LINES.joinedGang, n), { chog: nameOf(e.chogId), gang: GANGS[e.gang].name }),
        tone: 'neutral',
      };
    case 'level':
      return {
        text: fill(line(MISC_LINES.level, n), { chog: nameOf(e.chogId), level: e.level }),
        tone: 'good',
      };
  }
}
