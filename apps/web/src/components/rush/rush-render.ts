import { Tile, type Level } from '@chog-city/game/heist';
import { Cell, hunting, laserOn, type RushMap, type RushState } from '@chog-city/game/rush';
import { drawPiece } from '../chog/piece';
import type { Fx } from '../heist/fx';
import { VaultRenderer } from '../heist/render';

// Draws a Cash Rush run. The vault itself (floors, walls, furniture, the safe) comes from the heist's
// renderer; on top go the coins and cash, the loudspeakers, the laser gates, the exit, and everyone as game
// pieces: you, and the guards with their moods (hunting, patrolling, running scared, knocked out).

const INK = '#0d0b1a';

/** The maze as a heist level, so the heist renderer can draw its floors and walls. */
export function asLevel(m: RushMap): Level {
  const tiles = m.cells.map((c) =>
    c === Cell.Wall
      ? Tile.Wall
      : c === Cell.Safe
        ? Tile.Safe
        : c === Cell.Exit
          ? Tile.Exit
          : c === Cell.Desk
            ? Tile.Desk
            : c === Cell.Pillar
              ? Tile.Pillar
              : Tile.Floor,
  );
  return {
    id: m.id,
    rooms: m.rooms,
    w: m.w,
    h: m.h,
    tiles,
    start: [m.start.x, m.start.y],
    exit: [m.exit.x, m.exit.y],
    loot: [],
    safes: m.safe ? [{ x: m.safe.x, y: m.safe.y, value: 0 }] : [],
    guards: [],
    cameras: [],
    lasers: m.lasers.map((l) => ({ ...l, on: 1, off: 1, phase: 0 })),
    ticks: m.seconds * 30,
  };
}

/** Where everyone was last step, to draw smoothly between steps. */
export interface RushPrev {
  me: { x: number; y: number };
  guards: { x: number; y: number }[];
}
export const rushSnapshot = (s: RushState): RushPrev => ({
  me: { x: s.me.x, y: s.me.y },
  guards: s.guards.map((g) => ({ x: g.x, y: g.y })),
});

export class RushRenderer {
  readonly v: VaultRenderer;
  private g: CanvasRenderingContext2D;
  private cam = { x: 0, y: 0, ready: false };
  private view = { w: 0, h: 0 };
  private coinSprite: HTMLCanvasElement | null = null;
  private stackSprite: HTMLCanvasElement | null = null;

  constructor(
    private cv: HTMLCanvasElement,
    readonly map: RushMap,
    images: { player: HTMLImageElement; guards: HTMLImageElement[] },
    gang: { color: string },
  ) {
    this.v = new VaultRenderer(cv, asLevel(map), images, gang);
    this.g = cv.getContext('2d')!;
  }

  get t() {
    return this.v.t;
  }
  set font(f: string) {
    this.v.font = f;
  }

  resize(w: number, h: number) {
    this.v.resize(w, h);
    this.view = { w: Math.round(w), h: Math.round(h) };
    this.cam.ready = false;
    this.coinSprite = null;
    this.stackSprite = null;
  }

  faceReady() {
    this.v.faceReady();
  }

  /** Screen px (relative to the vault) of a position in tiles. */
  X = (x: number) => x * this.v.t;
  Y = (y: number) => y * this.v.t + this.v.lift;

