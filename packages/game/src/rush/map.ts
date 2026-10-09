// Cash Rush maps: a maze of corridors lined with coins, stacks of cash in the corners, a safe behind a laser
// gate, two loudspeakers that flip the chase, and the exit by the door you came in. Positions are in tiles;
// the middle of tile (x, y) is (x + 0.5, y + 0.5).
//
// Legend: # wall, . floor with a coin, , floor without one, $ stack of cash, S safe (solid; crack it from
// next to it), F loudspeaker (flips the chase), L laser gate, G where a guard starts, @ where you start,
// E the exit, D desk, O pillar (both solid, for looks).

import type { Room } from '../heist/level.ts';

export const Cell = { Floor: 0, Wall: 1, Safe: 2, Exit: 3, Desk: 4, Pillar: 5 } as const;
export type Cell = (typeof Cell)[keyof typeof Cell];

export interface RushMapDef {
  id: string;
  name: string;
  rows: string[];
  /** Floor looks, for drawing only (the rest is plain tile). */
  rooms?: Room[];
  /** Seconds on the clock. */
  seconds: number;
}

export interface RushMap {
  id: string;
  name: string;
  w: number;
  h: number;
  cells: Cell[];
  coins: { x: number; y: number }[];
  stacks: { x: number; y: number }[];
  flips: { x: number; y: number }[];
  lasers: { x: number; y: number; across: boolean }[];
  safe: { x: number; y: number } | null;
  /** Where guards start; their patrol corners are the four corners of the maze. */
  guards: { x: number; y: number }[];
  corners: { x: number; y: number }[];
  start: { x: number; y: number };
  exit: { x: number; y: number };
  seconds: number;
  rooms: Room[];
}

export function buildMap(def: RushMapDef): RushMap {
  const h = def.rows.length;
  const w = def.rows[0]!.length;
  const m: RushMap = {
    id: def.id,
    name: def.name,
    w,
    h,
    cells: [],
    coins: [],
    stacks: [],
    flips: [],
    lasers: [],
    safe: null,
    guards: [],
    corners: [],
    start: { x: 0, y: 0 },
    exit: { x: 0, y: 0 },
    seconds: def.seconds,
    rooms: def.rooms ?? [],
  };
  let start = false;
  let exit = false;
  def.rows.forEach((row, y) => {
    if (row.length !== w) throw new Error(`${def.id}: row ${y} is ${row.length} wide, not ${w}`);
    [...row].forEach((ch, x) => {
      const cell =
        ch === '#'
          ? Cell.Wall
          : ch === 'S'
            ? Cell.Safe
            : ch === 'E'
              ? Cell.Exit
              : ch === 'D'
                ? Cell.Desk
                : ch === 'O'
                  ? Cell.Pillar
                  : Cell.Floor;
      if (!'#.,$SFLG@EDO'.includes(ch)) throw new Error(`${def.id}: unknown "${ch}" at ${x},${y}`);
      m.cells.push(cell);
      if (ch === '.' || ch === 'G') m.coins.push({ x, y });
      if (ch === '$') m.stacks.push({ x, y });
      if (ch === 'F') m.flips.push({ x, y });
      if (ch === 'S') m.safe = { x, y };
      if (ch === 'G') m.guards.push({ x, y });
      if (ch === '@') {
        m.start = { x, y };
        start = true;
      }
      if (ch === 'E') {
        m.exit = { x, y };
        exit = true;
      }
    });
  });
  def.rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      // A gate's beam runs across its corridor: left-right in a corridor that goes up and down.
      if (ch === 'L') m.lasers.push({ x, y, across: !(open(m, x - 1, y) && open(m, x + 1, y)) });
    }),
  );
  if (!start || !exit) throw new Error(`${def.id}: needs a start (@) and an exit (E)`);
  // Patrol corners: the open tile nearest each corner of the maze.
  for (const [cx, cy] of [
    [0, 0],
    [w - 1, 0],
    [0, h - 1],
    [w - 1, h - 1],
  ] as const) {
    let best = { x: 1, y: 1 };
    let bd = Infinity;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (!open(m, x, y) || m.cells[y * w + x] === Cell.Exit) continue;
        const d = (x - cx) ** 2 + (y - cy) ** 2;
        if (d < bd) {
          bd = d;
          best = { x, y };
        }
      }
    m.corners.push(best);
  }
  return m;
}

export const cellAt = (m: RushMap, x: number, y: number): Cell =>
  x < 0 || y < 0 || x >= m.w || y >= m.h ? Cell.Wall : m.cells[y * m.w + x]!;

