import { buildLevel, type VaultDef } from './level.ts';

// Hand-made vaults. Legend: # wall, . floor, c coin, $ cash, B bag, S safe, D desk, O pillar, P plant,
// L laser, @ start, E exit.

export const FIRST_VAULT: VaultDef = {
  id: 'vault-1',
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
    { route: [[2, 13], [10, 13]], wait: 40 },
    // The ring around the offices.
    { route: [[1, 11], [11, 11], [11, 5], [1, 5]], wait: 20 },
    // Inside the vault, around the safe.
    { route: [[4, 1], [8, 1], [8, 3], [4, 3]], wait: 25 },
  ],
  // On the wall above the middle corridor, watching the vault door.
  cameras: [{ x: 6, y: 6, from: 38, to: 58 }],
  lasers: [{ across: true, on: 50, off: 40, phase: 0 }],
  safeValue: 400,
  seconds: 90,
};

export const VAULTS = [FIRST_VAULT];
export const firstLevel = () => buildLevel(FIRST_VAULT);