  private coin() {
    if (this.coinSprite) return this.coinSprite;
    const { t, dpr } = this.v;
    const s = Math.ceil(t * 0.4);
    const c = document.createElement('canvas');
    c.width = c.height = s * dpr;
    const g = c.getContext('2d')!;
    g.scale(dpr, dpr);
    const r = s / 2 - 1.5;
    g.fillStyle = '#c98a14';
    g.beginPath();
    g.arc(s / 2, s / 2 + 1, r, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffd23f';
    g.beginPath();
    g.arc(s / 2, s / 2, r, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = INK;
    g.lineWidth = 1.5;
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.beginPath();
    g.ellipse(s / 2 - r * 0.3, s / 2 - r * 0.35, r * 0.3, r * 0.18, -0.5, 0, Math.PI * 2);
    g.fill();
    this.coinSprite = c;
    return c;
  }

  private stack() {
    if (this.stackSprite) return this.stackSprite;
    const { t, dpr } = this.v;
    const w = Math.ceil(t * 0.8);
    const h = Math.ceil(t * 0.62);
    const c = document.createElement('canvas');
    c.width = w * dpr;
    c.height = h * dpr;
    const g = c.getContext('2d')!;
    g.scale(dpr, dpr);
    for (let i = 0; i < 3; i++) {
      const y = h - 4 - i * (h * 0.22) - h * 0.22;
      g.fillStyle = i % 2 ? '#5fd17e' : '#7bd389';
      g.strokeStyle = INK;
      g.lineWidth = 1.5;
      g.beginPath();
      g.roundRect(2 + (i % 2) * 2, y, w - 6, h * 0.3, 3);
      g.fill();
      g.stroke();
      g.fillStyle = '#e6c35a';
      g.fillRect(w / 2 - 3 + (i % 2) * 2, y, 6, h * 0.3);
    }
    this.stackSprite = c;
    return c;
  }

  draw(
    s: RushState,
    prev: RushPrev,
    alpha: number,
    fx: Fx,
    now: number,
    opts: { defenders?: Set<number>; follow?: { x: number; y: number } } = {},
  ) {
    const { g, map } = this;
    const v = this.v;
    const t = v.t;
    const dpr = v.dpr;
    const SW = this.view.w;
    const SH = this.view.h;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#0b0918';
    g.fillRect(0, 0, SW, SH);
    const lerp = (a: number, b: number) => (Math.abs(b - a) > 1.5 ? b : a + (b - a) * alpha);
    const mx = this.X(lerp(prev.me.x, s.me.x));
    const my = this.Y(lerp(prev.me.y, s.me.y));

    // Camera on you, kept inside the vault.
    const W = map.w * t;
    const H = map.h * t + v.lift;
    const axis = (world: number, screen: number, at: number) =>
      world <= screen ? (world - screen) / 2 : Math.max(0, Math.min(world - screen, at - screen / 2));
    // The camera follows you, or the guard you steer when defending.
    const fx0 = opts.follow ? this.X(opts.follow.x) : mx;
    const fy0 = opts.follow ? this.Y(opts.follow.y) : my;
    const aim = { x: axis(W, SW, fx0), y: axis(H, SH, fy0) };
    if (!this.cam.ready) Object.assign(this.cam, aim, { ready: true });
    else {
      this.cam.x += (aim.x - this.cam.x) * 0.16;
      this.cam.y += (aim.y - this.cam.y) * 0.16;
    }
    const ox = -this.cam.x + (fx.shake ? (Math.random() - 0.5) * fx.shake : 0);
    const oy = -this.cam.y + (fx.shake ? (Math.random() - 0.5) * fx.shake : 0);
    g.translate(ox, oy);
    g.drawImage(v.base, 0, 0, W, H);

    // Exit: green chevrons, bright once you have something to leave with.
    {
      const cx = this.X(map.exit.x + 0.5);
      const top = this.Y(map.exit.y);
      g.save();
      g.strokeStyle = '#5dffa8';
      g.lineWidth = Math.max(2, t * 0.08);
      g.lineCap = 'round';
      g.lineJoin = 'round';
      for (let i = 0; i < 2; i++) {
        const k = (now / 700 + i / 2) % 1;
        g.globalAlpha = Math.sin(k * Math.PI) * (s.carried > 0 ? 1 : 0.3);
        const y0 = top + t * (0.2 + k * 0.5);
        g.beginPath();
        g.moveTo(cx - t * 0.18, y0);
        g.lineTo(cx, y0 + t * 0.16);
        g.lineTo(cx + t * 0.18, y0);
        g.stroke();
      }
      g.restore();
    }

    // Cash on the floor.
    const coin = this.coin();
    const cs = coin.width / dpr;
    map.coins.forEach((c, i) => {
      if (s.coins[i]) return;
      const bob = Math.sin(now / 300 + c.x * 0.7 + c.y) * t * 0.04;
      g.drawImage(coin, this.X(c.x + 0.5) - cs / 2, this.Y(c.y + 0.5) - cs / 2 + bob, cs, cs);
    });
    const stack = this.stack();
    const sw = stack.width / dpr;
    const sh = stack.height / dpr;
    map.stacks.forEach((c, i) => {
      if (s.stacks[i]) return;
      const bob = Math.sin(now / 260 + c.x) * t * 0.05;
      g.drawImage(stack, this.X(c.x + 0.5) - sw / 2, this.Y(c.y + 0.5) - sh / 2 + bob, sw, sh);
    });
    // Loudspeakers: grab one and the guards run.
    map.flips.forEach((f, i) => {
      if (s.flips[i]) return;
      this.speaker(this.X(f.x + 0.5), this.Y(f.y + 0.5), now);
    });

    // Laser gates.
    map.lasers.forEach((l, i) => {
      const on = laserOn(s, i);
      const x = this.X(l.x);
      const y = this.Y(l.y);
      g.save();
      if (on) {
        const flick = 0.75 + 0.25 * Math.sin(now / 40 + i);
        g.strokeStyle = `rgba(255, 45, 85, ${flick})`;
        g.lineWidth = t * 0.12;
        g.shadowColor = '#ff2d55';
        g.shadowBlur = t * 0.4;
        g.beginPath();
        if (l.across) {
          g.moveTo(x, y + t / 2);
          g.lineTo(x + t, y + t / 2);
        } else {
          g.moveTo(x + t / 2, y);
          g.lineTo(x + t / 2, y + t);
        }
        g.stroke();
        g.shadowBlur = 0;
        g.strokeStyle = '#ffffff';
        g.lineWidth = t * 0.035;
        g.stroke();
      } else {
        g.strokeStyle = 'rgba(255, 45, 85, 0.18)';
        g.setLineDash([3, 5]);
        g.lineWidth = 2;
        g.beginPath();
        if (l.across) {
          g.moveTo(x, y + t / 2);
          g.lineTo(x + t, y + t / 2);
        } else {
          g.moveTo(x + t / 2, y);
          g.lineTo(x + t / 2, y + t);
        }
        g.stroke();
      }
      g.restore();
    });

    // The safe, with a bouncing marker until it's open.
    if (map.safe && s.safe) {
      v.safe(g, map.safe.x, map.safe.y, s.safe.open, now);
      if (!s.safe.open && !s.safe.dialing) {
        const cx = this.X(map.safe.x + 0.5);
        const by = this.Y(map.safe.y) - v.lift - t * 0.35 - Math.abs(Math.sin(now / 260)) * t * 0.22;
        g.fillStyle = '#ffd666';
        g.strokeStyle = INK;
        g.lineWidth = 2;
        g.lineJoin = 'round';
        g.beginPath();
        g.moveTo(cx - t * 0.26, by - t * 0.3);
        g.lineTo(cx + t * 0.26, by - t * 0.3);
        g.lineTo(cx, by);
        g.closePath();
        g.fill();
        g.stroke();
      }
    }
    if (s.noise) {
      const nx = this.X(s.noise.x);
      const ny = this.Y(s.noise.y);
      const k = (now / 500) % 1;
      g.save();
      g.strokeStyle = '#ffffff';
      g.globalAlpha = 0.6 * (1 - k);
      g.lineWidth = 2;
      g.beginPath();
      g.arc(nx, ny, t * (0.3 + k * 1.2), 0, Math.PI * 2);
      g.stroke();
      g.restore();
    }

    // Everyone, back to front.
    const hunt = hunting(s) || s.alarm > 0;
    const people: { y: number; draw: () => void }[] = s.guards.map((gd, i) => {
      const p = prev.guards[i] ?? gd;
      const x = this.X(lerp(p.x, gd.x));
      const y = this.Y(lerp(p.y, gd.y));
      return { y, draw: () => this.guard(x, y, i, s, now, hunt, opts.defenders?.has(i) ?? false) };
    });
    people.push({ y: my, draw: () => this.player(mx, my, s, now) });
    people.sort((a, b) => a.y - b.y);
    for (const p of people) p.draw();

    fx.draw(g, t, v.font);

    // Screen-space: a soft dark edge, red when the alarm rings, blue in a flip.
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const edge = s.alarm > 0 ? '255, 30, 60' : s.flip > 0 ? '60, 140, 255' : '5, 3, 15';
    const pulse = s.alarm > 0 || s.flip > 0 ? 0.5 + 0.5 * Math.sin(now / 160) : 0.6;
    const gr = g.createRadialGradient(
      SW / 2,
      SH / 2,
      Math.min(SW, SH) * 0.35,
      SW / 2,
      SH / 2,
      Math.max(SW, SH) * 0.78,
    );
    gr.addColorStop(0, `rgba(${edge}, 0)`);
    gr.addColorStop(1, `rgba(${edge}, ${0.2 + 0.25 * pulse})`);
    g.fillStyle = gr;
    g.fillRect(0, 0, SW, SH);
    // When the exit is off screen and you're carrying, an arrow at the edge points to it.
    if (s.carried > 0 && s.phase === 'play') this.exitArrow(SW, SH, now);
    if (fx.flash) {
      g.fillStyle = fx.flashColor;
      g.globalAlpha = fx.flash;
      g.fillRect(0, 0, SW, SH);
      g.globalAlpha = 1;
    }
  }

  private speaker(x: number, y: number, now: number) {
    const { g } = this;
    const t = this.v.t;
    const pulse = 1 + 0.12 * Math.sin(now / 140);
    g.save();
    g.translate(x, y - t * 0.08);
    g.scale(pulse, pulse);
    g.strokeStyle = 'rgba(120,190,255,0.55)';
    g.lineWidth = 2;
    for (let i = 1; i <= 2; i++) {
      const k = ((now / 600 + i / 2) % 1) * t * 0.35;
      g.beginPath();
      g.arc(t * 0.12, 0, t * 0.18 + k, -0.7, 0.7);
      g.stroke();
    }
    g.fillStyle = '#3a86ff';
    g.strokeStyle = INK;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(-t * 0.26, -t * 0.1);
    g.lineTo(-t * 0.08, -t * 0.1);
    g.lineTo(t * 0.18, -t * 0.26);
    g.lineTo(t * 0.18, t * 0.26);
    g.lineTo(-t * 0.08, t * 0.1);
    g.lineTo(-t * 0.26, t * 0.1);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }

  private player(x: number, y: number, s: RushState, now: number) {
    const { g } = this;
    const t = this.v.t;
    const piece = this.v.pieceOf('player');
    const flashing = s.safeTime > 0 && Math.floor(now / 90) % 2 === 0;
    if (s.fx.sprint > 0 || s.fx.tackle > 0) {
      g.save();
      g.globalAlpha = 0.25;
      g.fillStyle = s.fx.tackle > 0 ? '#ff9f1c' : '#ff4f9a';
      g.beginPath();
      g.arc(x, y, t * 0.6, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    if (s.fx.magnet > 0) {
      g.save();
      g.strokeStyle = 'rgba(255, 214, 102, 0.5)';
      g.lineWidth = 2;
      const k = (now / 400) % 1;
      g.beginPath();
      g.arc(x, y, t * (2.5 - k * 2), 0, Math.PI * 2);
      g.stroke();
      g.restore();
    }
    if (piece)
      drawPiece(
        g,
        piece,
        x,
        y + t * 0.3,
        {
          moving: s.me.dir !== -1,
          seed: 0,
          face: s.me.face,
          alpha: s.fx.hide > 0 ? 0.4 : flashing ? 0.35 : 1,
        },
        now,
      );
  }

  private guard(x: number, y: number, i: number, s: RushState, now: number, hunt: boolean, human: boolean) {
    const { g } = this;
    const t = this.v.t;
    const gd = s.guards[i]!;
    const piece = this.v.pieceOf(i);
    // A coloured ring at the feet: red hunting, blue scared, gold for a real player.
    const ring = gd.mode === 'panic' ? '#3a86ff' : gd.mode === 'hunt' ? '#ff2d55' : human ? '#ffd23f' : null;
    if (ring && gd.mode !== 'out') {
      g.save();
      g.strokeStyle = ring;
      g.globalAlpha = 0.85;
      g.lineWidth = 3;
      g.beginPath();
      g.ellipse(x, y + t * 0.42, t * 0.42, t * 0.15, 0, 0, Math.PI * 2);
      g.stroke();
      g.restore();
    }
    const scared = gd.mode === 'panic';
    const wob = scared ? Math.sin(now / 40 + i) * t * 0.04 : 0;
    g.save();
    if (gd.mode === 'out') {
      g.translate(x, y + t * 0.3);
      g.rotate(0.5);
      g.translate(-x, -(y + t * 0.3));
    }
    if (piece)
      drawPiece(
        g,
        piece,
        x + wob,
        y + t * 0.3,
        {
          moving: gd.dir !== -1 && gd.mode !== 'out',
          seed: i * 0.37,
          face: gd.face,
          alpha: gd.mode === 'out' ? 0.6 : 1,
        },
        now,
      );
    g.restore();
    if (scared) {
      g.save();
      g.globalAlpha = 0.35;
      g.fillStyle = '#3a86ff';
      g.beginPath();
      g.arc(x, y - t * 0.15, t * 0.5, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    const top = y - t * 1.1;
    if (gd.mode === 'out') this.v.stars(g, x, top + t * 0.2, now);
    else if (gd.mode === 'hunt' && hunt) this.v.bubble(g, x, top, '!', 1, '#ff2d55', now);
    else if (scared) this.v.bubble(g, x, top, '!', 0, '#3a86ff', now);
    if (human) {
      g.save();
      g.font = `${Math.round(t * 0.26)}px ${this.v.font}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 3;
      g.strokeStyle = INK;
      g.strokeText('PLAYER', x, top - t * 0.4);
      g.fillStyle = '#ffd23f';
      g.fillText('PLAYER', x, top - t * 0.4);
      g.restore();
    }
  }

  private exitArrow(SW: number, SH: number, now: number) {
    const { g, map } = this;
    const t = this.v.t;
    const ex = this.X(map.exit.x + 0.5) - this.cam.x;
    const ey = this.Y(map.exit.y + 0.5) - this.cam.y;
    const m = 34;
    if (ex >= m && ey >= m && ex <= SW - m && ey <= SH - m) return;
    const cx = SW / 2;
    const cy = SH / 2;
    const ang = Math.atan2(ey - cy, ex - cx);
    const k = Math.min(
      Math.abs((SW / 2 - m) / Math.cos(ang) || Infinity),
      Math.abs((SH / 2 - m) / Math.sin(ang) || Infinity),
    );
    const ax = cx + Math.cos(ang) * k;
    const ay = cy + Math.sin(ang) * k;
    const pulse = 1 + 0.12 * Math.sin(now / 120);
    g.save();
    g.translate(ax, ay);
    g.rotate(ang);
    g.scale(pulse, pulse);
    g.fillStyle = '#1fbf6a';
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
    void t;
  }

  /** Screen position (CSS px) of a position in tiles, for the dial and labels drawn over the canvas. */
  toScreen(x: number, y: number) {
    return { x: this.X(x) - this.cam.x, y: this.Y(y) - this.cam.y };
  }
}
