import {
  ANGLES,
  CAMERA_RANGE,
  CHASE_RANGE,
  CONE_TAN,
  CRACK,
  DX,
  DY,
  SEE_RANGE,
  SPOT,
  Tile,
  UNIT,
  blocksLight,
  cameraView,
  laserOn,
  tileAt,
  type Floor,
  type HeistState,
  type Level,
} from '@chog-city/game/heist';
import type { Fx } from './fx';

// Draws a vault in a 3/4 top-down view: floors, raised walls, furniture, the people in it, and the lights.
// Everything static is painted once into `base`; each frame adds the moving parts and a darkness layer with
// the flashlights cut out of it.

const INK = '#0d0b1a';
const CONE = Math.atan(CONE_TAN);

export interface Prev {
  px: number;
  py: number;
  guards: { x: number; y: number; a: number }[];
}

export function snapshot(s: HeistState): Prev {
  return { px: s.player.x, py: s.player.y, guards: s.guards.map((g) => ({ x: g.x, y: g.y, a: g.a })) };
}

const FLOORS: Record<Floor, { a: string; b: string }> = {
  tile: { a: '#2a2350', b: '#2f2858' },
  carpet: { a: '#5e1b37', b: '#621d3a' },
  wood: { a: '#4f3424', b: '#573a28' },
  gold: { a: '#5f4b1b', b: '#6e5822' },
  steel: { a: '#333a4e', b: '#383f54' },
};

function hash(x: number, y: number) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

/** A Chog's face as a round token. (cx, cy) is the centre of the circle inside the canvas, in CSS px. */
interface Face {
  c: HTMLCanvasElement;
  w: number;
  h: number;
  cx: number;
  cy: number;
}

export class VaultRenderer {
  t = 32;
  lift = 10;
  dpr = 1;
  font = 'Impact, sans-serif';
  private g: CanvasRenderingContext2D;
  private base!: HTMLCanvasElement;
  private dark!: HTMLCanvasElement;
  private sprites: Record<string, HTMLCanvasElement> = {};
  private faces: { player?: Face; guards: (Face | undefined)[] } = { guards: [] };
  /** Screen size (CSS px), and the camera's top-left corner in the world. */
  private view = { w: 0, h: 0 };
  private cam = { x: 0, y: 0, ready: false };

  constructor(
    private cv: HTMLCanvasElement,
    readonly level: Level,
    private images: { player: HTMLImageElement; guards: HTMLImageElement[] },
    private gang: { color: string },
  ) {
    this.g = cv.getContext('2d')!;
  }

  /**
   * Fill a box (CSS pixels). Tiles stay big so faces are readable, and the camera follows your Chog.
   */
  resize(boxW: number, boxH: number) {
    // Big tiles everywhere: about 11 tiles across the short side of the screen, and the camera follows your
    // Chog. A small vault that fits at that size just shows whole.
    const { w, h } = this.level;
    const fit = Math.floor(Math.min(boxW / w, boxH / (h + 0.35)));
    const close = Math.floor(Math.min(boxW, boxH) / 11);
    this.t = Math.min(84, Math.max(34, close, fit));
    this.lift = Math.round(this.t * 0.34);
    this.dpr = Math.min(3, window.devicePixelRatio || 1);
    this.view = { w: Math.round(boxW), h: Math.round(boxH) };
    this.cv.width = Math.round(this.view.w * this.dpr);
    this.cv.height = Math.round(this.view.h * this.dpr);
    this.cv.style.width = `${this.view.w}px`;
    this.cv.style.height = `${this.view.h}px`;
    this.dark = canvas(this.cv.width, this.cv.height);
    this.cam.ready = false;
    this.buildSprites();
    this.buildFaces();
    this.buildBase();
  }

  /** World size in CSS px. */
  private get worldW() {
    return this.level.w * this.t;
  }
  private get worldH() {
    return this.level.h * this.t + this.lift;
  }

  /** Where the camera wants to be: centred on the vault if it fits, else on (x, y) and kept inside the vault. */
  private aim(x: number, y: number) {
    const axis = (world: number, screen: number, at: number) =>
      world <= screen ? (world - screen) / 2 : Math.max(0, Math.min(world - screen, at - screen / 2));
    return { x: axis(this.worldW, this.view.w, x), y: axis(this.worldH, this.view.h, y) };
  }

  /** Screen position (CSS px, relative to the canvas) of a world point. */
  toScreen(x: number, y: number) {
    return { x: x - this.cam.x, y: y - this.cam.y };
  }

  /** Centre of a sim position, in CSS pixels. */
  X = (u: number) => (u / UNIT) * this.t + this.t / 2;
  Y = (u: number) => (u / UNIT) * this.t + this.t / 2 + this.lift;
  /** Top-left of a floor tile. */
  private tx = (x: number) => x * this.t;
  private ty = (y: number) => y * this.t + this.lift;

  faceReady() {
    this.buildFaces();
  }

  private floorOf(x: number, y: number): Floor {
    for (const r of this.level.rooms) if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return r.floor;
    return 'tile';
  }

  // ---------- static layer ----------

