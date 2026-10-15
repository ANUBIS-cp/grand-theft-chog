import { BH, BW, CITY, Ground, ROAD, groundAt, type Place, type Prop } from '@chog-city/game/city';
import { chogImage } from '@/lib/images';
import { drawPiece, hopHeight, makePiece, type Piece } from '../chog/piece';
import { CityArt } from './art';
import { FACADE, LANDMARK_RISE, paintLandmark, paintWall, paintYard, treeOf } from './landmarks';

// Draws the city at night in the same 3/4 view as the vaults: ground tiles, buildings (roof at the back, front
// wall at the bottom of the footprint; only a gang's rooftop landmark stands taller), lamps, trees, and the Chogs on the
// street. A dark layer with light pools cut out of it goes on top, then names and speech bubbles.

const INK = '#0d0b1a';

export interface Person {
  key: string;
  /** Token ID for the face; null for a guest. */
  chog: number | null;
  name: string;
  color: string;
  ink: string;
  x: number;
  y: number;
  /** -1 facing left, 1 facing right. */
  face: -1 | 1;
  moving: boolean;
  me?: boolean;
  /** Wandering Chogs nobody is playing: drawn a little quieter. */
  npc?: boolean;
  emote?: { kind: Emote; at: number };
  /** Police in a getaway: a cap, a blue base and a flashing light. */
  cop?: boolean;
  /** Carrying a bag of stolen cash home: how much (shown over their head for everyone). */
  bag?: number;
  /** A Wanted poster ($CHOG) is up on this Chog: a poster tag next to its name. */
  wanted?: boolean;
}

export type { Emote } from '@chog-city/game/city';
import type { Emote } from '@chog-city/game/city';

export interface PlaceLook {
  name: string;
  color: string;
  ink: string;
  /** Defence level 0-3 (cameras and wire on the roof). */
  tier: number;
  cash: number;
  rank: number;
  /** Someone is robbing it right now. */
  alarm: boolean;
  mine: boolean;
  /** The gang flies a banner ($CHOG) today: a flag over the building. */
  banner?: boolean;
}

export interface Board {
  /** The big screen in the plaza. */
  lines: { name: string; cash: number; color: string }[];
  /** All the $CHOG the city has burned (bail, posters, banners). */
  burned?: number;
}

type Img = HTMLImageElement;

function hash(x: number, y: number) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

/** A steady 0-1 number per person, so pieces don't all hop in step. */
function keySeed(key: string) {
  let h = 7;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return hash(h, 3);
}

const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

/** Darker or lighter version of a #rrggbb colour. */
function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f)));
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

/** How big a prop's drawn art is, in tiles: by width where that's set, else by height. */
const ART_TALL: Record<Prop['kind'], number> = {
  lamp: 2.3,
  tree: 2.2,
  bench: 0.9,
  hydrant: 0.7,
  fountain: 2.2,
  screen: 0,
  car: 0,
  stall: 0,
  post: 0,
};
const ART_WIDE: Record<Prop['kind'], number> = {
  lamp: 0,
  tree: 0,
  bench: 1.2,
  hydrant: 0,
  fountain: 2.8,
  screen: 0,
  car: 1.8,
  stall: 1.5,
  post: 0,
};

// Fixed parts of the map that never change: road markings depend only on where a tile sits.
const PERIOD_X = BW + ROAD;
const PERIOD_Y = BH + ROAD;
const inVRoad = (x: number) => x % PERIOD_X < ROAD;
const inHRoad = (y: number) => y % PERIOD_Y < ROAD;

export class CityRenderer {
  t = 48;
  dpr = 1;
  font = 'Impact, sans-serif';
  bodyFont = 'Arial, sans-serif';
  places: Record<string, PlaceLook> = {};
  board: Board = { lines: [] };
  private g: CanvasRenderingContext2D;
  private dark!: HTMLCanvasElement;
  private tiles: Record<string, HTMLCanvasElement> = {};
  private buildings = new Map<string, { c: HTMLCanvasElement; key: string }>();
  private faces = new Map<string, Piece>();
  private images = new Map<number, Img>();
  view = { w: 0, h: 0 };
  cam = { x: 0, y: 0, ready: false };

  constructor(
    private cv: HTMLCanvasElement,
    private onImage: () => void,
  ) {
    this.g = cv.getContext('2d')!;
    this.art = new CityArt(() => {
      this.buildings.clear();
      this.onImage();
    });
  }

  /** Drawn art, where there is some (see art.ts). */
  private art: CityArt;
  private artOf(p: Place) {
    return this.art.get(p.kind === 'gang' ? `gang-${p.gang}` : p.kind === 'jail' ? 'jail' : 'practice');
  }

  resize(w: number, h: number) {
    this.t = Math.round(Math.min(64, Math.max(36, Math.min(w, h) / 12)));
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.view = { w: Math.round(w), h: Math.round(h) };
    this.cv.width = Math.round(w * this.dpr);
    this.cv.height = Math.round(h * this.dpr);
    this.cv.style.width = `${this.view.w}px`;
    this.cv.style.height = `${this.view.h}px`;
    this.dark = makeCanvas(this.cv.width, this.cv.height);
    this.tiles = {};
    this.buildings.clear();
    this.yards.clear();
    this.faces.clear();
    this.buildTiles();
  }

  /** World tile -> screen px. */
  sx = (x: number) => x * this.t - this.cam.x;
  sy = (y: number) => y * this.t - this.cam.y;
  /** Screen px -> world tile. */
  toWorld(px: number, py: number) {
    return { x: (px + this.cam.x) / this.t, y: (py + this.cam.y) / this.t };
  }

  /** Moves the camera toward (x, y) in tiles, kept inside the map. */
  follow(x: number, y: number, snap = false) {
    const W = CITY.w * this.t;
    const H = CITY.h * this.t;
    const axis = (world: number, screen: number, at: number) =>
      world <= screen ? (world - screen) / 2 : Math.max(0, Math.min(world - screen, at - screen / 2));
    const tx = axis(W, this.view.w, x * this.t);
    const ty = axis(H, this.view.h, y * this.t);
    if (snap || !this.cam.ready) {
      this.cam = { x: tx, y: ty, ready: true };
      return;
    }
    this.cam.x += (tx - this.cam.x) * 0.15;
    this.cam.y += (ty - this.cam.y) * 0.15;
  }

  /** Pans by a screen distance (dragging the map when you aren't walking). */
  pan(dx: number, dy: number) {
    const W = CITY.w * this.t;
    const H = CITY.h * this.t;
    this.cam.x = Math.max(0, Math.min(Math.max(0, W - this.view.w), this.cam.x - dx));
    this.cam.y = Math.max(0, Math.min(Math.max(0, H - this.view.h), this.cam.y - dy));
  }

  private image(chog: number): Img | undefined {
    let img = this.images.get(chog);
    if (!img) {
      img = new Image();
      img.decoding = 'async';
      img.src = chogImage(chog, 256);
      img.onload = () => {
        for (const k of this.faces.keys()) if (k.startsWith(`${chog}:`)) this.faces.delete(k);
        this.onImage();
      };
      this.images.set(chog, img);
    }
    return img.complete && img.naturalWidth ? img : undefined;
  }

  // ---------- tiles ----------

  private tile(key: string, draw: (g: CanvasRenderingContext2D, t: number) => void) {
    const { t, dpr } = this;
    const c = makeCanvas(t * dpr, t * dpr);
    const g = c.getContext('2d')!;
    g.scale(dpr, dpr);
    draw(g, t);
    this.tiles[key] = c;
  }

