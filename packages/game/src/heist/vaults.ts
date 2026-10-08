import { buildLevel, type VaultDef } from './level.ts';

// Hand-made vaults. Legend: # wall, . floor, c coin, $ cash, B bag, S safe, D desk, O pillar, P plant,
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
    '#$c#.c.c.#c$#',
    '#cc#..S..#cc#',
    '#Bc#c...c#cB#',
    '#c####L####c#',
    '#ccccc.ccccc#',
    '#c###c#c###c#',
    '#c#$c.#.c$#c#',
    '#c#.D.#.D.#c#',
    '#c#c..#..c#c#',
    '#c##.###.##c#',
    '#ccccc.ccccc#',
    '###c##.##c###',
    '#$.c.....c.$#',
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
    '#$c.c.S.c.c$#',
    '#c.........c#',
    '####L###L####',
    '#c..c...c..c#',
    '#.DD.c.c.DD.#',
    '#c..........#',
    '#..D.D.D.D..#',
    '#c....c....c#',
    '#.DD.....DD.#',
    '#c....$....c#',
    '##.###.###.##',
    '#c.c.....c.c#',
    '#.O...$...O.#',
    '#c.........c#',
    '#...O...O...#',
    '#$....c....$#',
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
  seconds: 90,
};

export const VAULTS = [FIRST_VAULT, CASINO];
export const vaultDef = (id: string) => VAULTS.find((v) => v.id === id);
export const firstLevel = () => buildLevel(FIRST_VAULT);