  private buildBase() {
    const { t, lift, level, dpr } = this;
    const c = canvas(level.w * t * dpr, (level.h * t + lift) * dpr);
    const g = c.getContext('2d')!;
    g.scale(dpr, dpr);
    g.fillStyle = '#120f24';
    g.fillRect(0, 0, level.w * t, level.h * t + lift);

    // Floors.
    for (let y = 0; y < level.h; y++)
      for (let x = 0; x < level.w; x++) {
        if (tileAt(level, x, y) === Tile.Wall) continue;
        this.floorTile(g, x, y, tileAt(level, x, y) === Tile.Exit ? 'exit' : this.floorOf(x, y));
      }
    for (const r of level.rooms) this.roomTrim(g, r.x, r.y, r.w, r.h, r.floor);

    // Guard routes: faint dotted lines, so you can plan.
    g.save();
    g.setLineDash([2, t * 0.28]);
    g.lineCap = 'round';
    g.lineWidth = Math.max(2, t * 0.07);
    g.strokeStyle = 'rgba(255, 226, 140, 0.22)';
    for (const route of level.guards) {
      if (route.path.length < 2) continue;
      g.beginPath();
      route.path.forEach(([x, y], i) => {
        const px = this.tx(x) + t / 2;
        const py = this.ty(y) + t / 2;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      });
      g.closePath();
      g.stroke();
    }
    g.restore();

    // Soft shadow on the floor under each wall's front face.
    for (let y = 0; y < level.h - 1; y++)
      for (let x = 0; x < level.w; x++) {
        if (tileAt(level, x, y) !== Tile.Wall || tileAt(level, x, y + 1) === Tile.Wall) continue;
        const top = this.ty(y + 1);
        const grad = g.createLinearGradient(0, top, 0, top + t * 0.45);
        grad.addColorStop(0, 'rgba(5, 3, 15, 0.55)');
        grad.addColorStop(1, 'rgba(5, 3, 15, 0)');
        g.fillStyle = grad;
        g.fillRect(this.tx(x), top, t, t * 0.45);
      }

    // Furniture.
    for (let y = 0; y < level.h; y++)
      for (let x = 0; x < level.w; x++) {
        const k = tileAt(level, x, y);
        if (k === Tile.Desk) this.desk(g, x, y);
        if (k === Tile.Pillar) this.pillar(g, x, y);
        if (k === Tile.Plant) this.plant(g, x, y);
      }

    // Walls, row by row so front faces sit over the floor below.
    for (let y = 0; y < level.h; y++) for (let x = 0; x < level.w; x++) if (tileAt(level, x, y) === Tile.Wall) this.wall(g, x, y);
    this.exitSign(g);
    for (const l of level.lasers) if (l.on > 0) this.laserPosts(g, l.x, l.y, l.across);
    for (const cam of level.cameras) this.cameraBody(g, cam.x, cam.y);
    this.base = c;

  }

  private floorTile(g: CanvasRenderingContext2D, x: number, y: number, floor: Floor | 'exit') {
    const { t } = this;
    const px = this.tx(x);
    const py = this.ty(y);
    if (floor === 'exit') {
      const grad = g.createLinearGradient(0, py, 0, py + t);
      grad.addColorStop(0, '#163a2c');
      grad.addColorStop(1, '#0a1a14');
      g.fillStyle = grad;
      g.fillRect(px, py, t, t);
      return;
    }
    const f = FLOORS[floor];
    const alt = (x + y) % 2 === 0;
    g.fillStyle = alt ? f.a : f.b;
    g.fillRect(px, py, t, t);
    const r = hash(x, y);
    switch (floor) {
      case 'tile':
        g.strokeStyle = 'rgba(0, 0, 0, 0.28)';
        g.lineWidth = 1;
        g.strokeRect(px + 0.5, py + 0.5, t - 1, t - 1);
        g.fillStyle = 'rgba(255, 255, 255, 0.025)';
        g.fillRect(px + 2, py + 2, t * 0.5, 1.5);
        break;
      case 'carpet':
        g.fillStyle = 'rgba(255, 200, 120, 0.07)';
        g.beginPath();
        g.moveTo(px + t / 2, py + t * 0.28);
        g.lineTo(px + t * 0.72, py + t / 2);
        g.lineTo(px + t / 2, py + t * 0.72);
        g.lineTo(px + t * 0.28, py + t / 2);
        g.closePath();
        g.fill();
        break;
      case 'wood': {
        g.fillStyle = (y % 2 === 0) === r > 0.5 ? '#553826' : '#4b3122';
        g.fillRect(px, py, t, t);
        g.strokeStyle = 'rgba(0, 0, 0, 0.3)';
        g.lineWidth = 1;
        for (let i = 1; i < 3; i++) {
          g.beginPath();
          g.moveTo(px, py + (t * i) / 3);
          g.lineTo(px + t, py + (t * i) / 3);
          g.stroke();
        }
        const j = px + t * (0.2 + r * 0.6);
        g.beginPath();
        g.moveTo(j, py);
        g.lineTo(j, py + t / 3);
        g.stroke();
        break;
      }
      case 'gold':
        g.strokeStyle = 'rgba(255, 220, 120, 0.12)';
        g.lineWidth = 1;
        g.strokeRect(px + 2.5, py + 2.5, t - 5, t - 5);
        if (r > 0.7) {
          g.fillStyle = 'rgba(255, 236, 170, 0.12)';
          g.fillRect(px + t * 0.2, py + t * 0.2, t * 0.12, t * 0.12);
        }
        break;
      case 'steel':
        g.fillStyle = 'rgba(255, 255, 255, 0.06)';
        for (let i = 0; i < 2; i++)
          for (let j = 0; j < 2; j++) {
            g.beginPath();
            g.ellipse(px + t * (0.25 + i * 0.5), py + t * (0.25 + j * 0.5), t * 0.1, t * 0.035, Math.PI / 4, 0, Math.PI * 2);
            g.fill();
          }
        g.strokeStyle = 'rgba(0, 0, 0, 0.3)';
        g.strokeRect(px + 0.5, py + 0.5, t - 1, t - 1);
        break;
    }
  }

  private roomTrim(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, floor: Floor) {
    if (floor !== 'carpet' && floor !== 'gold') return;
    const { t } = this;
    g.save();
    g.strokeStyle = floor === 'carpet' ? 'rgba(214, 160, 70, 0.55)' : 'rgba(255, 214, 102, 0.35)';
    g.lineWidth = Math.max(1.5, t * 0.05);
    g.strokeRect(this.tx(x) + t * 0.14, this.ty(y) + t * 0.14, w * t - t * 0.28, h * t - t * 0.28);
    g.lineWidth = 1;
    g.strokeRect(this.tx(x) + t * 0.22, this.ty(y) + t * 0.22, w * t - t * 0.44, h * t - t * 0.44);
    g.restore();
    if (floor === 'gold') this.emblem(g, this.tx(x) + (w * t) / 2, this.ty(y) + (h * t) / 2, Math.min(w, h) * t * 0.42);
  }

  /** The owning gang's mark on the vault floor. */
  private emblem(g: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
    g.save();
    g.globalAlpha = 0.35;
    g.fillStyle = this.gang.color;
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
    g.globalAlpha = 0.5;
    g.strokeStyle = '#ffd666';
    g.lineWidth = 2;
    g.stroke();
    g.restore();
  }

