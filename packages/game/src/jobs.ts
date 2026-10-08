import type { DistrictId, SkillId } from '@chog-city/data';

export type JobKind = 'legal' | 'solo' | 'crew' | 'big';

/** One crew slot: a Chog with any of these skills, or any Chog. */
export type Slot = { anyOf: SkillId[] } | 'any';

export interface JobTemplate {
  id: string;
  name: string;
  /** 'anywhere' jobs show on every district's board and count for the district they are done in. */
  district: DistrictId | 'anywhere';
  kind: JobKind;
  slots: Slot[];
  /** Skills that raise the odds when someone in the crew has them. */
  helps: SkillId[];
  baseOdds: number;
  /** Total pay on success. Crews split it evenly. */
  pay: number;
  /** Turf points for each member's gang on success. */
  turf: number;
  wantedOnSuccess: number;
  wantedOnFail: number;
  /** Chance (0-100) that each member goes to jail when the job fails. */
  jailChanceOnFail: number;
  minLevel: number;
  /** Jailbreak frees one jailed Chog instead of paying cash. */
  special?: 'jailbreak';
  /** Only on the board while the event runs. */
  event?: 'halloween';
}

const s = (...anyOf: SkillId[]): Slot => ({ anyOf });

const legal = (
  t: Pick<JobTemplate, 'id' | 'name' | 'district' | 'slots' | 'helps' | 'pay'>,
): JobTemplate => ({
  ...t,
  kind: 'legal',
  baseOdds: 95,
  turf: 1,
  wantedOnSuccess: -1,
  wantedOnFail: 0,
  jailChanceOnFail: 0,
  minLevel: 1,
});

const solo = (
  t: Pick<JobTemplate, 'id' | 'name' | 'district' | 'slots' | 'helps' | 'baseOdds' | 'pay'> &
    Partial<JobTemplate>,
): JobTemplate => ({
  kind: 'solo',
  turf: 2,
  wantedOnSuccess: 1,
  wantedOnFail: 1,
  jailChanceOnFail: 30,
  minLevel: 1,
  ...t,
});

const crew = (
  t: Pick<JobTemplate, 'id' | 'name' | 'district' | 'slots' | 'helps' | 'baseOdds' | 'pay'> &
    Partial<JobTemplate>,
): JobTemplate => ({
  kind: t.slots.length >= 5 ? 'big' : 'crew',
  turf: t.slots.length >= 5 ? 15 : 6,
  wantedOnSuccess: t.slots.length >= 5 ? 2 : 1,
  wantedOnFail: 2,
  jailChanceOnFail: t.slots.length >= 5 ? 60 : 50,
  minLevel: t.slots.length >= 5 ? 5 : 2,
  ...t,
});

