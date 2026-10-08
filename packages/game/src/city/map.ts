import { GANG_IDS, type GangId } from '@chog-city/data';

// The city you walk around in: a grid of blocks with roads between them. Each gang has a building on its own
// block; the middle column holds the jail, the plaza (where everyone arrives) and the training warehouse.
// Positions are in tiles (floats for people, integers for the grid). The same map is used by the browser to
// draw and move, and by the live server to check moves and walk the wandering Chogs.

export const Ground = {
  Road: 0,
  Walk: 1,
  Block: 2,
  Yard: 3,
  Plaza: 4,
  Grass: 5,
  Cross: 6,
  Prop: 7,
  /** The jail's fenced yard: you see in, you can't walk in. */
  Pen: 8,
} as const;
export type Ground = (typeof Ground)[keyof typeof Ground];

export type PlaceKind = 'gang' | 'jail' | 'plaza' | 'training';

export interface Place {
  id: string;
  kind: PlaceKind;
  gang?: GangId;
  /** The building's footprint on the ground, in tiles. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Where you stand to use the door: the middle of the tile in front of it. */
  door: { x: number; y: number };
}

export interface Prop {
  kind: 'lamp' | 'tree' | 'bench' | 'hydrant' | 'fountain' | 'screen';
  x: number;
  y: number;
}

export interface City {
  w: number;
  h: number;
  ground: Uint8Array;
  places: Place[];
  props: Prop[];
  spawn: { x: number; y: number };
}

export const COLS = 5;
export const ROWS = 4;
/** A block with its ring of pavement. */
export const BW = 12;
export const BH = 10;
export const ROAD = 3;

export const blockOrigin = (col: number, row: number) => ({
  x: ROAD + col * (BW + ROAD),
  y: ROAD + row * (BH + ROAD),
});

function build(): City {
  const w = COLS * BW + (COLS + 1) * ROAD;
  const h = ROWS * BH + (ROWS + 1) * ROAD;
  const ground = new Uint8Array(w * h).fill(Ground.Road);
  const set = (x: number, y: number, v: Ground) => {
    if (x >= 0 && y >= 0 && x < w && y < h) ground[y * w + x] = v;
  };
  const fill = (x: number, y: number, fw: number, fh: number, v: Ground) => {
    for (let j = y; j < y + fh; j++) for (let i = x; i < x + fw; i++) set(i, j, v);
  };
  const places: Place[] = [];
  const props: Prop[] = [];

  // Every block starts as pavement.
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const o = blockOrigin(c, r);
      fill(o.x, o.y, BW, BH, Ground.Walk);
    }

  // Zebra crossings across each road, in line with the pavements at every corner.
  for (let r = 0; r <= ROWS; r++)
    for (let c = 0; c <= COLS; c++) {
      const ix = c * (BW + ROAD);
      const iy = r * (BH + ROAD);
      // Across the vertical road, just above and below the junction.
      for (const dy of [-1, ROAD]) fill(ix, iy + dy, ROAD, 1, Ground.Cross);
      // Across the horizontal road, just left and right of it.
      for (const dx of [-1, ROAD]) fill(ix + dx, iy, 1, ROAD, Ground.Cross);
    }

  // Which block holds what: the middle column is shared, the other sixteen are the gangs'.
  const gangs = [...GANG_IDS];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const o = blockOrigin(c, r);
      if (c === 2) {
        if (r === 0) {
          // The jail: a low building with a fenced yard in front, where caught Chogs wait. The gate is on the street.
          const p: Place = {
            id: 'jail',
            kind: 'jail',
            x: o.x + 1,
            y: o.y + 1,
            w: 10,
            h: 5,
            door: { x: o.x + 6, y: o.y + 9.5 },
          };
          places.push(p);
          fill(p.x, p.y, p.w, p.h, Ground.Block);
          fill(o.x + 1, o.y + 6, 10, 3, Ground.Pen);
        } else if (r === 3) {
          const p: Place = {
            id: 'training',
            kind: 'training',
            x: o.x + 1,
            y: o.y + 1,
            w: 10,
            h: 5,
            door: { x: o.x + 6, y: o.y + 6.5 },
          };
          places.push(p);
          fill(p.x, p.y, p.w, p.h, Ground.Block);
          fill(o.x + 1, o.y + 6, 10, 3, Ground.Yard);
        } else {
          // Two plaza blocks with the road between them paved over.
          fill(o.x + 1, o.y + 1, BW - 2, BH - 2, Ground.Plaza);
          if (r === 1) {
            fill(o.x, o.y + BH, BW, ROAD, Ground.Plaza);
            fill(o.x + 1, o.y + BH - 1, BW - 2, 1, Ground.Plaza);
            const p2 = blockOrigin(2, 2);
            fill(p2.x + 1, p2.y, BW - 2, 1, Ground.Plaza);
          }
        }
        continue;
      }
      const gang = gangs.shift()!;
      const p: Place = {
        id: gang,
        kind: 'gang',
        gang,
        x: o.x + 1,
        y: o.y + 1,
        w: 10,
        h: 5,
        door: { x: o.x + 6, y: o.y + 6.5 },
      };
      places.push(p);
      fill(p.x, p.y, p.w, p.h, Ground.Block);
      fill(o.x + 1, o.y + 6, 10, 3, Ground.Yard);
      // A strip of grass each side of the front yard.
      fill(o.x + 1, o.y + 6, 2, 3, Ground.Grass);
      fill(o.x + 9, o.y + 6, 2, 3, Ground.Grass);
      props.push({ kind: 'tree', x: o.x + 1.5, y: o.y + 8.3 }, { kind: 'tree', x: o.x + 10.5, y: o.y + 8.3 });
    }

  // The plaza: a fountain in the middle, the big screen at the top, trees and benches round the edge.
  const top = blockOrigin(2, 1);
  const cx = top.x + BW / 2;
  const cy = top.y + BH + ROAD / 2;
  props.push({ kind: 'fountain', x: cx, y: cy + 0.5 });
  props.push({ kind: 'screen', x: cx, y: top.y + 2.2 });
  for (const [dx, dy] of [
    [-4, -2],
    [4, -2],
    [-4, 5],
    [4, 5],
  ] as const)
    props.push({ kind: 'tree', x: cx + dx, y: cy + dy });
  for (const [dx, dy] of [
    [-3.5, 1.5],
    [3.5, 1.5],
  ] as const)
    props.push({ kind: 'bench', x: cx + dx, y: cy + dy });

  // Street lamps down both sides of every block, a hydrant here and there.
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const o = blockOrigin(c, r);
      for (const [dx, dy] of [
        [0.5, 2.6],
        [BW - 0.5, 2.6],
        [0.5, BH - 2.4],
        [BW - 0.5, BH - 2.4],
      ] as const)
        if (ground[Math.floor(o.y + dy) * w + Math.floor(o.x + dx)] === Ground.Walk)
          props.push({ kind: 'lamp', x: o.x + dx, y: o.y + dy });
      if ((r + c) % 2 === 0 && c !== 2) props.push({ kind: 'hydrant', x: o.x + 3.5, y: o.y + BH - 0.5 });
    }

  // Props you can't walk through.
  for (const p of props)
    if (p.kind !== 'screen') {
      if (p.kind === 'fountain') fill(Math.floor(p.x) - 1, Math.floor(p.y) - 1, 2, 2, Ground.Prop);
      else set(Math.floor(p.x), Math.floor(p.y), Ground.Prop);
    }

  return { w, h, ground, places, props, spawn: { x: cx, y: cy + 3 } };
}

