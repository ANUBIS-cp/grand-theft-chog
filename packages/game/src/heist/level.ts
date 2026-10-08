// A vault: the map, the loot and the people guarding it. Everything is in whole tiles here; the
// simulation works in sub-tile units (UNIT per tile) so it stays integer-only and replays exactly.

export const UNIT = 24;
export const TPS = 30;

export type Dir = 0 | 1 | 2 | 3; // up, right, down, left
export const DX = [0, 1, 0, -1] as const;
export const DY = [-1, 0, 1, 0] as const;
/** Angle index (0..63, clockwise from east) of each Dir. */
export const DIR_ANGLE = [48, 0, 16, 32] as const;

/** cos/sin * 1024 for 64 directions, clockwise from east. Literal so every engine gets the same numbers. */
// prettier-ignore
export const ANGLES: readonly (readonly [number, number])[] = [[1024,0],[1019,100],[1004,200],[980,297],[946,392],[903,483],[851,569],[792,650],[724,724],[650,792],[569,851],[483,903],[392,946],[297,980],[200,1004],[100,1019],[0,1024],[-100,1019],[-200,1004],[-297,980],[-392,946],[-483,903],[-569,851],[-650,792],[-724,724],[-792,650],[-851,569],[-903,483],[-946,392],[-980,297],[-1004,200],[-1019,100],[-1024,0],[-1019,-100],[-1004,-200],[-980,-297],[-946,-392],[-903,-483],[-851,-569],[-792,-650],[-724,-724],[-650,-792],[-569,-851],[-483,-903],[-392,-946],[-297,-980],[-200,-1004],[-100,-1019],[0,-1024],[100,-1019],[200,-1004],[297,-980],[392,-946],[483,-903],[569,-851],[650,-792],[724,-724],[792,-650],[851,-569],[903,-483],[946,-392],[980,-297],[1004,-200],[1019,-100]];

export const Tile = { Floor: 0, Wall: 1, Desk: 2, Pillar: 3, Safe: 4, Exit: 5, Plant: 6 } as const;
export type Tile = (typeof Tile)[keyof typeof Tile];

export type LootKind = 'coin' | 'cash' | 'bag';
export const LOOT_VALUE: Record<LootKind, number> = { coin: 5, cash: 25, bag: 100 };

export interface GuardDef {
  /** Waypoints, walked in a loop. A single waypoint is a guard who stands and looks around. */
  route: [number, number][];
  /** Ticks to stand and look around at each waypoint. */
  wait: number;
}

export interface CameraDef {
  /** The wall tile it hangs on. */
  x: number;
  y: number;
  /** Sweeps between these angle indices (clockwise from a to b). */
  from: number;
  to: number;
}

export interface LaserDef {
  x: number;
  y: number;
  /** Beam runs left-right (true) or up-down. */
  across: boolean;
  on: number;
  off: number;
  phase: number;
}

export type Floor = 'tile' | 'carpet' | 'wood' | 'gold' | 'steel';

export interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
  floor: Floor;
}

export interface VaultDef {
  id: string;
  /** Floor looks, for drawing only. Tiles outside every room get 'tile'. */
  rooms: Room[];
  rows: string[];
  guards: GuardDef[];
  cameras: CameraDef[];
  lasers: Omit<LaserDef, 'x' | 'y'>[];
  safeValue: number;
  /** Seconds before the cops arrive. */
  seconds: number;
}

export interface Level {
  id: string;
  rooms: Room[];
  w: number;
  h: number;
  tiles: Tile[];
  start: [number, number];
  exit: [number, number];
  loot: { x: number; y: number; kind: LootKind }[];
  safes: { x: number; y: number; value: number }[];
  guards: { path: [number, number][]; stops: Map<number, number> }[];
  cameras: CameraDef[];
  lasers: LaserDef[];
  ticks: number;
}

const LEGEND: Record<string, Tile> = {
  '#': Tile.Wall,
  '.': Tile.Floor,
  c: Tile.Floor,
  $: Tile.Floor,
  B: Tile.Floor,
  L: Tile.Floor,
  '@': Tile.Floor,
  D: Tile.Desk,
  O: Tile.Pillar,
  P: Tile.Plant,
  S: Tile.Safe,
  E: Tile.Exit,
};