  private wall(g: CanvasRenderingContext2D, x: number, y: number) {
    const { t, lift, level } = this;
    const px = this.tx(x);
    const top = this.ty(y) - lift;
    const isWall = (dx: number, dy: number) => tileAt(level, x + dx, y + dy) === Tile.Wall;
    // Top face.
    g.fillStyle = '#41367a';
    g.fillRect(px, top, t, t);
    g.fillStyle = 'rgba(255, 255, 255, 0.04)';
    if ((x + y) % 2 === 0) g.fillRect(px, top, t, t);
    // Front face, where the floor below is open.
    if (!isWall(0, 1) && y < level.h - 1) {
      const fy = top + t;
      g.fillStyle = '#271f52';
      g.fillRect(px, fy, t, lift);
      g.fillStyle = 'rgba(0, 0, 0, 0.22)';
      for (let i = 1; i < 4; i++) g.fillRect(px + (t * i) / 4, fy + 2, 1, lift - 3);
      g.fillStyle = this.gang.color;
      g.globalAlpha = 0.75;
      g.fillRect(px, fy + lift * 0.55, t, Math.max(2, lift * 0.16));
      g.globalAlpha = 1;
      g.fillStyle = INK;
      g.fillRect(px, fy + lift - 2, t, 2);
    }
    // Outlines where the wall meets open floor.
    g.fillStyle = INK;
    const lw = 2;
    if (!isWall(0, -1)) g.fillRect(px, top, t, lw);
    if (!isWall(-1, 0)) g.fillRect(px, top, lw, t + (isWall(0, 1) ? 0 : lift));
    if (!isWall(1, 0)) g.fillRect(px + t - lw, top, lw, t + (isWall(0, 1) ? 0 : lift));
    if (!isWall(0, 1)) g.fillRect(px, top + t - 1, t, lw);
    // Highlight just inside the top-left edges.
    g.fillStyle = 'rgba(160, 140, 255, 0.35)';
    if (!isWall(0, -1)) g.fillRect(px + (isWall(-1, 0) ? 0 : lw), top + lw, t - (isWall(-1, 0) ? 0 : lw) - (isWall(1, 0) ? 0 : lw), 1.5);
    if (!isWall(-1, 0)) g.fillRect(px + lw, top + lw, 1.5, t - lw * 2);
  }

