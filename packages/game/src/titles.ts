import type { Stats } from './types.ts';

export interface Title {
  id: string;
  name: string;
  /** How it was earned, in plain words. */
  how: string;
}

const RULES: { title: Title; earned: (s: Stats) => boolean }[] = [
  { title: { id: 'vault', name: 'Vault Cracker', how: 'Pulled 3 big jobs' }, earned: (s) => s.bigJobs >= 3 },
  {
    title: { id: 'jailbreaker', name: 'Jailbreaker', how: 'Broke a Chog out of jail' },
    earned: (s) => s.jailbreaks >= 1,
  },
  {
    title: { id: 'untouchable', name: 'Untouchable', how: '20 jobs done and never arrested' },
    earned: (s) => s.jobsWon >= 20 && s.timesArrested === 0,
  },
  { title: { id: 'pickpocket', name: 'Pickpocket', how: 'Robbed 10 Chogs' }, earned: (s) => s.robWins >= 10 },
  { title: { id: 'lawman', name: 'Lawman', how: 'Made 5 arrests' }, earned: (s) => s.arrestsMade >= 5 },
  {
    title: { id: 'regular', name: 'Jail Regular', how: 'Arrested 5 times' },
    earned: (s) => s.timesArrested >= 5,
  },
  {
    title: { id: 'earner', name: 'Big Earner', how: 'Earned 5,000 cash' },
    earned: (s) => s.cashEarned >= 5000,
  },
  { title: { id: 'crew', name: 'Crew Player', how: 'Did 10 crew jobs' }, earned: (s) => s.crewJobs >= 10 },
];

/** Titles a Chog has earned, from its record. They stay with the NFT. */
export function titlesOf(stats: Stats): Title[] {
  return RULES.filter((r) => r.earned(stats)).map((r) => r.title);
}