export function buildLevel(def: VaultDef): Level {
  const h = def.rows.length;
  const w = def.rows[0]!.length;
  const tiles: Tile[] = [];
  const loot: Level['loot'] = [];
  const safes: Level['safes'] = [];
  const laserTiles: [number, number][] = [];
  let start: [number, number] | null = null;
  let exit: [number, number] | null = null;
  def.rows.forEach((row, y) => {
    if (row.length !== w) throw new Error(`${def.id}: row ${y} is ${row.length} wide, not ${w}`);
    [...row].forEach((ch, x) => {
      const t = LEGEND[ch];
      if (t === undefined) throw new Error(`${def.id}: unknown tile "${ch}" at ${x},${y}`);
      tiles.push(t);
      if (ch === 'c') loot.push({ x, y, kind: 'coin' });
      if (ch === '$') loot.push({ x, y, kind: 'cash' });
      if (ch === 'B') loot.push({ x, y, kind: 'bag' });
      if (ch === 'S') safes.push({ x, y, value: def.safeValue });
      if (ch === 'L') laserTiles.push([x, y]);
      if (ch === '@') start = [x, y];
      if (ch === 'E') exit = [x, y];
    });
  });
  if (!start || !exit) throw new Error(`${def.id}: needs a start (@) and an exit (E)`);
  if (laserTiles.length !== def.lasers.length) throw new Error(`${def.id}: ${laserTiles.length} L tiles, ${def.lasers.length} laser settings`);
  const level: Level = {
    id: def.id,
    rooms: def.rooms,
    w,
    h,
    tiles,
    start,
    exit,
    loot,
    safes,
    guards: [],
    cameras: def.cameras,
    lasers: laserTiles.map(([x, y], i) => ({ x, y, ...def.lasers[i]! })),
    ticks: def.seconds * TPS,
  };
  level.guards = def.guards.map((g) => {
    const path: [number, number][] = [];
    const stops = new Map<number, number>();
    if (g.route.length === 1) {
      path.push(g.route[0]!);
      stops.set(0, g.wait);
    } else
      g.route.forEach((from, i) => {
        const to = g.route[(i + 1) % g.route.length]!;
        stops.set(path.length, g.wait);
        const leg = bfsPath(level, from, to);
        if (!leg) throw new Error(`${def.id}: guard can't walk ${from} -> ${to}`);
        path.push(...leg.slice(0, -1));
      });
    return { path, stops };
  });
  return level;
}

export const tileAt = (l: Level, x: number, y: number): Tile =>
  x < 0 || y < 0 || x >= l.w || y >= l.h ? Tile.Wall : l.tiles[y * l.w + x]!;

/** Can a Chog stand here? */
export const walkable = (l: Level, x: number, y: number) => {
  const t = tileAt(l, x, y);
  return t === Tile.Floor || t === Tile.Exit;
};

/** Does this tile stop a flashlight? Desks and plants are low: light goes over them. */
export const blocksLight = (l: Level, x: number, y: number) => {
  const t = tileAt(l, x, y);
  return t === Tile.Wall || t === Tile.Pillar || t === Tile.Safe;
};

/** Shortest walk from a to b (inclusive of both), or null. Deterministic: neighbours in Dir order. */
export function bfsPath(l: Level, a: [number, number], b: [number, number]): [number, number][] | null {
  const prev = new Int32Array(l.w * l.h).fill(-1);
  const start = a[1] * l.w + a[0];
  const goal = b[1] * l.w + b[0];
  prev[start] = start;
  const queue = [start];
  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi]!;
    if (cur === goal) break;
    const cx = cur % l.w;
    const cy = (cur - cx) / l.w;
    for (let d = 0; d < 4; d++) {
      const nx = cx + DX[d]!;
      const ny = cy + DY[d]!;
      if (!walkable(l, nx, ny)) continue;
      const n = ny * l.w + nx;
      if (prev[n] !== -1) continue;
      prev[n] = cur;
      queue.push(n);
    }
  }
  if (prev[goal] === -1) return null;
  const out: [number, number][] = [];
  for (let c = goal; ; c = prev[c]!) {
    out.push([c % l.w, Math.floor(c / l.w)]);
    if (c === start) break;
  }
  return out.reverse();
}

/** Walking distance in tiles from (x, y) to every tile (-1 where unreachable). */
export function distances(l: Level, x: number, y: number): Int32Array {
  const dist = new Int32Array(l.w * l.h).fill(-1);
  const start = y * l.w + x;
  dist[start] = 0;
  const queue = [start];
  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi]!;
    const cx = cur % l.w;
    const cy = (cur - cx) / l.w;
    for (let d = 0; d < 4; d++) {
      const nx = cx + DX[d]!;
      const ny = cy + DY[d]!;
      if (!walkable(l, nx, ny)) continue;
      const n = ny * l.w + nx;
      if (dist[n] !== -1) continue;
      dist[n] = dist[cur]! + 1;
      queue.push(n);
    }
  }
  return dist;
}
