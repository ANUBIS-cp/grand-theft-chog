import { SAFE_BY_TIER, buildLevel, type VaultDef } from './level.ts';

// Hand-made vaults. A few stacks of cash on the floor, the big money in the safe. Legend: # wall, . floor, c coin, $ cash, B bag, S safe, D desk, O pillar, P plant,
// L laser, @ start, E exit.

export const FIRST_VAULT: VaultDef = {
  id: 'vault-1',
  name: 'The bank',
  rooms: [
    { x: 4, y: 1, w: 5, h: 3, floor: 'gold' },
    { x: 1, y: 1, w: 2, h: 3, floor: 'steel' },
    { x: 10, y: 1, w: 2, h: 3, floor: 'steel' },
    { x: 3, y: 7, w: 3, h: 3, floor: 'wood' },
    { x: 7, y: 7, w: 3, h: 3, floor: 'wood' },
    { x: 1, y: 13, w: 11, h: 5, floor: 'carpet' },
  ],
  rows: [
    '#############',
    '#$.#.....#.$#',
    '#..#..S..#..#',
    '#B.#.....#.B#',
    '#.####L####.#',
    '#...........#',
    '#.###.#.###.#',
    '#.#$..#..$#.#',
    '#.#.D.#.D.#.#',
    '#.#...#...#.#',
    '#.##.###.##.#',
    '#.....$.....#',
    '###.##.##.###',
    '#$.........$#',
    '#..O.....O..#',
    '#.....$.....#',
    '#..O.....O..#',
    '#P....@....P#',
    '######E######',
  ],
  guards: [
    // Lobby: walks the top of the room, in front of the three doors.
    {
      route: [
        [2, 13],
        [10, 13],
      ],
      wait: 40,
    },
    // The ring around the offices.
    {
      route: [
        [1, 11],
        [11, 11],
        [11, 5],
        [1, 5],
      ],
      wait: 20,
    },
    // Inside the vault, around the safe.
    {
      route: [
        [4, 1],
        [8, 1],
        [8, 3],
        [4, 3],
      ],
      wait: 25,
      tier: 1,
    },
    // Richer vaults: a second lobby guard on the bottom row, then a third on the ring the other way.
    {
      route: [
        [1, 15],
        [11, 15],
      ],
      wait: 30,
      tier: 2,
    },
    {
      route: [
        [11, 5],
        [1, 5],
        [1, 11],
        [11, 11],
      ],
      wait: 20,
      tier: 3,
    },
  ],
  // On the wall above the middle corridor, watching the vault door; then one over the lobby.
  cameras: [
    { x: 6, y: 6, from: 38, to: 58, tier: 1 },
    { x: 5, y: 12, from: 8, to: 24, tier: 3 },
  ],
  lasers: [{ across: true, on: 50, off: 40, phase: 0 }],
  safeValue: 400,
  safeByTier: SAFE_BY_TIER,
  seconds: 90,
};

/** A casino floor: card tables to hide behind, a top room behind two lasers that take turns. */
export const CASINO: VaultDef = {
  id: 'casino',
  name: 'The casino',
  rooms: [
    { x: 1, y: 1, w: 11, h: 2, floor: 'gold' },
    { x: 1, y: 4, w: 11, h: 7, floor: 'carpet' },
    { x: 1, y: 12, w: 11, h: 6, floor: 'tile' },
  ],
  rows: [
    '#############',
    '#B....S....B#',
    '#...........#',
    '####L###L####',
    '#$.........$#',
    '#.DD.....DD.#',
    '#...........#',
    '#..D.D.D.D..#',
    '#.....$.....#',
    '#.DD.....DD.#',
    '#...........#',
    '##.###.###.##',
    '#...........#',
    '#.O...$...O.#',
    '#...........#',
    '#...O...O...#',
    '#$.........$#',
    '#P....@....P#',
    '######E######',
  ],
  guards: [
    // Around the edge of the casino floor.
    {
      route: [
        [1, 4],
        [11, 4],
        [11, 10],
        [1, 10],
      ],
      wait: 25,
    },
    // Up and down the middle aisle.
    {
      route: [
        [6, 4],
        [6, 10],
      ],
      wait: 35,
    },
    // The top room, wall to wall.
    {
      route: [
        [1, 2],
        [11, 2],
      ],
      wait: 30,
      tier: 1,
    },
    // The entrance hall.
    {
      route: [
        [1, 14],
        [11, 14],
      ],
      wait: 40,
      tier: 2,
    },
    {
      route: [
        [1, 12],
        [11, 12],
      ],
      wait: 30,
      tier: 3,
    },
  ],
  cameras: [
    { x: 3, y: 11, from: 8, to: 24, tier: 1 },
    { x: 6, y: 3, from: 10, to: 22, tier: 2 },
  ],
  // The two doors to the top room take turns.
  lasers: [
    { across: true, on: 45, off: 45, phase: 0 },
    { across: true, on: 45, off: 45, phase: 45 },
  ],
  safeValue: 400,
  safeByTier: SAFE_BY_TIER,
  seconds: 90,
};

/**
 * The city jail, for break-outs: no cash, just a locked cell at the top with your gang-mate in it. Crack the
 * lock (the safe) and get them out the way you came in.
 */
export const JAIL: VaultDef = {
  id: 'jail',
  name: 'The jail',
  rooms: [
    { x: 1, y: 1, w: 11, h: 2, floor: 'steel' },
    { x: 1, y: 4, w: 11, h: 3, floor: 'tile' },
    { x: 1, y: 8, w: 4, h: 3, floor: 'wood' },
    { x: 8, y: 8, w: 4, h: 3, floor: 'wood' },
    { x: 1, y: 12, w: 11, h: 6, floor: 'steel' },
  ],
  rows: [
    '#############',
    '#...#.S.#...#',
    '#...#...#...#',
    '##.###L###.##',
    '#...........#',
    '#.O.O...O.O.#',
    '#...........#',
    '####.###.####',
    '#....###....#',
    '#.D..###..D.#',
    '#....###....#',
    '##.#######.##',
    '#...........#',
    '#..O.....O..#',
    '#...........#',
    '#...........#',
    '#..O.....O..#',
    '#P....@....P#',
    '######E######',
  ],
  guards: [
    // The yard, wall to wall.
    {
      route: [
        [1, 12],
        [11, 12],
      ],
      wait: 30,
    },
    // The cell-block corridor.
    {
      route: [
        [1, 4],
        [11, 4],
      ],
      wait: 25,
    },
    // The left guard room.
    {
      route: [
        [1, 8],
        [4, 8],
        [4, 10],
        [1, 10],
      ],
      wait: 20,
    },
    // The right guard room, and a guard by the cell.
    {
      route: [
        [8, 8],
        [11, 8],
        [11, 10],
        [8, 10],
      ],
      wait: 20,
      tier: 1,
    },
    {
      route: [
        [5, 2],
        [7, 2],
      ],
      wait: 30,
      tier: 2,
    },
  ],
  // Over the corridor, watching the cell-block door.
  cameras: [{ x: 6, y: 7, from: 40, to: 56 }],
  lasers: [{ across: true, on: 50, off: 40, phase: 0 }],
  safeValue: 1,
  seconds: 75,
};

export const VAULTS = [FIRST_VAULT, CASINO];
/** Every layout a run can use, the jail included. */
export const ALL_VAULTS = [...VAULTS, JAIL];
export const vaultDef = (id: string) => ALL_VAULTS.find((v) => v.id === id);
export const firstLevel = () => buildLevel(FIRST_VAULT);