  private buildTiles() {
    const speckle = (g: CanvasRenderingContext2D, t: number, base: string, dots: string, seed: number) => {
      g.fillStyle = base;
      g.fillRect(0, 0, t, t);
      g.fillStyle = dots;
      for (let i = 0; i < 7; i++) {
        const r = hash(seed, i);
        const q = hash(i, seed + 9);
        g.fillRect(Math.floor(r * t), Math.floor(q * t), Math.max(1, t / 24), Math.max(1, t / 24));
      }
    };
    for (let v = 0; v < 4; v++) {
      this.tile(`road${v}`, (g, t) => speckle(g, t, '#1b1828', '#24203a', v));
      this.tile(`walk${v}`, (g, t) => {
        g.fillStyle = v % 2 ? '#2c2843' : '#2a2640';
        g.fillRect(0, 0, t, t);
        g.strokeStyle = '#211d34';
        g.lineWidth = Math.max(1, t / 32);
        g.strokeRect(0.5, 0.5, t - 1, t - 1);
        if (v === 3) {
          g.strokeStyle = '#25213a';
          g.beginPath();
          g.moveTo(t * 0.2, t * 0.3);
          g.lineTo(t * 0.45, t * 0.55);
          g.stroke();
        }
      });
      this.tile(`yard${v}`, (g, t) => {
        g.fillStyle = (v & 1) ^ (v >> 1) ? '#352c49' : '#30283f';
        g.fillRect(0, 0, t, t);
        g.strokeStyle = '#272035';
        g.lineWidth = Math.max(1, t / 40);
        g.strokeRect(0.5, 0.5, t - 1, t - 1);
      });
      this.tile(`grass${v}`, (g, t) => {
        speckle(g, t, v % 2 ? '#173a2b' : '#163628', '#1f4a36', v + 20);
        g.strokeStyle = '#225440';
        g.lineWidth = Math.max(1, t / 28);
        for (let i = 0; i < 4; i++) {
          const x = hash(v, i + 40) * t;
          const y = hash(i + 40, v) * t;
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x + t * 0.04, y - t * 0.1);
          g.stroke();
        }
      });
      this.tile(`plaza${v}`, (g, t) => {
        g.fillStyle = '#2f2848';
        g.fillRect(0, 0, t, t);
        g.fillStyle = v % 2 ? '#342d4f' : '#2c2644';
        g.fillRect(t * 0.04, t * 0.04, t * 0.44, t * 0.44);
        g.fillRect(t * 0.52, t * 0.52, t * 0.44, t * 0.44);
        g.fillStyle = v % 2 ? '#2c2644' : '#332c4d';
        g.fillRect(t * 0.52, t * 0.04, t * 0.44, t * 0.44);
        g.fillRect(t * 0.04, t * 0.52, t * 0.44, t * 0.44);
      });
    }
    this.tile('crossH', (g, t) => {
      speckle(g, t, '#1b1828', '#24203a', 7);
      g.fillStyle = '#bdb8d4';
      g.globalAlpha = 0.55;
      for (let i = 0; i < 3; i++) g.fillRect(t * 0.08, t * (0.08 + i * 0.33), t * 0.84, t * 0.17);
    });
    this.tile('crossV', (g, t) => {
      speckle(g, t, '#1b1828', '#24203a', 8);
      g.fillStyle = '#bdb8d4';
      g.globalAlpha = 0.55;
      for (let i = 0; i < 3; i++) g.fillRect(t * (0.08 + i * 0.33), t * 0.08, t * 0.17, t * 0.84);
    });
    this.tile('pen', (g, t) => {
      g.fillStyle = '#3a3a44';
      g.fillRect(0, 0, t, t);
      g.fillStyle = '#34343d';
      g.fillRect(t * 0.5, 0, t * 0.5, t * 0.5);
      g.fillRect(0, t * 0.5, t * 0.5, t * 0.5);
    });
  }

  private groundTile(x: number, y: number): HTMLCanvasElement | undefined {
    const v = Math.floor(hash(x, y) * 4);
    switch (groundAt(x, y)) {
      case Ground.Road:
        return this.tiles[`road${v}`];
      case Ground.Cross:
        // Stripes run the way the traffic does, so you walk across them.
        return this.tiles[inVRoad(x) ? 'crossV' : 'crossH'];
      case Ground.Walk:
      case Ground.Prop:
        return groundAt(x, y) === Ground.Prop && this.nearPlaza(x, y)
          ? this.tiles[`plaza${v}`]
          : this.tiles[`walk${v}`];
      case Ground.Yard:
        return this.tiles[`yard${v}`];
      case Ground.Grass:
        return this.tiles[`grass${v}`];
      case Ground.Plaza:
        return this.tiles[`plaza${v}`];
      case Ground.Pen:
        return this.tiles.pen;
      default:
        return this.tiles[`walk${v}`];
    }
  }

  private nearPlaza(x: number, y: number) {
    return (
      groundAt(x - 1, y) === Ground.Plaza ||
      groundAt(x + 1, y) === Ground.Plaza ||
      groundAt(x, y - 1) === Ground.Plaza
    );
  }

  private drawGround(x0: number, y0: number, x1: number, y1: number) {
    const { g, t } = this;
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const tile = this.groundTile(x, y);
        if (tile) g.drawImage(tile, Math.floor(this.sx(x)), Math.floor(this.sy(y)), t + 1, t + 1);
      }
    // Lane dashes down the middle of every road, and kerbs where pavement meets road.
    g.fillStyle = '#8a7a3a';
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        if (groundAt(x, y) !== Ground.Road) continue;
        const h = inHRoad(y) && !inVRoad(x);
        const v = inVRoad(x) && !inHRoad(y);
        if (h && y % PERIOD_Y === 1 && x % 2 === 0)
          g.fillRect(this.sx(x + 0.15), this.sy(y + 0.46), t * 0.7, t * 0.08);
        if (v && x % PERIOD_X === 1 && y % 2 === 0)
          g.fillRect(this.sx(x + 0.46), this.sy(y + 0.15), t * 0.08, t * 0.7);
      }
    const kerb = Math.max(2, t / 14);
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const k = groundAt(x, y);
        if (k === Ground.Road || k === Ground.Cross) continue;
        if (k === Ground.Block) continue;
        const road = (gx: number, gy: number) => {
          const n = groundAt(gx, gy);
          return n === Ground.Road || n === Ground.Cross;
        };
        g.fillStyle = '#4a4466';
        if (road(x, y + 1)) g.fillRect(this.sx(x), this.sy(y + 1) - kerb, t, kerb);
        if (road(x, y - 1)) g.fillRect(this.sx(x), this.sy(y), t, kerb * 0.6);
        if (road(x - 1, y)) g.fillRect(this.sx(x), this.sy(y), kerb * 0.6, t);
        if (road(x + 1, y)) g.fillRect(this.sx(x + 1) - kerb * 0.6, this.sy(y), kerb * 0.6, t);
        if (road(x, y + 1)) {
          g.fillStyle = 'rgba(0,0,0,0.35)';
          g.fillRect(this.sx(x), this.sy(y + 1), t, kerb * 0.8);
        }
      }
  }

  // ---------- buildings ----------

  /** How tall the front wall is, in tiles. The rest of the footprint is roof. */
  private static WALL = 3;

  private buildingSprite(p: Place, look: PlaceLook | undefined, now: number): HTMLCanvasElement {
    const art = this.artOf(p);
    const key = `${p.id}:${look?.tier ?? 0}:${look?.rank ?? 0}:${look?.mine ? 1 : 0}:${art ? 1 : 0}`;
    const have = this.buildings.get(p.id);
    if (have && have.key === key) return have.c;
    const { t, dpr } = this;
    const lip = this.lipOf(p);
    const c = makeCanvas(p.w * t * dpr, (p.h * t + lip) * dpr);
    const g = c.getContext('2d')!;
    g.scale(dpr, dpr);
    g.translate(0, lip);
    if (art) this.paintArt(g, p, look, art);
    else if (p.kind === 'gang') this.paintHideout(g, p, look);
    else if (p.kind === 'jail') this.paintJail(g, p);
    else this.paintWarehouse(g, p);
    void now;
    this.buildings.set(p.id, { c, key });
    return c;
  }

  /** The gang whose front yard (x, y) is in, or null. */
  private yardGang(x: number, y: number) {
    for (const p of CITY.places)
      if (p.kind === 'gang' && x >= p.x - 1 && x <= p.x + p.w + 1 && y >= p.y + p.h && y <= p.y + p.h + 3.5)
        return p.gang ?? null;
    return null;
  }

  private yards = new Map<string, HTMLCanvasElement>();

  /** A gang's front yard decoration, drawn flat on the ground. */
  private yardSprite(p: Place) {
    const have = this.yards.get(p.id);
    if (have) return have;
    const { t, dpr } = this;
    const c = makeCanvas(p.w * t * dpr, 3 * t * dpr);
    const g = c.getContext('2d')!;
    g.scale(dpr, dpr);
    paintYard(g, p.gang!, p.w * t, 3 * t, t);
    this.yards.set(p.id, c);
    return c;
  }

  /** How far a building's sprite reaches above its footprint (a gang's landmark stands up off the roof). */
  private lipOf(p: Place) {
    return Math.round(this.t * (p.kind === 'gang' || this.artOf(p) ? LANDMARK_RISE : 0.7));
  }

  /**
   * A building from drawn art: the picture fills the footprint's width and stands on its front edge, with the
   * gang's name on a ribbon and its rank and defence on top.
   */
  private paintArt(
    g: CanvasRenderingContext2D,
    p: Place,
    look: PlaceLook | undefined,
    img: HTMLImageElement,
  ) {
    const { t } = this;
    const W = p.w * t;
    const H = p.h * t;
    const lip = this.lipOf(p);
    const k = Math.min(W / img.naturalWidth, (H + lip) / img.naturalHeight);
    const w = img.naturalWidth * k;
    const h = img.naturalHeight * k;
    g.drawImage(img, (W - w) / 2, H - h, w, h);
  }

  /** How high a drawn building's picture reaches above its plot's front edge, in px. */
  private artHeight(p: Place, img: HTMLImageElement) {
    const { t } = this;
    const k = Math.min((p.w * t) / img.naturalWidth, (p.h * t + this.lipOf(p)) / img.naturalHeight);
    return img.naturalHeight * k;
  }

  /**
   * A drawn building's sign: the gang's name on a ribbon floating just above the picture, so it never
   * covers the rooftop landmark, with its rank and defence. Drawn after the night, like name tags.
   */
  private drawSign(p: Place, look: PlaceLook, img: HTMLImageElement) {
    const { g, t } = this;
    const W = p.w * t;
    const size = Math.round(t * 0.46);
    g.save();
    g.translate(this.sx(p.x), this.sy(p.y));
    this.paintRibbon(g, W, p.h * t - this.artHeight(p, img) - size * 0.55, look);
    g.restore();
  }

  private paintRibbon(g: CanvasRenderingContext2D, W: number, ry: number, look: PlaceLook) {
    const { t } = this;
    const size = Math.round(t * 0.46);
    g.font = `${size}px ${this.font}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const name = look.name.toUpperCase();
    const rw = Math.min(W * 0.9, g.measureText(name).width + size * 1.6);
    g.fillStyle = look.color;
    g.strokeStyle = INK;
    g.lineWidth = 2.5;
    g.beginPath();
    g.roundRect(W / 2 - rw / 2, ry - size * 0.75, rw, size * 1.5, size * 0.4);
    g.fill();
    g.stroke();
    if (look.banner) {
      // A banner bought with $CHOG: a big waving flag in the gang's colour on a pole above the sign.
      const px = W / 2 - rw / 2 + size * 0.3;
      const top = ry - size * 4.2;
      const wave = performance.now() / 260;
      g.lineWidth = 3;
      g.strokeStyle = INK;
      g.beginPath();
      g.moveTo(px, ry - size * 0.75);
      g.lineTo(px, top);
      g.stroke();
      g.fillStyle = '#ffd23f';
      g.beginPath();
      g.arc(px, top, size * 0.22, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      const fw = size * 3.4;
      const fh = size * 1.9;
      g.fillStyle = look.color;
      g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(px, top + size * 0.2);
      for (let i = 1; i <= 8; i++) g.lineTo(px + (fw * i) / 8, top + size * 0.2 + Math.sin(wave + i * 0.7) * size * 0.18);
      g.lineTo(px + fw - size * 0.6, top + size * 0.2 + fh / 2);
      for (let i = 8; i >= 0; i--)
        g.lineTo(px + (fw * i) / 8, top + size * 0.2 + fh + Math.sin(wave + i * 0.7) * size * 0.18);
      g.closePath();
      g.fill();
      g.stroke();
      g.fillStyle = look.ink;
      g.font = `${Math.round(size * 1.1)}px ${this.font}`;
      g.fillText('★', px + fw * 0.42, top + size * 0.2 + fh / 2 + Math.sin(wave + 3) * size * 0.18);
      g.font = `${size}px ${this.font}`;
    }
    g.fillStyle = look.ink;
    g.fillText(name, W / 2, ry + 1, rw - size);
    // Rank badge, gold for the richest.
    const bx = W / 2 + rw / 2;
    g.fillStyle = look.rank === 1 ? '#ffd23f' : '#ffffff';
    g.beginPath();
    g.arc(bx, ry - size * 0.6, size * 0.62, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = INK;
    g.font = `${Math.round(size * 0.75)}px ${this.font}`;
    g.fillText(`#${look.rank}`, bx, ry - size * 0.56);
    // Defence: one shield pip per level.
    for (let i = 0; i < look.tier; i++) {
      const sx = W / 2 - rw / 2 + size * 0.5 + i * size * 0.7;
      const sy = ry + size * 0.95;
      g.fillStyle = '#9fd3ff';
      g.beginPath();
      g.moveTo(sx, sy - size * 0.3);
      g.lineTo(sx + size * 0.26, sy - size * 0.2);
      g.lineTo(sx + size * 0.2, sy + size * 0.18);
      g.lineTo(sx, sy + size * 0.32);
      g.lineTo(sx - size * 0.2, sy + size * 0.18);
      g.lineTo(sx - size * 0.26, sy - size * 0.2);
      g.closePath();
      g.fill();
      g.lineWidth = 1.5;
      g.stroke();
    }
  }

  private paintRoof(g: CanvasRenderingContext2D, p: Place, roof: string, edge: string) {
    const { t } = this;
    const W = p.w * t;
    const R = (p.h - CityRenderer.WALL) * t;
    g.fillStyle = roof;
    g.fillRect(0, 0, W, R);
    // Tar-paper seams.
    g.strokeStyle = 'rgba(0,0,0,0.18)';
    g.lineWidth = 1;
    for (let i = 1; i < p.w; i++) {
      g.beginPath();
      g.moveTo(i * t, 0);
      g.lineTo(i * t, R);
      g.stroke();
    }
    // Parapet round the roof.
    const lw = Math.max(3, t * 0.12);
    g.strokeStyle = edge;
    g.lineWidth = lw;
    g.strokeRect(lw / 2, lw / 2, W - lw, R - lw / 2);
    g.strokeStyle = INK;
    g.lineWidth = 2;
    g.strokeRect(1, 1, W - 2, R);
  }

  private paintHideout(g: CanvasRenderingContext2D, p: Place, look: PlaceLook | undefined) {
    const { t } = this;
    const W = p.w * t;
    const R = (p.h - CityRenderer.WALL) * t;
    const Hw = CityRenderer.WALL * t;
    const color = look?.color ?? '#888888';
    const seed = p.x * 31 + p.y;
    const gang = p.gang!;
    const f = FACADE[gang];
    this.paintRoof(g, p, f.roof, shade(f.roof, 0.18));
    paintLandmark(g, gang, W, R, t, color, this.font);

    // Defences on the roof edge: wire from level 2, cameras from 1, a searchlight base at 3.
    const tier = look?.tier ?? 0;
    if (tier >= 2) {
      g.strokeStyle = '#9a96b0';
      g.lineWidth = 1.2;
      for (let x = t * 0.2; x < W - t * 0.2; x += t * 0.25) {
        g.beginPath();
        g.arc(x, t * 0.12, t * 0.08, 0, Math.PI * 2);
        g.stroke();
      }
    }
    if (tier >= 1) {
      for (const cx of [t * 0.35, W - t * 0.35]) {
        g.fillStyle = '#d6d2e8';
        g.fillRect(cx - t * 0.16, R - t * 0.42, t * 0.32, t * 0.2);
        g.fillStyle = '#ff3b3b';
        g.fillRect(cx - t * 0.04, R - t * 0.36, t * 0.08, t * 0.08);
        g.strokeStyle = INK;
        g.lineWidth = 1;
        g.strokeRect(cx - t * 0.16, R - t * 0.42, t * 0.32, t * 0.2);
      }
    }
    if (tier >= 3) {
      g.fillStyle = '#2b2a33';
      g.beginPath();
      g.arc(t * 1.2, R - t * 0.9, t * 0.3, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = INK;
      g.stroke();
    }
    // The richest gang has a gold crown on the roof.
    if (look?.rank === 1) {
      const cx = t * 0.9;
      const cy = R * 0.45;
      const s = t * 0.5;
      g.fillStyle = '#ffd23f';
      g.strokeStyle = INK;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(cx - s, cy + s * 0.5);
      g.lineTo(cx - s, cy - s * 0.4);
      g.lineTo(cx - s * 0.5, cy);
      g.lineTo(cx, cy - s * 0.6);
      g.lineTo(cx + s * 0.5, cy);
      g.lineTo(cx + s, cy - s * 0.4);
      g.lineTo(cx + s, cy + s * 0.5);
      g.closePath();
      g.fill();
      g.stroke();
    }

    // The front wall in the gang's own material, a door in the middle, lit windows, an awning in its colour.
    paintWall(g, f, 0, R, W, Hw, t);
    // Sign board across the top of the wall.
    const signH = t * 0.62;
    g.fillStyle = '#16121f';
    g.fillRect(t * 0.6, R + t * 0.12, W - t * 1.2, signH);
    g.strokeStyle = color;
    g.lineWidth = Math.max(2, t * 0.06);
    g.strokeRect(t * 0.6, R + t * 0.12, W - t * 1.2, signH);
    g.font = `${Math.round(signH * 0.72)}px ${this.font}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = color === '#141414' ? '#e8b931' : color;
    g.shadowColor = g.fillStyle as string;
    g.shadowBlur = t * 0.25;
    g.fillText((look?.name ?? p.id).toUpperCase(), W / 2, R + t * 0.12 + signH * 0.56, W - t * 1.6);
    g.shadowBlur = 0;

    // Upstairs windows, some lit.
    for (let i = 0; i < 5; i++) {
      const wx = t * (0.75 + i * 1.85);
      const lit = hash(seed, i + 10) > 0.35;
      g.fillStyle = lit ? '#ffd88a' : '#1d2440';
      g.fillRect(wx, R + t * 0.92, t * 0.95, t * 0.62);
      if (lit) {
        g.fillStyle = 'rgba(120,60,20,0.35)';
        g.fillRect(wx, R + t * 0.92, t * 0.95, t * 0.18);
      }
      g.strokeStyle = INK;
      g.lineWidth = 2;
      g.strokeRect(wx, R + t * 0.92, t * 0.95, t * 0.62);
      g.fillStyle = '#2a2236';
      g.fillRect(wx - t * 0.06, R + t * 1.54, t * 1.07, t * 0.08);
      if (f.bars) {
        g.strokeStyle = '#1a1622';
        g.lineWidth = Math.max(1.5, t * 0.05);
        for (let k = 1; k < 4; k++) {
          g.beginPath();
          g.moveTo(wx + (t * 0.95 * k) / 4, R + t * 0.92);
          g.lineTo(wx + (t * 0.95 * k) / 4, R + t * 1.54);
          g.stroke();
        }
      }
    }

    // Awning.
    const ay = R + t * 1.72;
    const stripes = 12;
    for (let i = 0; i < stripes; i++) {
      g.fillStyle = i % 2 ? color : shade(color === '#141414' ? '#e8b931' : color, 0.55);
      g.beginPath();
      const x0 = t * 0.3 + ((W - t * 0.6) / stripes) * i;
      const x1 = x0 + (W - t * 0.6) / stripes;
      g.moveTo(x0, ay);
      g.lineTo(x1, ay);
      g.lineTo(x1, ay + t * 0.3);
      g.quadraticCurveTo((x0 + x1) / 2, ay + t * 0.42, x0, ay + t * 0.3);
      g.fill();
    }
    g.strokeStyle = INK;
    g.lineWidth = 1.5;
    g.strokeRect(t * 0.3, ay, W - t * 0.6, t * 0.3);

    // Windows either side of the door.
    const wy = ay + t * 0.5;
    const wh = Hw - (wy - R) - t * 0.12;
    for (const [x, w] of [
      [t * 0.6, t * 2.6],
      [W - t * 3.2, t * 2.6],
    ] as const) {
      g.fillStyle = '#ffcf6b';
      g.fillRect(x, wy, w, wh);
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(x + w * 0.08, wy + wh * 0.1, w * 0.18, wh * 0.8);
      g.strokeStyle = INK;
      g.lineWidth = 2;
      g.strokeRect(x, wy, w, wh);
      g.beginPath();
      g.moveTo(x + w / 2, wy);
      g.lineTo(x + w / 2, wy + wh);
      g.stroke();
    }
    // The door.
    const dw = t * 1.3;
    const dx = W / 2 - dw / 2;
    const dy = wy - t * 0.1;
    g.fillStyle = color;
    g.fillRect(dx - t * 0.1, dy - t * 0.1, dw + t * 0.2, R + Hw - dy + t * 0.1);
    g.fillStyle = '#120e1b';
    g.fillRect(dx, dy, dw, R + Hw - dy);
    g.fillStyle = '#d9b44a';
    g.fillRect(dx + dw * 0.78, dy + (R + Hw - dy) * 0.5, t * 0.08, t * 0.08);
    g.strokeStyle = INK;
    g.lineWidth = 2;
    g.strokeRect(dx - t * 0.1, dy - t * 0.1, dw + t * 0.2, R + Hw - dy + t * 0.1);
    // Base line.
    g.fillStyle = INK;
    g.fillRect(0, R + Hw - 2, W, 2);
    g.strokeStyle = INK;
    g.lineWidth = 2;
    g.strokeRect(1, R, W - 2, Hw - 1);
  }

  private paintJail(g: CanvasRenderingContext2D, p: Place) {
    const { t } = this;
    const W = p.w * t;
    const R = (p.h - CityRenderer.WALL) * t;
    const Hw = CityRenderer.WALL * t;
    this.paintRoof(g, p, '#3a3a46', '#55556a');
    // Searchlight tower on the roof.
    g.fillStyle = '#62627a';
    g.fillRect(W / 2 - t * 0.5, t * 0.3, t, t * 1.3);
    g.strokeStyle = INK;
    g.lineWidth = 2;
    g.strokeRect(W / 2 - t * 0.5, t * 0.3, t, t * 1.3);
    g.fillStyle = '#e8e4ff';
    g.beginPath();
    g.arc(W / 2, t * 0.7, t * 0.25, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    // Concrete front, barred windows, the word JAIL.
    g.fillStyle = '#5a5a68';
    g.fillRect(0, R, W, Hw);
    g.strokeStyle = 'rgba(0,0,0,0.15)';
    for (let x = t; x < W; x += t) {
      g.beginPath();
      g.moveTo(x, R);
      g.lineTo(x, R + Hw);
      g.stroke();
    }
    g.fillStyle = '#16121f';
    g.fillRect(W / 2 - t * 1.6, R + t * 0.12, t * 3.2, t * 0.62);
    g.font = `${Math.round(t * 0.46)}px ${this.font}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#ff5a4f';
    g.shadowColor = '#ff5a4f';
    g.shadowBlur = t * 0.25;
    g.fillText('JAIL', W / 2, R + t * 0.47);
    g.shadowBlur = 0;
    for (let i = 0; i < 6; i++) {
      const x = t * (0.6 + i * 1.55) + (i >= 3 ? t * 0.3 : 0);
      if (i === 3 || (x > W / 2 - t * 1.2 && x < W / 2 + t * 1.2)) continue;
      const y = R + t * 1.45;
      g.fillStyle = '#ffcf6b';
      g.fillRect(x, y, t * 0.9, t * 0.75);
      g.strokeStyle = '#1b1b22';
      g.lineWidth = Math.max(2, t * 0.06);
      for (let b = 1; b < 4; b++) {
        g.beginPath();
        g.moveTo(x + (t * 0.9 * b) / 4, y);
        g.lineTo(x + (t * 0.9 * b) / 4, y + t * 0.75);
        g.stroke();
      }
      g.strokeStyle = INK;
      g.lineWidth = 2;
      g.strokeRect(x, y, t * 0.9, t * 0.75);
    }
    g.fillStyle = '#26262e';
    g.fillRect(W / 2 - t * 0.7, R + t * 1.2, t * 1.4, Hw - t * 1.2);
    g.strokeStyle = INK;
    g.lineWidth = 2;
    g.strokeRect(W / 2 - t * 0.7, R + t * 1.2, t * 1.4, Hw - t * 1.2);
    g.strokeRect(1, R, W - 2, Hw - 1);
  }

  private paintWarehouse(g: CanvasRenderingContext2D, p: Place) {
    const { t } = this;
    const W = p.w * t;
    const R = (p.h - CityRenderer.WALL) * t;
    const Hw = CityRenderer.WALL * t;
    // Corrugated roof.
    g.fillStyle = '#3f5560';
    g.fillRect(0, 0, W, R);
    g.strokeStyle = 'rgba(0,0,0,0.22)';
    g.lineWidth = Math.max(1, t / 20);
    for (let y = t * 0.2; y < R; y += t * 0.25) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(W, y);
      g.stroke();
    }
    g.strokeStyle = INK;
    g.lineWidth = 2;
    g.strokeRect(1, 1, W - 2, R);
    // Metal front with a big roller door.
    g.fillStyle = '#566a74';
    g.fillRect(0, R, W, Hw);
    g.strokeStyle = 'rgba(0,0,0,0.2)';
    for (let x = t * 0.25; x < W; x += t * 0.25) {
      g.beginPath();
      g.moveTo(x, R);
      g.lineTo(x, R + Hw);
      g.stroke();
    }
    g.fillStyle = '#16121f';
    g.fillRect(W / 2 - t * 2, R + t * 0.12, t * 4, t * 0.6);
    g.font = `${Math.round(t * 0.44)}px ${this.font}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#7cf0c4';
    g.shadowColor = '#7cf0c4';
    g.shadowBlur = t * 0.25;
    g.fillText('PRACTICE VAULT', W / 2, R + t * 0.44);
    g.shadowBlur = 0;
    const dw = t * 2.6;
    g.fillStyle = '#c9a227';
    g.fillRect(W / 2 - dw / 2, R + t * 0.85, dw, Hw - t * 0.85);
    g.strokeStyle = '#8a6e14';
    g.lineWidth = 1.5;
    for (let y = R + t * 0.95; y < R + Hw; y += t * 0.16) {
      g.beginPath();
      g.moveTo(W / 2 - dw / 2, y);
      g.lineTo(W / 2 + dw / 2, y);
      g.stroke();
    }
    g.strokeStyle = INK;
    g.lineWidth = 2;
    g.strokeRect(W / 2 - dw / 2, R + t * 0.85, dw, Hw - t * 0.85);
    g.strokeRect(1, R, W - 2, Hw - 1);
  }

  // ---------- props ----------

  private drawProp(p: Prop, now: number) {
    const { g, t } = this;
    const x = this.sx(p.x);
    const y = this.sy(p.y);
    // Drawn art stands on the prop's spot; trees in a gang's yard keep their code-drawn gang look.
    const art =
      p.kind === 'screen' || p.kind === 'post' || (p.kind === 'tree' && this.yardGang(p.x, p.y))
        ? undefined
        : this.art.get(p.kind === 'car' ? `car-${(p.n ?? 0) % 4}` : p.kind);
    if (art) {
      const tall = ART_TALL[p.kind] * t;
      const wide = ART_WIDE[p.kind] * t;
      const k = wide ? wide / art.naturalWidth : tall / art.naturalHeight;
      const w = art.naturalWidth * k;
      const h = art.naturalHeight * k;
      const foot = p.kind === 'fountain' ? h * 0.5 : t * 0.15;
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.beginPath();
      g.ellipse(x, y + t * 0.12, Math.max(w * 0.35, t * 0.2), t * 0.14, 0, 0, Math.PI * 2);
      g.fill();
      g.drawImage(art, x - w / 2, y + foot - h, w, h);
      return;
    }
    g.lineWidth = 2;
    g.strokeStyle = INK;
    switch (p.kind) {
      case 'post':
        return;
      case 'car': {
        this.drawCar(x, y, p.n ?? 0, p.x);
        return;
      }
      case 'stall': {
        this.drawStall(x, y, p.n ?? 0, now);
        return;
      }
      case 'lamp': {
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.beginPath();
        g.ellipse(x, y + t * 0.1, t * 0.18, t * 0.07, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#2b2838';
        g.fillRect(x - t * 0.05, y - t * 1.5, t * 0.1, t * 1.6);
        g.strokeRect(x - t * 0.05, y - t * 1.5, t * 0.1, t * 1.6);
        g.fillStyle = '#ffe2a0';
        g.beginPath();
        g.ellipse(x, y - t * 1.55, t * 0.2, t * 0.12, 0, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        break;
      }
      case 'tree': {
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.beginPath();
        g.ellipse(x, y + t * 0.15, t * 0.5, t * 0.17, 0, 0, Math.PI * 2);
        g.fill();
        const look = treeOf(this.yardGang(p.x, p.y));
        const sway = Math.sin(now / 1400 + p.x) * t * 0.03;
        g.fillStyle = look.trunk;
        if (look.kind === 'dead') {
          // Bare, crooked branches.
          g.lineWidth = t * 0.12;
          g.strokeStyle = INK;
          g.lineCap = 'round';
          const branch = (x0: number, y0: number, x1: number, y1: number) => {
            g.lineWidth = t * 0.14;
            g.strokeStyle = INK;
            g.beginPath();
            g.moveTo(x0, y0);
            g.lineTo(x1, y1);
            g.stroke();
            g.lineWidth = t * 0.08;
            g.strokeStyle = look.trunk;
            g.stroke();
          };
          branch(x, y + t * 0.1, x + sway, y - t * 1.0);
          branch(x + sway * 0.5, y - t * 0.5, x - t * 0.35, y - t * 0.95);
          branch(x + sway, y - t * 0.75, x + t * 0.4, y - t * 1.2);
          branch(x - t * 0.2, y - t * 0.8, x - t * 0.3, y - t * 1.25);
          g.lineWidth = 1.5;
          break;
        }
        g.fillRect(x - t * 0.08, y - t * 0.6, t * 0.16, t * 0.75);
        g.strokeRect(x - t * 0.08, y - t * 0.6, t * 0.16, t * 0.75);
        if (look.kind === 'balloon') {
          for (const [dx, dy, i] of [
            [-0.25, -1.05, 0],
            [0.25, -1.1, 1],
            [0, -1.4, 2],
          ] as const) {
            g.fillStyle = look.leaves[i];
            g.beginPath();
            g.ellipse(x + dx * t + sway, y + dy * t, t * 0.26, t * 0.32, 0, 0, Math.PI * 2);
            g.fill();
            g.stroke();
          }
          break;
        }
        if (look.kind === 'cone') {
          for (const [w, top, bot, i] of [
            [0.5, -1.7, -0.5, 0],
            [0.38, -1.75, -0.85, 1],
            [0.24, -1.8, -1.2, 2],
          ] as const) {
            g.fillStyle = look.leaves[i];
            g.beginPath();
            g.moveTo(x + sway, y + top * t);
            g.lineTo(x + w * t, y + bot * t);
            g.lineTo(x - w * t, y + bot * t);
            g.closePath();
            g.fill();
            g.stroke();
          }
          break;
        }
        for (const [dx, dy, r, i] of [
          [0, -1.0, 0.55, 0],
          [-0.25, -0.85, 0.35, 1],
          [0.22, -1.2, 0.3, 2],
        ] as const) {
          g.fillStyle = look.leaves[i];
          g.beginPath();
          g.arc(x + dx * t + sway, y + dy * t, r * t, 0, Math.PI * 2);
          g.fill();
          g.stroke();
        }
        break;
      }
      case 'bench': {
        g.fillStyle = '#6b4a2e';
        g.fillRect(x - t * 0.45, y - t * 0.3, t * 0.9, t * 0.18);
        g.strokeRect(x - t * 0.45, y - t * 0.3, t * 0.9, t * 0.18);
        g.fillRect(x - t * 0.45, y - t * 0.08, t * 0.9, t * 0.16);
        g.strokeRect(x - t * 0.45, y - t * 0.08, t * 0.9, t * 0.16);
        break;
      }
      case 'hydrant': {
        g.fillStyle = '#c23a2b';
        g.beginPath();
        g.roundRect(x - t * 0.12, y - t * 0.45, t * 0.24, t * 0.5, t * 0.08);
        g.fill();
        g.stroke();
        break;
      }
      case 'fountain': {
        g.fillStyle = '#4b4766';
        g.beginPath();
        g.ellipse(x, y, t * 1.2, t * 0.75, 0, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        g.fillStyle = '#2a6f9e';
        g.beginPath();
        g.ellipse(x, y, t * 1.0, t * 0.58, 0, 0, Math.PI * 2);
        g.fill();
        // Ripples.
        g.strokeStyle = 'rgba(180,225,255,0.5)';
        g.lineWidth = 1.5;
        for (let i = 0; i < 2; i++) {
          const k = ((now / 1800 + i / 2) % 1) * 0.9;
          g.beginPath();
          g.ellipse(x, y, t * k, t * k * 0.58, 0, 0, Math.PI * 2);
          g.stroke();
        }
        g.strokeStyle = INK;
        g.lineWidth = 2;
        g.fillStyle = '#6a6688';
        g.fillRect(x - t * 0.12, y - t * 0.7, t * 0.24, t * 0.7);
        g.strokeRect(x - t * 0.12, y - t * 0.7, t * 0.24, t * 0.7);
        // Water jet.
        g.fillStyle = 'rgba(170,220,255,0.75)';
        const jet = t * (0.55 + Math.sin(now / 160) * 0.05);
        g.beginPath();
        g.ellipse(x, y - t * 0.7 - jet / 2, t * 0.08, jet / 2, 0, 0, Math.PI * 2);
        g.fill();
        break;
      }
      case 'screen':
        this.drawScreen(p, now);
        break;
    }
  }

  /** The plaza's big screen: the three richest gangs. */
  /** A parked car seen from the side and above, facing left or right. */
  private drawCar(x: number, y: number, n: number, seed: number) {
    const { g, t } = this;
    const COLORS = ['#e63946', '#3a86ff', '#ffd23f', '#2a9d8f', '#f4f1de', '#8338ec', '#fb8500', '#1d3557'];
    const body = COLORS[n % COLORS.length]!;
    const taxi = n % 5 === 2;
    const color = taxi ? '#ffcc00' : body;
    const dir = hash(seed, n) > 0.5 ? 1 : -1;
    const L = t * 1.7;
    const H = t * 0.62;
    const top = y - H * 0.9;
    g.save();
    g.translate(x, 0);
    g.scale(dir, 1);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath();
    g.ellipse(0, y + t * 0.18, L * 0.55, t * 0.2, 0, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = INK;
    // Roof and windows.
    g.fillStyle = shade(color, -0.15);
    g.beginPath();
    g.moveTo(-L * 0.28, top);
    g.lineTo(-L * 0.18, top - H * 0.55);
    g.lineTo(L * 0.2, top - H * 0.55);
    g.lineTo(L * 0.34, top);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = '#9fd3ff';
    g.beginPath();
    g.moveTo(-L * 0.22, top - 2);
    g.lineTo(-L * 0.15, top - H * 0.45);
    g.lineTo(L * 0.0, top - H * 0.45);
    g.lineTo(L * 0.0, top - 2);
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(L * 0.04, top - 2);
    g.lineTo(L * 0.04, top - H * 0.45);
    g.lineTo(L * 0.18, top - H * 0.45);
    g.lineTo(L * 0.28, top - 2);
    g.closePath();
    g.fill();
    // Body.
    g.fillStyle = color;
    g.beginPath();
    g.roundRect(-L / 2, top, L, H, H * 0.38);
    g.fill();
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.fillRect(-L / 2 + H * 0.3, top + H * 0.12, L - H * 0.6, H * 0.12);
    if (taxi) {
      g.fillStyle = '#1a1622';
      for (let i = 0; i < 6; i++) g.fillRect(-L * 0.3 + i * L * 0.1, top + H * 0.45, L * 0.05, H * 0.14);
      g.fillStyle = '#fff3b0';
      g.fillRect(-L * 0.08, top - H * 0.75, L * 0.16, H * 0.2);
      g.strokeRect(-L * 0.08, top - H * 0.75, L * 0.16, H * 0.2);
    }
    // Lights and wheels.
    g.fillStyle = '#fff3b0';
    g.fillRect(L / 2 - H * 0.22, top + H * 0.25, H * 0.16, H * 0.2);
    g.fillStyle = '#ff4d4d';
    g.fillRect(-L / 2 + H * 0.06, top + H * 0.25, H * 0.14, H * 0.2);
    for (const wx of [-L * 0.3, L * 0.3]) {
      g.fillStyle = '#1a1622';
      g.beginPath();
      g.arc(wx, top + H, H * 0.3, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = '#8a8aa0';
      g.beginPath();
      g.arc(wx, top + H, H * 0.12, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }

  /** A food stall: a cart with a striped canopy. */
  private drawStall(x: number, y: number, n: number, now: number) {
    const { g, t } = this;
    const LOOKS = [
      ['#e63946', '#ffffff', '#ffd23f'],
      ['#2a9d8f', '#f4f1de', '#ff8fab'],
      ['#3a86ff', '#ffffff', '#ffb703'],
      ['#ffb703', '#7a3f00', '#e63946'],
    ];
    const [a, b, goods] = LOOKS[n % LOOKS.length]!;
    const W = t * 1.3;
    g.lineWidth = 2;
    g.strokeStyle = INK;
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath();
    g.ellipse(x, y + t * 0.18, W * 0.6, t * 0.2, 0, 0, Math.PI * 2);
    g.fill();
    // Counter.
    g.fillStyle = '#8b5a2b';
    g.beginPath();
    g.roundRect(x - W / 2, y - t * 0.55, W, t * 0.6, 4);
    g.fill();
    g.stroke();
    g.fillStyle = '#6b4220';
    g.fillRect(x - W / 2 + 3, y - t * 0.2, W - 6, t * 0.06);
    // Goods on the counter.
    for (let i = 0; i < 4; i++) {
      g.fillStyle = i % 2 ? goods! : shade(goods!, -0.2);
      g.beginPath();
      g.arc(x - W * 0.3 + i * W * 0.2, y - t * 0.6, t * 0.09, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    // Poles and the canopy.
    g.strokeStyle = INK;
    g.lineWidth = 3;
    for (const px of [x - W * 0.42, x + W * 0.42]) {
      g.beginPath();
      g.moveTo(px, y - t * 0.55);
      g.lineTo(px, y - t * 1.35);
      g.stroke();
    }
    g.lineWidth = 2;
    const cy = y - t * 1.45;
    const flap = Math.sin(now / 500 + x) * t * 0.02;
    for (let i = 0; i < 6; i++) {
      const x0 = x - W * 0.6 + (W * 1.2 * i) / 6;
      const x1 = x0 + (W * 1.2) / 6;
      g.fillStyle = i % 2 ? a! : b!;
      g.beginPath();
      g.moveTo(x0 + W * 0.05, cy - t * 0.25);
      g.lineTo(x1 + W * 0.05, cy - t * 0.25);
      g.lineTo(x1, cy + t * 0.18 + flap);
      g.quadraticCurveTo((x0 + x1) / 2, cy + t * 0.32 + flap, x0, cy + t * 0.18 + flap);
      g.closePath();
      g.fill();
      g.stroke();
    }
  }

  private drawScreen(p: Prop, now: number) {
    const { g, t } = this;
    const w = t * 6.4;
    const h = t * 3.2;
    const x = this.sx(p.x) - w / 2;
    const y = this.sy(p.y) - h + t * 0.4;
    // Legs.
    g.fillStyle = '#2b2838';
    g.fillRect(x + w * 0.2, y + h - t * 0.1, t * 0.16, t * 0.6);
    g.fillRect(x + w * 0.8 - t * 0.16, y + h - t * 0.1, t * 0.16, t * 0.6);
    g.fillStyle = '#0c0a14';
    g.beginPath();
    g.roundRect(x, y, w, h, t * 0.12);
    g.fill();
    g.strokeStyle = INK;
    g.lineWidth = 2;
    g.stroke();
    g.fillStyle = '#151229';
    g.fillRect(x + t * 0.15, y + t * 0.15, w - t * 0.3, h - t * 0.3);
    g.textBaseline = 'middle';
    g.font = `${Math.round(t * 0.34)}px ${this.font}`;
    g.textAlign = 'center';
    g.fillStyle = '#ffd23f';
    g.fillText('RICHEST GANGS', x + w / 2, y + t * 0.48);
    const lines = this.board.lines.slice(0, 3);
    lines.forEach((l, i) => {
      const ly = y + t * (1.0 + i * 0.52);
      g.font = `${Math.round(t * 0.3)}px ${this.font}`;
      g.textAlign = 'left';
      g.fillStyle = '#ffffff';
      g.fillText(`${i + 1}`, x + t * 0.4, ly);
      g.fillStyle = l.color === '#141414' ? '#e8b931' : l.color;
      g.fillText(l.name.toUpperCase(), x + t * 0.8, ly, w * 0.5);
      g.textAlign = 'right';
      g.fillStyle = '#8be9a8';
      g.fillText(money(l.cash), x + w - t * 0.4, ly);
    });
    // The city's $CHOG burned, on a strip along the bottom.
    const by = y + h - t * 0.62;
    g.fillStyle = '#2a1206';
    g.fillRect(x + t * 0.15, by - t * 0.24, w - t * 0.3, t * 0.48);
    g.font = `${Math.round(t * 0.3)}px ${this.font}`;
    g.textAlign = 'center';
    const flicker = 0.85 + 0.15 * Math.sin(now / 90) * Math.sin(now / 37);
    g.fillStyle = `rgba(255,122,26,${flicker})`;
    g.fillText(`${(this.board.burned ?? 0).toLocaleString('en-US')} $CHOG BURNED`, x + w / 2, by + 1);
    // Scan line.
    g.fillStyle = 'rgba(255,255,255,0.04)';
    const scan = ((now / 30) % (h - t * 0.3)) | 0;
    g.fillRect(x + t * 0.15, y + t * 0.15 + scan, w - t * 0.3, t * 0.08);
  }

  // ---------- people ----------

  /** Card width for a person, in CSS px. You are drawn a little bigger. */
  private cardSize(p: Person) {
    return Math.round(this.t * (p.me ? 1.3 : 1.12));
  }

  private piece(p: Person): Piece {
    const size = this.cardSize(p);
    const img = p.chog === null ? undefined : this.image(p.chog);
    const ready = p.chog === null || !!img;
    const key = `${p.chog ?? 'guest'}:${size}:${p.color}:${p.me ? 1 : 0}:${p.cop ? 1 : 0}`;
    const have = this.faces.get(key);
    if (have) return have;
    const piece = makePiece(img, { base: p.color, size, gold: p.me, cap: p.cop }, this.dpr);
    // A piece drawn while its picture loads is not kept, so the picture shows as soon as it arrives.
    if (ready) this.faces.set(key, piece);
    return piece;
  }

  /** Remembers when each person last turned round or did an emote, to spin or wiggle their piece. */
  private motion = new Map<string, { face: -1 | 1; turnedAt: number; emoteAt: number }>();

  private drawPerson(p: Person, now: number) {
    const { g } = this;
    let m = this.motion.get(p.key);
    if (!m) this.motion.set(p.key, (m = { face: p.face, turnedAt: -1e9, emoteAt: -1e9 }));
    if (m.face !== p.face) {
      m.face = p.face;
      m.turnedAt = now;
    }
    const piece = this.piece(p);
    const x = this.sx(p.x);
    const y = this.sy(p.y) + this.t * 0.12;
    if (p.bag) {
      // Carrying stolen cash: a red ring pulsing at their feet that everyone can spot.
      const k = (now % 700) / 700;
      g.strokeStyle = `rgba(255,45,85,${0.9 - k * 0.6})`;
      g.lineWidth = 4;
      g.beginPath();
      g.ellipse(
        x,
        y + piece.h - piece.fy - 4,
        piece.w * (0.55 + k * 0.35),
        piece.w * (0.18 + k * 0.12),
        0,
        0,
        Math.PI * 2,
      );
      g.stroke();
    }
    if (p.me) {
      // A ring at your feet so you can find yourself in a crowd.
      g.strokeStyle = '#ffd23f';
      g.lineWidth = 3;
      g.beginPath();
      g.ellipse(x, y + piece.h - piece.fy - 4, piece.w * 0.52, piece.w * 0.17, 0, 0, Math.PI * 2);
      g.stroke();
    }
    drawPiece(
      g,
      piece,
      x,
      y,
      {
        moving: p.moving,
        seed: keySeed(p.key),
        face: p.face,
        turned: now - m.turnedAt,
        emoted: p.emote ? now - p.emote.at : undefined,
        alpha: p.npc && !p.cop ? 0.92 : 1,
      },
      now,
    );
    if (p.cop) {
      // The light on the cap: red and blue, flashing.
      const top =
        y - piece.top - hopHeight(piece, { moving: p.moving, seed: keySeed(p.key), face: p.face }, now);
      const red = Math.floor(now / 160) % 2 === 0;
      const glow = g.createRadialGradient(x, top, 0, x, top, this.t * 0.9);
      glow.addColorStop(0, red ? 'rgba(255,45,85,0.75)' : 'rgba(60,130,255,0.75)');
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = glow;
      g.beginPath();
      g.arc(x, top, this.t * 0.9, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = red ? '#ff2d55' : '#3c82ff';
      g.strokeStyle = INK;
      g.lineWidth = 2;
      g.beginPath();
      g.roundRect(x - this.t * 0.11, top - this.t * 0.16, this.t * 0.22, this.t * 0.14, 3);
      g.fill();
      g.stroke();
    }
  }

  /** Names and speech bubbles go on top of the darkness so they stay readable. */
  private drawTag(p: Person, now: number) {
    const { g, t } = this;
    const piece = this.piece(p);
    const seed = keySeed(p.key);
    const x = this.sx(p.x);
    const top =
      this.sy(p.y) + t * 0.12 - piece.top - hopHeight(piece, { moving: p.moving, seed, face: p.face }, now);
    const size = Math.max(11, Math.round(t * (p.me ? 0.25 : 0.22)));
    g.font = `700 ${size}px ${this.bodyFont}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const w = g.measureText(p.name).width + size * 1.6;
    const h = size * 1.55;
    const ty = top - h * 0.75;
    g.globalAlpha = p.npc ? 0.8 : 1;
    // A dark plate with a stripe of the gang's colour, gold for you.
    g.fillStyle = 'rgba(13,11,26,0.88)';
    g.beginPath();
    g.roundRect(x - w / 2, ty - h / 2, w, h, h / 2);
    g.fill();
    g.strokeStyle = p.me ? '#ffd23f' : p.color;
    g.lineWidth = p.me ? 2.5 : 2;
    g.stroke();
    g.fillStyle = p.me ? '#ffd23f' : p.color;
    g.beginPath();
    g.arc(x - w / 2 + h * 0.5, ty, h * 0.17, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffffff';
    g.fillText(p.name, x + h * 0.18, ty + 0.5);
    g.globalAlpha = 1;
    if (p.bag) {
      // The bag's value, over their head, gold.
      const label = `$${p.bag.toLocaleString('en-US')}`;
      const bs = Math.round(size * 1.15);
      g.font = `${bs}px ${this.font}`;
      const bw = g.measureText(label).width + bs * 1.3;
      const bh = bs * 1.45;
      const by = ty - h / 2 - bh / 2 - 4 + Math.sin(now / 160) * 2;
      g.fillStyle = '#ffd23f';
      g.strokeStyle = INK;
      g.lineWidth = 2.5;
      g.beginPath();
      g.roundRect(x - bw / 2, by - bh / 2, bw, bh, 6);
      g.fill();
      g.stroke();
      g.fillStyle = INK;
      g.fillText(label, x, by + 1);
    }
    if (p.wanted) {
      // A little torn poster pinned beside the name: WANTED in red.
      const ps = Math.round(size * 0.95);
      g.font = `${ps}px ${this.font}`;
      const pw = g.measureText('WANTED').width + ps * 0.9;
      const ph = ps * 1.5;
      g.save();
      g.translate(x + w / 2 + pw / 2 + 2, ty);
      g.rotate(0.12 + Math.sin(now / 420) * 0.04);
      g.fillStyle = '#f3e3b5';
      g.strokeStyle = INK;
      g.lineWidth = 2;
      g.beginPath();
      g.roundRect(-pw / 2, -ph / 2, pw, ph, 2);
      g.fill();
      g.stroke();
      g.fillStyle = '#c1121f';
      g.fillText('WANTED', 0, 1);
      g.fillStyle = INK;
      g.beginPath();
      g.arc(0, -ph / 2 + 1, 2, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    if (p.emote && now - p.emote.at < 3500)
      this.drawEmote(p.emote.kind, x, ty - h / 2 - t * 0.5, now - p.emote.at);
  }

  private emoteImages = new Map<Emote, Img>();

  private emoteImage(kind: Emote) {
    let img = this.emoteImages.get(kind);
    if (!img) {
      img = new Image();
      img.decoding = 'async';
      img.src = `/emotes/${kind}.webp`;
      this.emoteImages.set(kind, img);
    }
    return img.complete && img.naturalWidth ? img : undefined;
  }

  /** An emote: the emoji pops up in a bubble over the Chog's head, bounces, then fades. */
  private drawEmote(kind: Emote, x: number, y: number, age: number) {
    const { g, t } = this;
    const pop = age < 160 ? age / 160 : age < 260 ? 1 + 0.15 * Math.sin(((age - 160) / 100) * Math.PI) : 1;
    const fade = age > 3000 ? 1 - (age - 3000) / 500 : 1;
    const bob = Math.sin(age / 180) * t * 0.04;
    const s = t * 0.5 * pop;
    g.save();
    g.globalAlpha = Math.max(0, fade);
    g.fillStyle = '#ffffff';
    g.strokeStyle = INK;
    g.lineWidth = 2.5;
    g.beginPath();
    g.arc(x, y + bob, s, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.beginPath();
    g.moveTo(x - s * 0.22, y + bob + s * 0.9);
    g.lineTo(x, y + bob + s * 1.3);
    g.lineTo(x + s * 0.22, y + bob + s * 0.9);
    g.fill();
    g.stroke();
    g.fillStyle = '#ffffff';
    g.fillRect(x - s * 0.2, y + bob + s * 0.78, s * 0.4, s * 0.2);
    const img = this.emoteImage(kind);
    if (img) g.drawImage(img, x - s * 0.82, y + bob - s * 0.82, s * 1.64, s * 1.64);
    g.restore();
  }

  // ---------- frame ----------

  draw(
    people: Person[],
    now: number,
    opts: {
      jailed: Person[];
      target?: { x: number; y: number } | null;
      door?: Place | null;
      /** Getaway: the door you're running the bag to, and where you are. */
      goal?: { x: number; y: number; from: { x: number; y: number } } | null;
    },
  ) {
    const { g, t, dpr, view } = this;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#07060d';
    g.fillRect(0, 0, view.w, view.h);
    const x0 = Math.max(0, Math.floor(this.cam.x / t) - 1);
    const y0 = Math.max(0, Math.floor(this.cam.y / t) - 1);
    const x1 = Math.min(CITY.w - 1, Math.ceil((this.cam.x + view.w) / t) + 1);
    const y1 = Math.min(CITY.h - 1, Math.ceil((this.cam.y + view.h) / t) + 1);
    this.drawGround(x0, y0, x1, y1);
    for (const p of CITY.places)
      if (p.kind === 'gang' && p.x + p.w >= x0 && p.x <= x1 && p.y + p.h + 3 >= y0 && p.y + p.h <= y1)
        g.drawImage(this.yardSprite(p), this.sx(p.x), this.sy(p.y + p.h), p.w * t, 3 * t);

    // Where you clicked to walk.
    if (opts.target) {
      const k = (now % 900) / 900;
      g.strokeStyle = `rgba(255,210,63,${1 - k})`;
      g.lineWidth = 2;
      g.beginPath();
      g.ellipse(
        this.sx(opts.target.x),
        this.sy(opts.target.y),
        t * (0.2 + k * 0.25),
        t * (0.08 + k * 0.1),
        0,
        0,
        Math.PI * 2,
      );
      g.stroke();
    }

    // Everything that stands up, drawn back to front.
    type Thing = { y: number; draw: () => void };
    const things: Thing[] = [];
    const inView = (x: number, y: number, m: number) =>
      x >= x0 - m && x <= x1 + m && y >= y0 - m && y <= y1 + m;
    for (const p of CITY.places) {
      if (!inView(p.x + p.w / 2, p.y + p.h / 2, p.w)) continue;
      const look = this.places[p.id];
      const sprite = this.buildingSprite(p, look, now);
      things.push({
        y: p.y + p.h,
        draw: () => {
          const lip = this.lipOf(p);
          g.drawImage(sprite, this.sx(p.x), this.sy(p.y) - lip, p.w * t, p.h * t + lip);
          if (look?.alarm) this.drawAlarm(p, now);
        },
      });
    }
    for (const pr of CITY.props)
      if (inView(pr.x, pr.y, 4)) things.push({ y: pr.y + 0.2, draw: () => this.drawProp(pr, now) });
    for (const p of opts.jailed)
      if (inView(p.x, p.y, 2)) things.push({ y: p.y, draw: () => this.drawPerson(p, now) });
    for (const p of people)
      if (inView(p.x, p.y, 2)) things.push({ y: p.y, draw: () => this.drawPerson(p, now) });
    // The jail's fence goes in front of the yard.
    const jail = CITY.places.find((p) => p.kind === 'jail')!;
    things.push({ y: jail.y + jail.h + 3, draw: () => this.drawFence(jail) });
    things.sort((a, b) => a.y - b.y);
    for (const th of things) th.draw();

    // Every Chog stays lit so its picture reads at night.
    const lit: { x: number; y: number; r: number }[] = [];
    for (const p of [...opts.jailed, ...people]) {
      if (!inView(p.x, p.y, 2)) continue;
      const pc = this.piece(p);
      lit.push({ x: this.sx(p.x), y: this.sy(p.y) + t * 0.12 - pc.top * 0.5, r: pc.top * 0.95 });
    }
    this.drawNight(x0, y0, x1, y1, now, lit);

    for (const p of CITY.places) {
      const look = this.places[p.id];
      const art = p.kind === 'gang' && look ? this.artOf(p) : undefined;
      if (art && look && inView(p.x + p.w / 2, p.y + p.h / 2, p.w)) this.drawSign(p, look, art);
    }

    for (const p of opts.jailed) if (inView(p.x, p.y, 2)) this.drawTag(p, now);
    // Your own name last, so it's never under someone else's.
    for (const p of people) if (!p.me && inView(p.x, p.y, 2)) this.drawTag(p, now);
    for (const p of people) if (p.me) this.drawTag(p, now);
    if (opts.door) this.drawDoorHint(opts.door, now);
    if (opts.goal) this.drawGoal(opts.goal, now);
  }

  /**
   * Getaway: a big gold arrow to the door you're running the bag to. Off screen it sits on the edge of the
   * screen pointing that way; on screen it bounces over the door.
   */
  private drawGoal(goal: { x: number; y: number; from: { x: number; y: number } }, now: number) {
    const { g, t, view } = this;
    const gx = this.sx(goal.x);
    const gy = this.sy(goal.y);
    const m = t * 0.9;
    const onScreen = gx > m && gx < view.w - m && gy > m && gy < view.h - m;
    const bob = Math.sin(now / 150) * t * 0.12;
    let x = gx;
    let y = gy - t * 1.6 + bob;
    let a = Math.PI / 2;
    if (!onScreen) {
      const fx = this.sx(goal.from.x);
      const fy = this.sy(goal.from.y);
      a = Math.atan2(gy - fy, gx - fx);
      // Where the line to the door crosses the screen's edge, pulled in a little.
      const kx = Math.cos(a) > 0 ? (view.w - m - fx) / Math.cos(a) : (m - fx) / Math.cos(a);
      const ky = Math.sin(a) > 0 ? (view.h - m - fy) / Math.sin(a) : (m - fy) / Math.sin(a);
      const k = Math.min(Math.abs(kx), Math.abs(ky));
      x = fx + Math.cos(a) * k;
      y = fy + Math.sin(a) * k;
    } else {
      g.strokeStyle = `rgba(255,210,63,${0.6 + 0.4 * Math.sin(now / 120)})`;
      g.lineWidth = 4;
      g.beginPath();
      g.ellipse(gx, gy + t * 0.25, t * 0.95, t * 0.35, 0, 0, Math.PI * 2);
      g.stroke();
    }
    const s = t * 0.55;
    g.save();
    g.translate(x, y);
    g.rotate(a);
    g.fillStyle = '#ffd23f';
    g.strokeStyle = INK;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(s, 0);
    g.lineTo(-s * 0.4, -s * 0.75);
    g.lineTo(-s * 0.4, -s * 0.3);
    g.lineTo(-s, -s * 0.3);
    g.lineTo(-s, s * 0.3);
    g.lineTo(-s * 0.4, s * 0.3);
    g.lineTo(-s * 0.4, s * 0.75);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }

  private drawFence(jail: Place) {
    const { g, t } = this;
    const x = this.sx(jail.x);
    const y = this.sy(jail.y + jail.h);
    const w = jail.w * t;
    const h = 3 * t;
    g.strokeStyle = 'rgba(200,200,220,0.55)';
    g.lineWidth = 1;
    const step = t * 0.22;
    // Chain-link front and sides.
    g.beginPath();
    for (let i = 0; i <= w; i += step) {
      g.moveTo(x + i, y + h - t * 0.9);
      g.lineTo(x + i, y + h);
    }
    for (let k = 0; k < 4; k++) {
      g.moveTo(x, y + h - t * 0.9 + k * t * 0.3);
      g.lineTo(x + w, y + h - t * 0.9 + k * t * 0.3);
    }
    g.stroke();
    g.strokeStyle = '#8a8aa0';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x, y + h);
    g.lineTo(x + w, y + h);
    g.lineTo(x + w, y);
    g.stroke();
    g.beginPath();
    g.moveTo(x, y + h - t * 0.9);
    g.lineTo(x + w, y + h - t * 0.9);
    g.stroke();
    // Gate in the middle.
    g.fillStyle = '#5a5a70';
    g.fillRect(x + w / 2 - t * 0.7, y + h - t * 0.95, t * 1.4, t * 0.12);
  }

  private drawAlarm(p: Place, now: number) {
    const { g, t } = this;
    const on = Math.floor(now / 250) % 2 === 0;
    const x = this.sx(p.x + p.w / 2);
    const y = this.sy(p.y) - t * 0.2;
    g.fillStyle = on ? '#ff2d55' : '#7a1020';
    g.beginPath();
    g.arc(x, y, t * 0.28, Math.PI, 0);
    g.fill();
    g.strokeStyle = INK;
    g.lineWidth = 2;
    g.stroke();
  }

  private drawDoorHint(p: Place, now: number) {
    const { g, t } = this;
    const x = this.sx(p.door.x);
    const y = this.sy(p.door.y) + t * 0.55;
    const k = (Math.sin(now / 200) + 1) / 2;
    g.strokeStyle = `rgba(255,210,63,${0.5 + k * 0.5})`;
    g.lineWidth = 3;
    g.beginPath();
    g.ellipse(x, y - t * 0.3, t * 0.75, t * 0.28, 0, 0, Math.PI * 2);
    g.stroke();
  }

  /** Night: a dark layer with pools of light cut out under lamps, at shop windows, and around you. */
  private drawNight(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    now: number,
    lit: { x: number; y: number; r: number }[],
  ) {
    const { t, dpr } = this;
    const d = this.dark.getContext('2d')!;
    d.setTransform(dpr, 0, 0, dpr, 0, 0);
    d.globalCompositeOperation = 'source-over';
    d.clearRect(0, 0, this.view.w, this.view.h);
    d.fillStyle = 'rgba(10,6,28,0.58)';
    d.fillRect(0, 0, this.view.w, this.view.h);
    d.globalCompositeOperation = 'destination-out';
    const hole = (x: number, y: number, r: number, a = 1) => {
      const gr = d.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(0,0,0,${a})`);
      gr.addColorStop(0.55, `rgba(0,0,0,${a * 0.6})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      d.fillStyle = gr;
      d.fillRect(x - r, y - r, r * 2, r * 2);
    };
    const vis = (x: number, y: number, m: number) => x >= x0 - m && x <= x1 + m && y >= y0 - m && y <= y1 + m;
    for (const p of CITY.props) {
      if (!vis(p.x, p.y, 4)) continue;
      if (p.kind === 'lamp') hole(this.sx(p.x), this.sy(p.y) - t * 0.3, t * 2.6, 0.95);
      if (p.kind === 'fountain') hole(this.sx(p.x), this.sy(p.y), t * 2.2, 0.6);
      if (p.kind === 'screen') hole(this.sx(p.x), this.sy(p.y) - t, t * 3.6, 0.85);
    }
    for (const l of lit) {
      const gr = d.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
      gr.addColorStop(0, 'rgba(0,0,0,1)');
      gr.addColorStop(0.6, 'rgba(0,0,0,0.95)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      d.fillStyle = gr;
      d.fillRect(l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
    }
    for (const p of CITY.places) {
      if (!vis(p.x + p.w / 2, p.y + p.h, p.w)) continue;
      const fy = this.sy(p.y + p.h) - t * 0.4;
      hole(this.sx(p.x + 2), fy, t * 2.4, 0.9);
      hole(this.sx(p.x + p.w - 2), fy, t * 2.4, 0.9);
      hole(this.sx(p.x + p.w / 2), this.sy(p.y + p.h - CityRenderer.WALL) + t * 0.4, t * 3, 0.8);
      // Floodlights on the gang's landmark so it reads from across the city.
      if (p.kind === 'gang') hole(this.sx(p.x + p.w / 2), this.sy(p.y) - t * 0.2, t * 3.6, 0.85);
      if (p.kind === 'jail') {
        // The searchlight sweeping the yard.
        const a = Math.sin(now / 1300) * 0.9;
        hole(this.sx(p.x + p.w / 2 + Math.sin(a) * 4), this.sy(p.y + p.h + 1.5), t * 1.6, 0.9);
      }
    }
    d.globalCompositeOperation = 'source-over';
    this.g.setTransform(1, 0, 0, 1, 0, 0);
    this.g.drawImage(this.dark, 0, 0);
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Coloured glow from the signs, added on top.
    const g = this.g;
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const p of CITY.places) {
      if (!vis(p.x + p.w / 2, p.y + p.h, p.w)) continue;
      const look = this.places[p.id];
      const color =
        p.kind === 'jail'
          ? '#ff5a4f'
          : p.kind === 'training'
            ? '#7cf0c4'
            : look?.color === '#141414'
              ? '#e8b931'
              : (look?.color ?? '#888888');
      const flick =
        0.85 + 0.15 * Math.sin(now / 90 + p.x) * (hash(p.x, Math.floor(now / 2000)) > 0.9 ? 1 : 0);
      const x = this.sx(p.x + p.w / 2);
      const y = this.sy(p.y + p.h - CityRenderer.WALL) + t * 0.4;
      const r = t * 3.2;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, color);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = 0.16 * flick;
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
      if (look?.alarm && Math.floor(now / 250) % 2 === 0) {
        const ar = t * 5;
        const ag = g.createRadialGradient(x, y - t, 0, x, y - t, ar);
        ag.addColorStop(0, '#ff2d55');
        ag.addColorStop(1, 'rgba(0,0,0,0)');
        g.globalAlpha = 0.35;
        g.fillStyle = ag;
        g.fillRect(x - ar, y - t - ar, ar * 2, ar * 2);
      }
    }
    g.restore();
  }
}