  private desk(g: CanvasRenderingContext2D, x: number, y: number) {
    const { t } = this;
    const px = this.tx(x) + t * 0.06;
    const py = this.ty(y) + t * 0.14;
    const w = t * 0.88;
    const h = t * 0.62;
    const lip = t * 0.18;
    g.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(g, px + 2, py + 4, w, h + lip, 4);
    g.fill();
    g.fillStyle = '#6b4227';
    roundRect(g, px, py + lip * 0.5, w, h + lip * 0.5, 4);
    g.fill();
    g.fillStyle = '#8a5a35';
    roundRect(g, px, py, w, h, 4);
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = INK;
    roundRect(g, px, py, w, h + lip * 0.5, 4);
    g.stroke();
    // Paper and a lamp.
    g.fillStyle = '#efe9d6';
    g.fillRect(px + w * 0.12, py + h * 0.22, w * 0.3, h * 0.45);
    g.fillStyle = '#ffd666';
    g.beginPath();
    g.arc(px + w * 0.74, py + h * 0.42, t * 0.11, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = INK;
    g.lineWidth = 1.5;
    g.stroke();
  }

  private pillar(g: CanvasRenderingContext2D, x: number, y: number) {
    const { t, lift } = this;
    const cx = this.tx(x) + t / 2;
    const base = this.ty(y) + t * 0.62;
    const r = t * 0.36;
    const hgt = lift * 1.8;
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath();
    g.ellipse(cx + 2, base + 4, r, r * 0.5, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#5a4f8f';
    g.fillRect(cx - r, base - hgt, r * 2, hgt);
    g.beginPath();
    g.ellipse(cx, base, r, r * 0.5, 0, 0, Math.PI);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(cx - r * 0.55, base - hgt, r * 0.25, hgt);
    g.fillStyle = '#7a6fb8';
    g.beginPath();
    g.ellipse(cx, base - hgt, r, r * 0.5, 0, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = INK;
    g.stroke();
    g.beginPath();
    g.moveTo(cx - r, base - hgt);
    g.lineTo(cx - r, base);
    g.ellipse(cx, base, r, r * 0.5, 0, Math.PI, 0, true);
    g.lineTo(cx + r, base - hgt);
    g.stroke();
  }

  private plant(g: CanvasRenderingContext2D, x: number, y: number) {
    const { t } = this;
    const cx = this.tx(x) + t / 2;
    const cy = this.ty(y) + t * 0.62;
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath();
    g.ellipse(cx + 2, cy + t * 0.22, t * 0.3, t * 0.12, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#b5532f';
    g.strokeStyle = INK;
    g.lineWidth = 2;
    roundRect(g, cx - t * 0.2, cy - t * 0.02, t * 0.4, t * 0.26, 3);
    g.fill();
    g.stroke();
    const leaves = [
      [-0.16, -0.12, 0.17],
      [0.15, -0.1, 0.16],
      [0, -0.26, 0.18],
      [-0.06, -0.04, 0.14],
    ] as const;
    for (const [dx, dy, r] of leaves) {
      g.fillStyle = '#2f9e5b';
      g.beginPath();
      g.arc(cx + dx * t, cy + dy * t, r * t, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.beginPath();
    g.arc(cx - t * 0.03, cy - t * 0.3, t * 0.06, 0, Math.PI * 2);
    g.fill();
  }

  private exitSign(g: CanvasRenderingContext2D) {
    const { t, lift } = this;
    const [x, y] = this.level.exit;
    const px = this.tx(x);
    const py = this.ty(y);
    // Door frame.
    g.fillStyle = INK;
    g.fillRect(px - 2, py - lift, 4, t + lift);
    g.fillRect(px + t - 2, py - lift, 4, t + lift);
    // Sign on the wall above.
    const sw = t * 0.86;
    const sh = lift + 4;
    const sx = px + (t - sw) / 2;
    const sy = py - lift - sh * 0.4;
    g.fillStyle = '#1fbf6a';
    roundRect(g, sx, sy, sw, sh, 3);
    g.fill();
    g.strokeStyle = INK;
    g.lineWidth = 2;
    g.stroke();
    g.fillStyle = '#eafff2';
    g.font = `${Math.round(sh * 0.72)}px ${this.font}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('EXIT', px + t / 2, sy + sh / 2 + 1);
  }

  private laserPosts(g: CanvasRenderingContext2D, x: number, y: number, across: boolean) {
    const { t } = this;
    const ends = across
      ? [
          [this.tx(x) + t * 0.04, this.ty(y) + t / 2],
          [this.tx(x) + t * 0.96, this.ty(y) + t / 2],
        ]
      : [
          [this.tx(x) + t / 2, this.ty(y) + t * 0.04],
          [this.tx(x) + t / 2, this.ty(y) + t * 0.96],
        ];
    for (const [ex, ey] of ends) {
      g.fillStyle = '#2a2a33';
      g.strokeStyle = INK;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(ex!, ey!, t * 0.1, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
  }

  private cameraBody(g: CanvasRenderingContext2D, x: number, y: number) {
    const { t, lift } = this;
    const cx = this.tx(x) + t / 2;
    const cy = this.ty(y) - lift + t * 0.3;
    g.fillStyle = '#d9d6e6';
    g.strokeStyle = INK;
    g.lineWidth = 2;
    roundRect(g, cx - t * 0.22, cy - t * 0.15, t * 0.44, t * 0.3, 4);
    g.fill();
    g.stroke();
  }

  // ---------- sprites ----------

  private buildSprites() {
    const { t, dpr } = this;
    const make = (name: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) => {
      const c = canvas(w * dpr, h * dpr);
      const g = c.getContext('2d')!;
      g.scale(dpr, dpr);
      draw(g);
      this.sprites[name] = c;
    };
    const s = t;
    make('coin', s, s, (g) => {
      const r = s * 0.16;
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.beginPath();
      g.ellipse(s / 2 + 1, s / 2 + r * 0.9, r, r * 0.45, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#c98a12';
      g.beginPath();
      g.arc(s / 2, s / 2 + 1.5, r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ffcf3f';
      g.beginPath();
      g.arc(s / 2, s / 2, r, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = 1.6;
      g.stroke();
      g.fillStyle = '#fff3b0';
      g.beginPath();
      g.arc(s / 2 - r * 0.35, s / 2 - r * 0.35, r * 0.3, 0, Math.PI * 2);
      g.fill();
    });
    make('cash', s, s, (g) => {
      const w = s * 0.56;
      const h = s * 0.32;
      const x = (s - w) / 2;
      const y = (s - h) / 2;
      g.fillStyle = 'rgba(0,0,0,0.35)';
      roundRect(g, x + 2, y + 5, w, h, 3);
      g.fill();
      for (let i = 2; i >= 0; i--) {
        g.fillStyle = i === 0 ? '#5fd17e' : '#3a9e57';
        roundRect(g, x, y + i * 2.2, w, h, 3);
        g.fill();
        g.strokeStyle = INK;
        g.lineWidth = 1.5;
        g.stroke();
      }
      g.strokeStyle = '#1f6b37';
      g.lineWidth = 1;
      g.strokeRect(x + 3, y + 3, w - 6, h - 6);
      g.fillStyle = '#1f6b37';
      g.font = `${Math.round(h * 0.8)}px ${this.font}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('$', s / 2, s / 2 + 1);
    });
    make('bag', s, s, (g) => {
      const cx = s / 2;
      const cy = s * 0.58;
      const r = s * 0.27;
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.beginPath();
      g.ellipse(cx + 2, cy + r * 0.8, r, r * 0.4, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#d8b06c';
      g.strokeStyle = INK;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(cx - r * 0.35, cy - r * 0.95);
      g.quadraticCurveTo(cx - r * 1.15, cy - r * 0.2, cx - r * 0.95, cy + r * 0.55);
      g.quadraticCurveTo(cx, cy + r * 1.1, cx + r * 0.95, cy + r * 0.55);
      g.quadraticCurveTo(cx + r * 1.15, cy - r * 0.2, cx + r * 0.35, cy - r * 0.95);
      g.closePath();
      g.fill();
      g.stroke();
      g.fillStyle = '#b8894a';
      g.beginPath();
      g.ellipse(cx, cy - r * 1.02, r * 0.5, r * 0.22, 0, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = '#5a3d17';
      g.font = `${Math.round(r * 1.1)}px ${this.font}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('$', cx, cy + r * 0.12);
    });
  }

  private buildFaces() {
    const { t, dpr } = this;
    const face = (img: HTMLImageElement, ring: string, cap: boolean): Face | undefined => {
      if (!img.complete || !img.naturalWidth) return undefined;
      // Your Chog is drawn a little bigger than a tile so its face reads on a phone.
      const d = Math.round(t * (cap ? 1 : 1.3));
      const pad = cap ? Math.round(d * 0.35) : 4;
      const c = canvas((d + 8) * dpr, (d + pad + 4) * dpr);
      const g = c.getContext('2d')!;
      g.scale(dpr, dpr);
      const cx = (d + 8) / 2;
      const cy = pad + d / 2;
      const r = d / 2;
      g.save();
      g.beginPath();
      g.arc(cx, cy, r - 2, 0, Math.PI * 2);
      g.clip();
      // Crop toward the face: the art is a bust, so zoom in a little on the upper middle.
      const sw = img.naturalWidth * 0.78;
      g.drawImage(img, img.naturalWidth * 0.11, img.naturalHeight * 0.04, sw, sw, cx - r, cy - r, d, d);
      g.restore();
      g.lineWidth = 3;
      g.strokeStyle = ring;
      g.beginPath();
      g.arc(cx, cy, r - 2.5, 0, Math.PI * 2);
      g.stroke();
      g.lineWidth = 2;
      g.strokeStyle = INK;
      g.beginPath();
      g.arc(cx, cy, r - 0.5, 0, Math.PI * 2);
      g.stroke();
      if (cap) {
        // A guard's cap.
        const cw = d * 0.78;
        const ch = d * 0.34;
        const top = pad - ch * 0.55;
        g.fillStyle = '#1b2a52';
        g.strokeStyle = INK;
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(cx - cw / 2, top + ch);
        g.quadraticCurveTo(cx - cw / 2, top, cx, top);
        g.quadraticCurveTo(cx + cw / 2, top, cx + cw / 2, top + ch);
        g.closePath();
        g.fill();
        g.stroke();
        g.fillStyle = '#0d1428';
        roundRect(g, cx - cw * 0.58, top + ch - 2, cw * 1.16, ch * 0.32, 3);
        g.fill();
        g.stroke();
        g.fillStyle = '#ffd666';
        g.beginPath();
        g.arc(cx, top + ch * 0.5, ch * 0.2, 0, Math.PI * 2);
        g.fill();
        g.lineWidth = 1.5;
        g.stroke();
      }
      return { c, w: d + 8, h: d + pad + 4, cx, cy };
    };
    this.faces.player = face(this.images.player, '#ff4f9a', false);
    this.faces.guards = this.images.guards.map((img) => face(img, '#3b5bdb', true));
  }

  // ---------- frame ----------

  draw(s: HeistState, prev: Prev, alpha: number, fx: Fx, now: number) {
    const { g, t, level, dpr } = this;
    const W = this.worldW;
    const H = this.worldH;
    const SW = this.view.w;
    const SH = this.view.h;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#0b0918';
    g.fillRect(0, 0, SW, SH);

    const lerp = (a: number, b: number) => (Math.abs(b - a) > UNIT ? b : a + (b - a) * alpha);
    const px = this.X(lerp(prev.px, s.player.x));
    const py = this.Y(lerp(prev.py, s.player.y));
    const guards = s.guards.map((gd, i) => {
      const p = prev.guards[i] ?? gd;
      const da = ((gd.a - p.a + 96) % 64) - 32;
      return { gd, i, x: this.X(lerp(p.x, gd.x)), y: this.Y(lerp(p.y, gd.y)), a: (((p.a + da * alpha) % 64) + 64) % 64 };
    });
    const alarm = s.phase === 'alarm' || (s.phase === 'busted' && s.alarmBy !== null);

    const aim = this.aim(px, py);
    if (!this.cam.ready) Object.assign(this.cam, aim, { ready: true });
    else {
      this.cam.x += (aim.x - this.cam.x) * 0.14;
      this.cam.y += (aim.y - this.cam.y) * 0.14;
    }
    const ox = -this.cam.x + (fx.shake ? (Math.random() - 0.5) * fx.shake : 0);
    const oy = -this.cam.y + (fx.shake ? (Math.random() - 0.5) * fx.shake : 0);
    g.translate(ox, oy);
    g.drawImage(this.base, 0, 0, W, H);

    // Exit: chevrons pulling you out.
    {
      const [ex, ey] = level.exit;
      const cx = this.tx(ex) + t / 2;
      const top = this.ty(ey);
      g.save();
      g.strokeStyle = '#5dffa8';
      g.lineWidth = Math.max(2, t * 0.08);
      g.lineCap = 'round';
      g.lineJoin = 'round';
      for (let i = 0; i < 2; i++) {
        const k = ((now / 700 + i / 2) % 1);
        g.globalAlpha = Math.sin(k * Math.PI) * (s.carried > 0 ? 1 : 0.35);
        const y0 = top + t * (0.2 + k * 0.5);
        g.beginPath();
        g.moveTo(cx - t * 0.18, y0);
        g.lineTo(cx, y0 + t * 0.16);
        g.lineTo(cx + t * 0.18, y0);
        g.stroke();
      }
      g.restore();
    }

    // Safes.
    level.safes.forEach((sf, i) => this.safe(g, sf.x, sf.y, s.safes[i]!.open, now));

    // People, back to front.
    const people: { y: number; draw: () => void }[] = guards.map((gu) => ({
      y: gu.y,
      draw: () => this.guard(g, gu.x, gu.y, gu.i, gu.gd.stun > 0, now),
    }));
    people.push({ y: py, draw: () => this.player(g, px, py, s, now) });
    people.sort((a, b) => a.y - b.y);
    for (const p of people) p.draw();

    // Darkness, with every light cut out of it.
    const d = this.dark.getContext('2d')!;
    d.setTransform(dpr, 0, 0, dpr, 0, 0);
    d.globalCompositeOperation = 'source-over';
    d.clearRect(0, 0, SW, SH);
    d.fillStyle = alarm ? 'rgba(28, 2, 12, 0.55)' : 'rgba(6, 4, 20, 0.5)';
    d.fillRect(0, 0, SW, SH);
    d.translate(ox, oy);
    d.globalCompositeOperation = 'destination-out';
    const hole = (x: number, y: number, r: number, k = 1) => {
      const gr = d.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(0,0,0,${k})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      d.fillStyle = gr;
      d.fillRect(x - r, y - r, r * 2, r * 2);
    };
    hole(px, py, t * 2.1, s.player.hide > 0 ? 0.4 : 0.9);
    hole(this.tx(level.exit[0]) + t / 2, this.ty(level.exit[1]), t * 1.6, 0.8);
    level.safes.forEach((sf, i) => hole(this.tx(sf.x) + t / 2, this.ty(sf.y) + t / 2, t * 1.7, s.safes[i]!.open ? 0.5 : 0.75));
    for (let y = 0; y < level.h; y++)
      for (let x = 0; x < level.w; x++)
        if (tileAt(level, x, y) === Tile.Desk) hole(this.tx(x) + t * 0.7, this.ty(y) + t * 0.4, t * 1.1, 0.55);
    for (const gu of guards) hole(gu.x, gu.y, t * 0.9, 0.6);

    const cones: { x: number; y: number; a: number; range: number; tint: string; poly: [number, number][] }[] = [];
    for (const gu of guards) {
      if (gu.gd.stun > 0) continue;
      const range = ((gu.gd.mode === 'chase' ? CHASE_RANGE : SEE_RANGE) / UNIT) * t;
      const k = gu.gd.sus / SPOT;
      const tint = gu.gd.mode === 'chase' ? '255, 70, 70' : k > 0 ? `255, ${Math.round(226 - 120 * k)}, ${Math.round(122 - 80 * k)}` : '255, 226, 122';
      cones.push({ x: gu.x, y: gu.y, a: gu.a, range, tint, poly: this.cone(gu.x, gu.y, gu.a, range) });
    }
    if (s.hacked === 0 && s.phase === 'play')
      level.cameras.forEach((_, i) => {
        if (s.cameras[i]!.stun > 0) return;
        const v = cameraView(level, s, i);
        const x = this.X(v.x);
        const y = this.Y(v.y) - this.lift * 0.4;
        const range = (CAMERA_RANGE / UNIT) * t;
        const k = s.cameras[i]!.sus / SPOT;
        cones.push({ x, y, a: v.a, range, tint: k > 0 ? '255, 140, 120' : '170, 210, 255', poly: this.cone(x, y, v.a, range) });
      });
    for (const c of cones) {
      const gr = d.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.range);
      gr.addColorStop(0, 'rgba(0,0,0,1)');
      gr.addColorStop(0.75, 'rgba(0,0,0,0.85)');
      gr.addColorStop(1, 'rgba(0,0,0,0.1)');
      d.fillStyle = gr;
      this.fillPoly(d, c.poly);
    }
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(this.dark, 0, 0);
    g.restore();

    // Colour of the lights.
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const c of cones) {
      const gr = g.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.range);
      gr.addColorStop(0, `rgba(${c.tint}, 0.34)`);
      gr.addColorStop(1, `rgba(${c.tint}, 0.03)`);
      g.fillStyle = gr;
      this.fillPoly(g, c.poly);
    }
    g.restore();
    g.save();
    g.strokeStyle = 'rgba(255, 240, 190, 0.35)';
    g.lineWidth = 1;
    for (const c of cones) this.strokeEdges(g, c.poly);
    g.restore();

    // Loot glows in the dark so you can always see it.
    level.loot.forEach((l, i) => {
      if (s.taken[i]) return;
      const bob = Math.sin(now / 320 + l.x * 1.7 + l.y) * t * 0.04;
      const sp = this.sprites[l.kind]!;
      g.drawImage(sp, this.tx(l.x), this.ty(l.y) + bob, t, t);
      if (l.kind !== 'coin' || (now / 900 + l.x * 0.37 + l.y * 0.61) % 3 < 0.12) this.glint(g, this.tx(l.x) + t * 0.62, this.ty(l.y) + t * 0.36 + bob, t * 0.12, now);
    });

    // Lasers.
    level.lasers.forEach((l, i) => {
      const on = laserOn(level, s, i);
      const period = l.on + l.off;
      const into = (s.tick + l.phase) % period;
      const warn = l.on > 0 && !on && s.hacked === 0 && into > period - 18;
      if (!on && !warn) return;
      const x1 = l.across ? this.tx(l.x) + t * 0.08 : this.tx(l.x) + t / 2;
      const y1 = l.across ? this.ty(l.y) + t / 2 : this.ty(l.y) + t * 0.08;
      const x2 = l.across ? this.tx(l.x) + t * 0.92 : x1;
      const y2 = l.across ? y1 : this.ty(l.y) + t * 0.92;
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = '#ff2d55';
      g.shadowColor = '#ff2d55';
      g.shadowBlur = t * 0.5;
      g.globalAlpha = on ? 0.9 : 0.25 + 0.25 * Math.sin(now / 40);
      g.lineWidth = on ? t * 0.1 : t * 0.04;
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.stroke();
      if (on) {
        g.strokeStyle = '#ffd0da';
        g.lineWidth = t * 0.03;
        g.stroke();
      }
      g.restore();
    });

    // Camera lenses.
    level.cameras.forEach((cam, i) => {
      const off = s.hacked > 0 || s.cameras[i]!.stun > 0;
      const cx = this.tx(cam.x) + t / 2;
      const cy = this.ty(cam.y) - this.lift + t * 0.3;
      g.fillStyle = off ? '#55536a' : (now / 300) % 2 < 1 ? '#ff3b3b' : '#a01818';
      g.beginPath();
      g.arc(cx, cy, t * 0.08, 0, Math.PI * 2);
      g.fill();
    });

    // Safe progress and guard reactions.
    if (s.player.crack >= 0) {
      const sf = level.safes[s.player.crack]!;
      const k = s.safes[s.player.crack]!.progress / CRACK;
      const cx = this.tx(sf.x) + t / 2;
      const cy = this.ty(sf.y) + t * 0.35;
      g.save();
      g.lineWidth = Math.max(3, t * 0.12);
      g.strokeStyle = 'rgba(13, 11, 26, 0.85)';
      g.beginPath();
      g.arc(cx, cy, t * 0.42, 0, Math.PI * 2);
      g.stroke();
      g.strokeStyle = '#ffd666';
      g.lineCap = 'round';
      g.beginPath();
      g.arc(cx, cy, t * 0.42, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, k));
      g.stroke();
      g.restore();
    }
    for (const gu of guards) {
      if (gu.gd.stun > 0) this.stars(g, gu.x, gu.y - t * 0.55, now);
      else if (gu.gd.mode === 'chase') this.bubble(g, gu.x, gu.y - t * 0.85, '!', 1, '#ff3b3b', now);
      else if (gu.gd.sus > 0) this.bubble(g, gu.x, gu.y - t * 0.85, '?', gu.gd.sus / SPOT, '#ff9f1c', now);
      else if (gu.gd.mode === 'look') this.bubble(g, gu.x, gu.y - t * 0.85, '?', 0, '#ffffff', now);
    }
    s.cameras.forEach((c, i) => {
      if (c.sus <= 0 || s.hacked > 0) return;
      const cam = level.cameras[i]!;
      this.bubble(g, this.tx(cam.x) + t / 2, this.ty(cam.y) - this.lift - t * 0.35, '?', c.sus / SPOT, '#ff9f1c', now);
    });
    if (s.noise) {
      const nx = this.tx(s.noise.x) + t / 2;
      const ny = this.ty(s.noise.y) + t / 2;
      g.save();
      g.strokeStyle = '#ffffff';
      g.globalAlpha = 0.6;
      g.lineWidth = 2;
      const k = (now / 500) % 1;
      g.beginPath();
      g.arc(nx, ny, t * (0.2 + k * 0.8), 0, Math.PI * 2);
      g.stroke();
      g.restore();
    }

    fx.draw(g, t, this.font);

    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // When the exit is off screen and you have loot (or the alarm is on), an arrow at the edge points to it.
    if ((alarm || s.carried > 0) && s.phase !== 'escaped') {
      const ex = this.tx(level.exit[0]) + t / 2 - this.cam.x;
      const ey = this.ty(level.exit[1]) + t / 2 - this.cam.y;
      const m = 34;
      if (ex < m || ey < m || ex > SW - m || ey > SH - m) {
        const cx = SW / 2;
        const cy = SH / 2;
        const ang = Math.atan2(ey - cy, ex - cx);
        const k = Math.min(Math.abs((SW / 2 - m) / Math.cos(ang) || Infinity), Math.abs((SH / 2 - m) / Math.sin(ang) || Infinity));
        const ax = cx + Math.cos(ang) * k;
        const ay = cy + Math.sin(ang) * k;
        const pulse = 1 + 0.12 * Math.sin(now / 120);
        g.save();
        g.translate(ax, ay);
        g.rotate(ang);
        g.scale(pulse, pulse);
        g.fillStyle = alarm ? '#ff2d55' : '#1fbf6a';
        g.strokeStyle = INK;
        g.lineWidth = 2.5;
        g.beginPath();
        g.moveTo(18, 0);
        g.lineTo(-10, -14);
        g.lineTo(-4, 0);
        g.lineTo(-10, 14);
        g.closePath();
        g.fill();
        g.stroke();
        g.restore();
        g.save();
        g.font = `${14}px ${this.font}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.lineWidth = 3;
        g.strokeStyle = INK;
        const lx = ax - Math.cos(ang) * 30;
        const ly = ay - Math.sin(ang) * 26;
        g.strokeText('EXIT', lx, ly);
        g.fillStyle = '#ffffff';
        g.fillText('EXIT', lx, ly);
        g.restore();
      }
    }
    if (alarm) {
      const pulse = 0.5 + 0.5 * Math.sin(now / 160);
      const gr = g.createRadialGradient(SW / 2, SH / 2, Math.min(SW, SH) * 0.3, SW / 2, SH / 2, Math.max(SW, SH) * 0.75);
      gr.addColorStop(0, 'rgba(255, 30, 60, 0)');
      gr.addColorStop(1, `rgba(255, 30, 60, ${0.25 + 0.25 * pulse})`);
      g.fillStyle = gr;
      g.fillRect(0, 0, SW, SH);
    }
    if (fx.flash) {
      g.fillStyle = fx.flashColor;
      g.globalAlpha = fx.flash;
      g.fillRect(0, 0, SW, SH);
      g.globalAlpha = 1;
    }
  }

  private player(g: CanvasRenderingContext2D, x: number, y: number, s: HeistState, now: number) {
    const { t } = this;
    const moving = s.player.dir !== -1;
    const bob = moving ? Math.abs(Math.sin(now / 70)) * t * 0.08 : Math.sin(now / 500) * t * 0.02;
    const squash = moving ? 1 + Math.sin(now / 70) * 0.04 : 1;
    // Shadow.
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.beginPath();
    g.ellipse(x, y + t * 0.38, t * 0.34, t * 0.12, 0, 0, Math.PI * 2);
    g.fill();
    if (s.player.sprint > 0) {
      g.save();
      g.globalAlpha = 0.25;
      g.fillStyle = '#ff4f9a';
      const d = s.player.dir === -1 ? s.player.face : s.player.dir;
      for (let i = 1; i <= 3; i++) {
        g.beginPath();
        g.arc(x - DX[d] * t * 0.25 * i, y - DY[d] * t * 0.25 * i, t * 0.4 - i * 2, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    }
    if (s.player.tackle > 0) {
      g.save();
      g.strokeStyle = '#ff9f1c';
      g.lineWidth = 3;
      g.setLineDash([4, 4]);
      g.lineDashOffset = -now / 30;
      g.beginPath();
      g.arc(x, y - bob, t * 0.56, 0, Math.PI * 2);
      g.stroke();
      g.restore();
    }
    const face = this.faces.player;
    g.save();
    g.globalAlpha = s.player.hide > 0 ? 0.35 + 0.1 * Math.sin(now / 60) : 1;
    g.translate(x, y - bob);
    g.scale(squash, 2 - squash);
    if (face) g.drawImage(face.c, -face.cx, -face.cy, face.w, face.h); else {
      g.fillStyle = '#ff4f9a';
      g.beginPath();
      g.arc(0, 0, t * 0.44, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
    if (s.player.magnet > 0) {
      g.save();
      g.strokeStyle = 'rgba(255, 214, 102, 0.5)';
      g.lineWidth = 2;
      const k = (now / 400) % 1;
      g.beginPath();
      g.arc(x, y, t * (2.4 - k * 1.8), 0, Math.PI * 2);
      g.stroke();
      g.restore();
    }
  }

  private guard(g: CanvasRenderingContext2D, x: number, y: number, i: number, stunned: boolean, now: number) {
    const { t } = this;
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.beginPath();
    g.ellipse(x, y + t * 0.38, t * 0.34, t * 0.12, 0, 0, Math.PI * 2);
    g.fill();
    const face = this.faces.guards[i % Math.max(1, this.faces.guards.length)];
    const sway = stunned ? Math.sin(now / 120) * 0.15 : 0;
    g.save();
    g.translate(x, y);
    g.rotate(sway);
    if (face) g.drawImage(face.c, -face.cx, -face.cy, face.w, face.h); else {
      g.fillStyle = '#3b5bdb';
      g.beginPath();
      g.arc(0, 0, t * 0.44, 0, Math.PI * 2);
      g.fill();
    }
    if (stunned) {
      g.fillStyle = 'rgba(40, 40, 60, 0.45)';
      g.beginPath();
      g.arc(0, 0, t * 0.44, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }

  private safe(g: CanvasRenderingContext2D, x: number, y: number, open: boolean, now: number) {
    const { t, lift } = this;
    const px = this.tx(x) + t * 0.05;
    const w = t * 0.9;
    const top = this.ty(y) - lift * 0.6;
    const h = t * 0.62;
    const front = lift * 1.4;
    g.fillStyle = 'rgba(0,0,0,0.45)';
    roundRect(g, px + 3, top + h + front - 2, w, t * 0.18, 4);
    g.fill();
    // Body.
    g.fillStyle = '#5d6478';
    roundRect(g, px, top + h * 0.5, w, h * 0.5 + front, 5);
    g.fill();
    g.fillStyle = '#8c94ab';
    roundRect(g, px, top, w, h, 5);
    g.fill();
    g.strokeStyle = INK;
    g.lineWidth = 2;
    roundRect(g, px, top, w, h + front, 5);
    g.stroke();
    g.fillStyle = this.gang.color;
    g.fillRect(px + 2, top + h + front * 0.15, w - 4, Math.max(2, front * 0.18));
    const cx = px + w / 2;
    const cy = top + h + front * 0.6;
    if (!open) {
      // Dial on the front.
      g.fillStyle = '#c9cfdf';
      g.beginPath();
      g.arc(cx, cy - front * 0.05, front * 0.34, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.save();
      g.translate(cx, cy - front * 0.05);
      g.rotate(now / 900);
      g.fillStyle = INK;
      g.fillRect(-1, -front * 0.3, 2, front * 0.2);
      g.restore();
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(px + w * 0.12, top + h * 0.18, w * 0.5, 2);
    } else {
      g.fillStyle = '#14121f';
      roundRect(g, px + w * 0.16, top + h * 0.2, w * 0.68, h * 0.6, 3);
      g.fill();
      g.fillStyle = '#ffd666';
      for (let i = 0; i < 3; i++) this.glint(g, px + w * (0.3 + i * 0.2), top + h * 0.45, t * 0.06, now + i * 300);
    }
  }

  private glint(g: CanvasRenderingContext2D, x: number, y: number, r: number, now: number) {
    const k = 0.6 + 0.4 * Math.sin(now / 150 + x);
    g.save();
    g.fillStyle = `rgba(255, 255, 255, ${0.85 * k})`;
    g.beginPath();
    g.moveTo(x, y - r * 1.6 * k);
    g.lineTo(x + r * 0.35, y);
    g.lineTo(x, y + r * 1.6 * k);
    g.lineTo(x - r * 0.35, y);
    g.closePath();
    g.moveTo(x - r * 1.6 * k, y);
    g.lineTo(x, y + r * 0.35);
    g.lineTo(x + r * 1.6 * k, y);
    g.lineTo(x, y - r * 0.35);
    g.closePath();
    g.fill();
    g.restore();
  }

  private bubble(g: CanvasRenderingContext2D, x: number, y: number, mark: string, fill: number, color: string, now: number) {
    const { t } = this;
    const r = t * 0.26;
    const pop = mark === '!' ? 1 + 0.08 * Math.sin(now / 60) : 1;
    g.save();
    g.translate(x, y);
    g.scale(pop, pop);
    g.fillStyle = '#ffffff';
    g.strokeStyle = INK;
    g.lineWidth = 2;
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.fill();
    if (fill > 0) {
      g.save();
      g.clip();
      g.fillStyle = color;
      g.fillRect(-r, r - 2 * r * fill, 2 * r, 2 * r * fill);
      g.restore();
    }
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = INK;
    g.font = `${Math.round(r * 1.5)}px ${this.font}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(mark, 0, r * 0.08);
    g.restore();
  }

  private stars(g: CanvasRenderingContext2D, x: number, y: number, now: number) {
    const { t } = this;
    for (let i = 0; i < 3; i++) {
      const a = now / 300 + (i * Math.PI * 2) / 3;
      const sx = x + Math.cos(a) * t * 0.3;
      const sy = y + Math.sin(a) * t * 0.1;
      g.fillStyle = '#ffd666';
      g.strokeStyle = INK;
      g.lineWidth = 1.2;
      g.beginPath();
      for (let k = 0; k < 10; k++) {
        const rr = k % 2 === 0 ? t * 0.09 : t * 0.04;
        const aa = (k / 10) * Math.PI * 2 - Math.PI / 2;
        g.lineTo(sx + Math.cos(aa) * rr, sy + Math.sin(aa) * rr);
      }
      g.closePath();
      g.fill();
      g.stroke();
    }
  }

  /** The lit area of a flashlight: rays from (x, y) stopped by walls, pillars and safes. */
  private cone(x: number, y: number, a: number, range: number): [number, number][] {
    const { t, level, lift } = this;
    const [cx, cy] = ANGLES[Math.round(a) % 64]!;
    const mid = Math.atan2(cy, cx) + ((a - Math.round(a)) * Math.PI * 2) / 64;
    const n = 36;
    const pts: [number, number][] = [[x, y]];
    const ox = Math.floor(x / t);
    const oy = Math.floor((y - lift) / t);
    for (let i = 0; i <= n; i++) {
      const ang = mid - CONE + (2 * CONE * i) / n;
      const dx = Math.cos(ang);
      const dy = Math.sin(ang);
      let dist = range;
      for (let r = 0; r <= range; r += t / 8) {
        const tx = Math.floor((x + dx * r) / t);
        const ty = Math.floor((y + dy * r - lift) / t);
        if (tx === ox && ty === oy) continue;
        if (blocksLight(level, tx, ty)) {
          dist = r;
          break;
        }
      }
      pts.push([x + dx * dist, y + dy * dist]);
    }
    return pts;
  }

  private fillPoly(g: CanvasRenderingContext2D, pts: [number, number][]) {
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.fill();
  }

  private strokeEdges(g: CanvasRenderingContext2D, pts: [number, number][]) {
    if (pts.length < 3) return;
    g.beginPath();
    g.moveTo(pts[0]![0], pts[0]![1]);
    g.lineTo(pts[1]![0], pts[1]![1]);
    g.moveTo(pts[0]![0], pts[0]![1]);
    g.lineTo(pts.at(-1)![0], pts.at(-1)![1]);
    g.stroke();
  }
}