export const JOBS: readonly JobTemplate[] = [
  // Mon Square: bank and exchange
  solo({
    id: 'skim-atm',
    name: 'Skim the ATM',
    district: 'mon-square',
    slots: [s('tech')],
    helps: ['stealth'],
    baseOdds: 70,
    pay: 40,
  }),
  solo({
    id: 'front-run',
    name: 'Front-run the exchange',
    district: 'mon-square',
    slots: [s('money')],
    helps: ['tech'],
    baseOdds: 65,
    pay: 50,
  }),
  crew({
    id: 'mon-vault',
    name: 'Crack the Mon Square vault',
    district: 'mon-square',
    slots: [s('laser'), s('tech'), s('stealth'), s('runner'), s('muscle')],
    helps: ['blade'],
    baseOdds: 45,
    pay: 1500,
  }),
  // Purple Hill: rich area
  solo({
    id: 'crash-gala',
    name: 'Crash the gala',
    district: 'purple-hill',
    slots: [s('smooth', 'royal')],
    helps: ['charm'],
    baseOdds: 70,
    pay: 45,
  }),
  crew({
    id: 'con-whale',
    name: 'Con a whale',
    district: 'purple-hill',
    slots: [s('smooth'), s('money')],
    helps: ['charm'],
    baseOdds: 60,
    pay: 260,
  }),
  crew({
    id: 'crown-jewels',
    name: 'Steal the crown jewels',
    district: 'purple-hill',
    slots: [s('royal'), s('stealth'), s('laser'), s('runner')],
    helps: ['tech'],
    baseOdds: 50,
    pay: 900,
    minLevel: 3,
  }),
  // Lemon Row: shops and the market
  solo({
    id: 'corner-store',
    name: 'Rob the corner store',
    district: 'lemon-row',
    slots: [s('muscle', 'blade')],
    helps: ['stealth'],
    baseOdds: 65,
    pay: 35,
  }),
  crew({
    id: 'shake-down',
    name: 'Shake down the market',
    district: 'lemon-row',
    slots: [s('muscle'), s('muscle'), s('smooth')],
    helps: ['blade'],
    baseOdds: 55,
    pay: 400,
  }),
  legal({
    id: 'market-stall',
    name: 'Run a market stall',
    district: 'lemon-row',
    slots: ['any'],
    helps: ['worker'],
    pay: 20,
  }),
  // Aqua Docks: smuggling
  solo({
    id: 'shady-boat',
    name: 'Unload a shady boat',
    district: 'aqua-docks',
    slots: [s('stealth')],
    helps: ['runner'],
    baseOdds: 65,
    pay: 40,
  }),
  crew({
    id: 'container',
    name: 'Smuggle a container',
    district: 'aqua-docks',
    slots: [s('stealth'), s('runner'), s('muscle')],
    helps: ['tech'],
    baseOdds: 55,
    pay: 450,
  }),
  legal({
    id: 'dock-work',
    name: 'Dock work',
    district: 'aqua-docks',
    slots: [s('worker')],
    helps: ['muscle'],
    pay: 25,
  }),
  // Pink Strip: nightlife and the casino
  solo({
    id: 'card-tables',
    name: 'Hustle the card tables',
    district: 'pink-strip',
    slots: [s('smooth', 'clown')],
    helps: ['charm'],
    baseOdds: 60,
    pay: 45,
  }),
  crew({
    id: 'party-tickets',
    name: 'Throw a party, sell the tickets twice',
    district: 'pink-strip',
    slots: [s('charm'), s('clown')],
    helps: ['money'],
    baseOdds: 65,
    pay: 220,
  }),
  crew({
    id: 'casino',
    name: 'Rob the casino',
    district: 'pink-strip',
    slots: [s('clown'), s('laser'), s('tech'), s('runner')],
    helps: ['stealth'],
    baseOdds: 50,
    pay: 1000,
    minLevel: 3,
  }),
  // Green Park: farms and potions
  legal({
    id: 'harvest',
    name: 'Harvest the farm',
    district: 'green-park',
    slots: ['any'],
    helps: ['worker'],
    pay: 20,
  }),
  solo({
    id: 'grow-illegal',
    name: 'Grow something illegal',
    district: 'green-park',
    slots: [s('worker', 'magic')],
    helps: ['stealth'],
    baseOdds: 65,
    pay: 40,
  }),
  crew({
    id: 'potions',
    name: 'Brew potions',
    district: 'green-park',
    slots: [s('magic'), s('worker')],
    helps: ['toxic'],
    baseOdds: 65,
    pay: 200,
  }),
  // Blue Heights: offices and tech
  solo({
    id: 'office-wifi',
    name: 'Hack the office wifi',
    district: 'blue-heights',
    slots: [s('tech')],
    helps: ['stealth'],
    baseOdds: 70,
    pay: 40,
  }),
  crew({
    id: 'launch-codes',
    name: 'Steal the launch codes',
    district: 'blue-heights',
    slots: [s('tech'), s('stealth'), s('smooth')],
    helps: ['laser'],
    baseOdds: 55,
    pay: 480,
  }),
  crew({
    id: 'pump-coin',
    name: 'Pump a memecoin',
    district: 'blue-heights',
    slots: [s('money'), s('clown'), s('charm')],
    helps: ['tech'],
    baseOdds: 55,
    pay: 450,
  }),
  // Anywhere
  crew({
    id: 'jailbreak',
    name: 'Jailbreak',
    district: 'anywhere',
    slots: [s('jailbird'), s('runner'), s('muscle')],
    helps: ['stealth'],
    baseOdds: 55,
    pay: 0,
    turf: 3,
    special: 'jailbreak',
  }),
  legal({
    id: 'guard-shift',
    name: 'Guard shift',
    district: 'anywhere',
    slots: [s('guard')],
    helps: ['muscle'],
    pay: 30,
  }),
  legal({
    id: 'clean-streets',
    name: 'Clean the streets',
    district: 'anywhere',
    slots: ['any'],
    helps: ['worker'],
    pay: 15,
  }),
  // Radioactive Zone: Halloween
  solo({
    id: 'haunt',
    name: 'Haunt Purple Hill',
    district: 'radioactive-zone',
    slots: [s('undead')],
    helps: ['magic'],
    baseOdds: 65,
    pay: 60,
    event: 'halloween',
  }),
  crew({
    id: 'toxic-barrels',
    name: 'Leak the toxic barrels',
    district: 'radioactive-zone',
    slots: [s('toxic'), s('runner')],
    helps: ['stealth'],
    baseOdds: 60,
    pay: 300,
    event: 'halloween',
  }),
  crew({
    id: 'summon',
    name: 'Summon something',
    district: 'radioactive-zone',
    slots: [s('magic'), s('undead'), s('toxic')],
    helps: ['royal'],
    baseOdds: 50,
    pay: 700,
    event: 'halloween',
  }),
];

export const JOBS_BY_ID: ReadonlyMap<string, JobTemplate> = new Map(JOBS.map((j) => [j.id, j]));