/** Can you walk on this tile? */
export const open = (m: RushMap, x: number, y: number) => {
  const c = cellAt(m, x, y);
  return c === Cell.Floor || c === Cell.Exit;
};

/** Walking distance in tiles from (x, y) to every tile (-1 where you can't get to). */
export function distanceMap(m: RushMap, x: number, y: number): Int16Array {
  const d = new Int16Array(m.w * m.h).fill(-1);
  if (!open(m, x, y)) return d;
  d[y * m.w + x] = 0;
  const q = [y * m.w + x];
  for (let i = 0; i < q.length; i++) {
    const c = q[i]!;
    const cx = c % m.w;
    const cy = (c - cx) / m.w;
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!open(m, nx, ny)) continue;
      const n = ny * m.w + nx;
      if (d[n] !== -1) continue;
      d[n] = d[c]! + 1;
      q.push(n);
    }
  }
  return d;
}

/** Up, right, down, left. */
export const DIRS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;
export type Dir = 0 | 1 | 2 | 3;

// The bank: a maze round a safe room at the top, behind a laser gate. Stacks in the four corners, a
// loudspeaker high on each side, and you come in at the bottom.
export const RUSH_BANK: RushMapDef = {
  id: 'rush-bank',
  name: 'The bank',
  seconds: 75,
  rooms: [
    { x: 8, y: 6, w: 3, h: 3, floor: 'gold' },
    { x: 1, y: 14, w: 17, h: 1, floor: 'carpet' },
    { x: 1, y: 4, w: 17, h: 1, floor: 'carpet' },
    { x: 1, y: 10, w: 17, h: 1, floor: 'carpet' },
  ],
  rows: [
    '###################',
    '#$.......#.......$#',
    '#.##.###.#.###.##.#',
    '#F##.###.#.###.##F#',
    '#........G........#',
    '#.##.#.#####.#.##.#',
    '#....#.#,S,#.#....#',
    '####.#.#,,,#.#.####',
    '#....#..,,,..#....#',
    '#.##.#.##L##.#.##.#',
    '#G.......G.......G#',
    '#.##.###.#.###.##.#',
    '#$.#.....#.....#.$#',
    '##.#.###.#.###.#.##',
    '#.......,@,.......#',
    '#########E#########',
  ],
};

// The casino: wider rooms with card tables to dodge round, the safe in the cashier's cage on the left.
export const RUSH_CASINO: RushMapDef = {
  id: 'rush-casino',
  name: 'The casino',
  seconds: 75,
  rooms: [
    { x: 3, y: 3, w: 3, h: 3, floor: 'gold' },
    { x: 13, y: 3, w: 3, h: 3, floor: 'carpet' },
    { x: 1, y: 7, w: 17, h: 1, floor: 'carpet' },
    { x: 5, y: 11, w: 9, h: 1, floor: 'carpet' },
  ],
  rows: [
    '###################',
    '#$.......G.......$#',
    '#.#####.###.#####.#',
    '#.#,,,#.....#.D.#.#',
    '#.#,S,L.#.#...,,#F#',
    '#.#,,,..#.#.#.D.#.#',
    '#.#####.#.#.#####.#',
    '#.......#G#.......#',
    '#.###.#.#.#.#.###.#',
    '#F..#.#.....#.#..$#',
    '###.#.###.###.#.###',
    '#G..#.........#..G#',
    '#.#.#.##.#.##.#.#.#',
    '#$#.....,@,.....#$#',
    '#########E#########',
  ],
};

/** The jail, for break-outs: the cell (the "safe") holds your gang-mate. Open it and get them out. */
export const RUSH_JAIL: RushMapDef = {
  id: 'rush-jail',
  name: 'The jail',
  seconds: 70,
  rooms: [
    { x: 9, y: 1, w: 1, h: 2, floor: 'steel' },
    { x: 1, y: 9, w: 17, h: 1, floor: 'steel' },
  ],
  rows: [
    '###################',
    '#.......#S#.......#',
    '#.#####.#,#.#####.#',
    '#.#...#.#L#.#...#.#',
    '#F#.#.#.....#.#.#F#',
    '#...#...#G#...#...#',
    '###.#####.#####.###',
    '#G......#.#......G#',
    '#.####.##.##.####.#',
    '#.................#',
    '#.##.#.#####.#.##.#',
    '#....#...G...#....#',
    '#.##.###.#.###.##.#',
    '#.......,@,.......#',
    '#########E#########',
  ],
};

export const RUSH_MAPS = [RUSH_BANK, RUSH_CASINO];
export const ALL_RUSH_MAPS = [...RUSH_MAPS, RUSH_JAIL];
export const rushMapDef = (id: string) => ALL_RUSH_MAPS.find((m) => m.id === id);