export const CITY: City = build();

export const groundAt = (x: number, y: number, c: City = CITY): Ground =>
  x < 0 || y < 0 || x >= c.w || y >= c.h ? Ground.Block : (c.ground[y * c.w + x] as Ground);

export const canWalk = (g: Ground) => g !== Ground.Block && g !== Ground.Prop && g !== Ground.Pen;

/** How wide a Chog is, as a radius in tiles. */
export const BODY = 0.3;

const free = (x: number, y: number, c: City) => canWalk(groundAt(Math.floor(x), Math.floor(y), c));
const clear = (x: number, y: number, c: City) =>
  free(x - BODY, y - BODY, c) &&
  free(x + BODY, y - BODY, c) &&
  free(x - BODY, y + BODY, c) &&
  free(x + BODY, y + BODY, c);

/** Moves (x, y) by (dx, dy) and slides along walls, one axis at a time. */
export function slide(
  x: number,
  y: number,
  dx: number,
  dy: number,
  c: City = CITY,
): { x: number; y: number } {
  let nx = x;
  let ny = y;
  if (dx && clear(x + dx, y, c)) nx = x + dx;
  if (dy && clear(nx, y + dy, c)) ny = y + dy;
  return { x: nx, y: ny };
}

export const standable = (x: number, y: number, c: City = CITY) => clear(x, y, c);

/** Shortest walk between two tiles (4 directions), as tile centres, or null. Skips the start tile. */
export function route(
  fx: number,
  fy: number,
  tx: number,
  ty: number,
  c: City = CITY,
): { x: number; y: number }[] | null {
  const sx = Math.floor(fx);
  const sy = Math.floor(fy);
  const gx = Math.floor(tx);
  const gy = Math.floor(ty);
  if (!canWalk(groundAt(gx, gy, c))) return null;
  const from = new Int32Array(c.w * c.h).fill(-1);
  const start = sy * c.w + sx;
  const goal = gy * c.w + gx;
  from[start] = start;
  const queue = [start];
  for (let i = 0; i < queue.length && from[goal] === -1; i++) {
    const cur = queue[i]!;
    const x = cur % c.w;
    const y = (cur - x) / c.w;
    for (const [ddx, ddy] of [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ] as const) {
      const nx = x + ddx;
      const ny = y + ddy;
      const n = ny * c.w + nx;
      if (nx < 0 || ny < 0 || nx >= c.w || ny >= c.h || from[n] !== -1 || !canWalk(c.ground[n] as Ground))
        continue;
      from[n] = cur;
      queue.push(n);
    }
  }
  if (from[goal] === -1) return null;
  const out: { x: number; y: number }[] = [];
  for (let n = goal; n !== start; n = from[n]!)
    out.push({ x: (n % c.w) + 0.5, y: Math.floor(n / c.w) + 0.5 });
  return out.reverse();
}

/** Drops waypoints that a straight walk can skip, so a route looks like a person walking, not a rook. */
export function smooth(from: { x: number; y: number }, path: { x: number; y: number }[], c: City = CITY) {
  const out: { x: number; y: number }[] = [];
  let at = from;
  let i = 0;
  while (i < path.length) {
    let j = path.length - 1;
    while (j > i && !straight(at, path[j]!, c)) j--;
    out.push(path[j]!);
    at = path[j]!;
    i = j + 1;
  }
  return out;
}

function straight(a: { x: number; y: number }, b: { x: number; y: number }, c: City) {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.ceil(d / 0.25);
  for (let k = 1; k <= n; k++) {
    const t = k / n;
    if (!clear(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, c)) return false;
  }
  return true;
}

export const placeOf = (id: string, c: City = CITY) => c.places.find((p) => p.id === id);

/** The door you are standing at, if any. */
export function doorAt(x: number, y: number, c: City = CITY): Place | undefined {
  return c.places.find((p) => Math.abs(p.door.x - x) < 1.6 && Math.abs(p.door.y - y) < 1.3);
}
