import { FIGHT, FIGHT_TPS, type FightEvent, type FightState } from '@chog-city/game/fight';
import { drawPiece, makePiece, type Piece } from '../chog/piece';

// Fight Night on a canvas: a ring in a dark basement under one hanging lamp, a crowd of Chogs around it, and
// two Chogs on their bases. Everything that makes a hit land is here: the burst, the freeze (from the fight
// itself), the shake, the card spinning off when it flies, the ropes wobbling when someone bounces. The ring
// is drawn until its pictures (docs/art-season2.md) are in.

const INK = '#0d0b1a';
/** Your number goes white → yellow → orange → red as it climbs, as in Smash. */
export function pctColor(p: number) {
  const stops: [number, [number, number, number]][] = [
    [0, [255, 255, 255]],
    [50, [255, 226, 90]],
    [100, [255, 140, 40]],
    [150, [240, 40, 50]],
    [220, [150, 10, 30]],
  ];
  let i = 0;
  while (i < stops.length - 2 && p > stops[i + 1]![0]) i++;
  const [a, ca] = stops[i]!;
  const [b, cb] = stops[i + 1]!;
  const t = Math.max(0, Math.min(1, (p - a) / (b - a)));
  const c = ca.map((v, k) => Math.round(v + (cb[k]! - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

interface Burst {
  x: number;
  y: number;
  at: number;
  strong: boolean;
}
interface Popup {
  x: number;
  y: number;
  at: number;
  text: string;
  color: string;
}
interface Beam {
  x: number;
  y: number;
  tx: number;
  ty: number;
  at: number;
}
interface Puff {
  x: number;
  y: number;
  at: number;
  r: number;
}

export interface FightLooks {
  /** Base colours: you and them. */
  colors: [string, string];
  /** Which side is you (gets the gold rim). */
  me: 0 | 1;
}

export class FightRender {
  private g: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private k = 40;
  /** Where the ring's middle sits on screen (y), and how big the cards are (in tiles). */
  private cy = 0;
  private cardTiles = 1.18;
  private pieces: [Piece | null, Piece | null] = [null, null];
  private crowdPieces: Piece[] = [];
  private crowd: { x: number; y: number; seed: number; i: number }[] = [];
  private bursts: Burst[] = [];
  private popups: Popup[] = [];
  private beams: Beam[] = [];
  private puffs: Puff[] = [];
  /** Screen shake: how hard, and when it started. */
  private shake = { amp: 0, at: 0 };
  /** Rope wobble per side (left, right, top, bottom): when it was hit. */
  private ropeHit = [0, 0, 0, 0];
  private cheer = 0;
  /** When each fighter went out, and its spin. */
  private outAt: [number, number] = [0, 0];
  private stamp: { at: number; who: 0 | 1; text: string } | null = null;
  private body = '';

  constructor(
    private canvas: HTMLCanvasElement,
    private imgs: [HTMLImageElement | undefined, HTMLImageElement | undefined],
    private crowdImgs: HTMLImageElement[],
    private looks: FightLooks,
  ) {
    this.g = canvas.getContext('2d')!;
    this.body = getComputedStyle(document.body).getPropertyValue('--font-brand').trim() || 'Impact, sans-serif';
  }

  resize(w: number, h: number, dpr: number) {
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    // A wide screen fits the ring plus room to fly out. A phone held upright fits the ring across its width
    // (whoever flies out leaves the screen) and sits it above the buttons.
    const upright = h > w * 1.2;
    this.k = upright ? w / 9.6 : Math.min(w / 11, h / 11.2);
    this.cy = upright ? h * 0.43 : h * 0.53;
    this.cardTiles = upright ? 1.32 : 1.18;
    this.rebuild();
  }

  /** Pictures that finished loading after the start. */
  rebuild() {
    const size = Math.round(this.k * this.cardTiles);
    this.pieces = [0, 1].map((i) =>
      makePiece(this.imgs[i], { base: this.looks.colors[i]!, size, gold: i === this.looks.me }, this.dpr),
    ) as [Piece, Piece];
    const cs = Math.round(this.k * 0.7);
    this.crowdPieces = this.crowdImgs.map((img, i) =>
      makePiece(img, { base: ['#3b3552', '#4a3b2f', '#2f3f4a'][i % 3]!, size: cs }, this.dpr),
    );
    // The crowd stands around the ring, three deep at the back, two at the sides, one at the front.
    this.crowd = [];
    let n = 0;
    const R = FIGHT.ring + 1.2;
    const add = (x: number, y: number) => this.crowd.push({ x, y, seed: (n * 0.37) % 1, i: n++ % Math.max(1, this.crowdPieces.length) });
    for (let row = 0; row < 2; row++) for (let x = -R + 0.4; x <= R; x += 1.55) add(x + (row % 2) * 0.75, -R - 0.2 - row * 0.8);
    for (let y = -R + 1.2; y <= R - 0.8; y += 1.7) {
      add(-R - 0.5, y);
      add(R + 0.5, y);
    }
  }

  /** World (tiles, ring centre 0,0) to screen. The floor is seen a bit from above: depth is squashed. */
  private sx = (x: number) => this.w / 2 + x * this.k;
  private sy = (y: number) => this.cy + y * this.k * 0.82;

  events(evs: FightEvent[], s: FightState, now: number) {
    for (const e of evs) {
      if (e.k === 'hit') {
        this.bursts.push({ x: e.x, y: e.y, at: now, strong: e.strong });
        this.shake = { amp: e.strong ? 14 : 5, at: now };
        if (e.strong) this.cheer = now;
      } else if (e.k === 'rope') {
        const f = s.f[e.who];
        const side = Math.abs(f.x) > Math.abs(f.y) ? (f.x < 0 ? 0 : 1) : f.y < 0 ? 2 : 3;
        this.ropeHit[side] = now;
      } else if (e.k === 'out') {
        this.outAt[e.who] = now;
        this.shake = { amp: 20, at: now };
        this.cheer = now;
        this.stamp = { at: now, who: e.who, text: 'OUT!' };
      } else if (e.k === 'power') {
        if (e.id === 'zap' && e.tx !== undefined) this.beams.push({ x: e.x!, y: e.y!, tx: e.tx, ty: e.ty!, at: now });
        if (e.id === 'blink') {
          this.puffs.push({ x: e.x!, y: e.y!, at: now, r: 0.6 });
          if (e.tx !== undefined) this.puffs.push({ x: e.tx, y: e.ty!, at: now, r: 0.6 });
        }
        if (e.id === 'hack') {
          const f = s.f[e.who];
          this.popups.push({ x: f.x, y: f.y, at: now, text: '−20%', color: '#7dffa8' });
        }
      } else if (e.k === 'dash') {
        const f = s.f[e.who];
        this.puffs.push({ x: f.x, y: f.y + 0.2, at: now, r: 0.35 });
      } else if (e.k === 'go') {
        this.stamp = { at: now, who: 0, text: 'FIGHT!' };
      }
    }
  }

  draw(s: FightState, prev: { x: number; y: number }[], a: number, now: number) {
    const { g, w, h, dpr, k } = this;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // The basement: almost black, warmer toward the ring.
    g.fillStyle = '#0a0812';
    g.fillRect(0, 0, w, h);
    const t = now - this.shake.at;
    const amp = t < 260 ? this.shake.amp * (1 - t / 260) : 0;
    const ox = amp ? (Math.sin(now * 0.09) * amp) / 2 : 0;
    const oy = amp ? (Math.cos(now * 0.11) * amp) / 2 : 0;
    g.save();
    g.translate(ox, oy);
    this.floor();
    this.crowdRow(now, (c) => c.y < 0);
    this.ring(s, now, 'back');
    // Fighters, back to front.
    const at = (i: 0 | 1) => {
      const f = s.f[i];
      const p = prev[i] ?? f;
      return { x: p.x + (f.x - p.x) * a, y: p.y + (f.y - p.y) * a };
    };
    const order = ([0, 1] as const).slice().sort((i, j) => at(i).y - at(j).y);
    for (const b of s.bottles) this.bottle(b.x, b.y, b.t, now);
    // When the front card covers the back one, it goes see-through so both stay readable.
    const [back, front] = order as [0 | 1, 0 | 1];
    const close = !s.f[front].out && !s.f[back].out && Math.abs(at(back).x - at(front).x) < 1.1 && at(front).y - at(back).y < 0.9;
    this.fighter(s, back, at(back), now, 1);
    this.fighter(s, front, at(front), now, close ? 0.62 : 1);
    this.ring(s, now, 'front');
    this.crowdRow(now, (c) => c.y >= 0);
    this.effects(now);
    g.restore();
    // Light: one hanging lamp; the corners fall into the dark.
    const glow = g.createRadialGradient(w / 2, this.cy - k, k * 2, w / 2, this.cy, Math.max(w, h) * 0.75);
    glow.addColorStop(0, 'rgba(255,214,150,0.06)');
    glow.addColorStop(0.55, 'rgba(10,8,18,0)');
    glow.addColorStop(1, 'rgba(10,8,18,0.85)');
    g.fillStyle = glow;
    g.fillRect(0, 0, w, h);
    this.banners(s, now);
  }

  private floor() {
    const { g, k } = this;
    const R = FIGHT.ring + 2.6;
    g.fillStyle = '#16121f';
    g.beginPath();
    g.roundRect(this.sx(-R), this.sy(-R), R * 2 * k, R * 2 * k * 0.82, k * 0.6);
    g.fill();
  }

  private ring(s: FightState, now: number, layer: 'back' | 'front') {
    const { g, k } = this;
    const full = FIGHT.ring;
    const R = s.ring;
    const lip = k * 0.32;
    if (layer === 'back') {
      // The apron and the canvas.
      const apron = full + 0.55;
      g.fillStyle = '#2a2236';
      g.beginPath();
      g.roundRect(this.sx(-apron), this.sy(-apron), apron * 2 * k, apron * 2 * k * 0.82 + lip, k * 0.2);
      g.fill();
      g.fillStyle = '#d9d0bd';
      g.beginPath();
      g.roundRect(this.sx(-full), this.sy(-full), full * 2 * k, full * 2 * k * 0.82, k * 0.12);
      g.fill();
      // Scuffs and a worn middle, so it doesn't look like a flat sheet.
      const wear = g.createRadialGradient(this.sx(0), this.sy(0), k * 0.5, this.sx(0), this.sy(0), full * k * 1.2);
      wear.addColorStop(0, 'rgba(255,255,255,0.18)');
      wear.addColorStop(1, 'rgba(60,40,30,0.18)');
      g.fillStyle = wear;
      g.fillRect(this.sx(-full), this.sy(-full), full * 2 * k, full * 2 * k * 0.82);
      g.strokeStyle = 'rgba(80,60,50,0.18)';
      g.lineWidth = Math.max(1, k * 0.05);
      g.strokeRect(this.sx(-full * 0.92), this.sy(-full * 0.92), full * 1.84 * k, full * 1.84 * k * 0.82);
      g.save();
      g.beginPath();
      g.rect(this.sx(-full), this.sy(-full), full * 2 * k, full * 2 * k * 0.82);
      g.clip();
      g.strokeStyle = 'rgba(90,70,50,0.05)';
      g.lineWidth = 1;
      for (let d = -full * 2; d < full * 2; d += 0.18) {
        g.beginPath();
        g.moveTo(this.sx(d), this.sy(-full));
        g.lineTo(this.sx(d + full * 2), this.sy(full));
        g.stroke();
      }
      // Scuffs where people have been thrown: the same marks every night.
      for (let n = 0; n < 9; n++) {
        const sx = Math.sin(n * 12.9898) * 43758.5453;
        const sy = Math.sin(n * 78.233) * 12345.678;
        const ux = (sx - Math.floor(sx) - 0.5) * full * 1.6;
        const uy = (sy - Math.floor(sy) - 0.5) * full * 1.6;
        g.fillStyle = 'rgba(70,45,30,0.07)';
        g.beginPath();
        g.ellipse(this.sx(ux), this.sy(uy), k * (0.3 + (n % 3) * 0.2), k * (0.12 + (n % 2) * 0.08), n, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
      // The centre mark.
      g.strokeStyle = 'rgba(120,80,170,0.22)';
      g.lineWidth = k * 0.09;
      g.beginPath();
      g.ellipse(this.sx(0), this.sy(0), k * 1.2, k * 1.2 * 0.82, 0, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = 'rgba(120,80,170,0.12)';
      g.beginPath();
      g.ellipse(this.sx(0), this.sy(0), k * 0.85, k * 0.85 * 0.82, 0, 0, Math.PI * 2);
      g.fill();
      // The front edge of the platform.
      g.fillStyle = '#3b3048';
      g.fillRect(this.sx(-apron), this.sy(apron), apron * 2 * k, lip);
      // The ropes closing in: the floor outside them turns red.
      if (R < full - 0.01) {
        const pulse = 0.22 + 0.12 * Math.sin(now / 160);
        g.fillStyle = `rgba(230,40,50,${pulse})`;
        g.beginPath();
        g.rect(this.sx(-full), this.sy(-full), full * 2 * k, full * 2 * k * 0.82);
        g.rect(this.sx(R), this.sy(-R), -R * 2 * k, R * 2 * k * 0.82);
        g.fill('evenodd');
      }
      this.ropes(R, now, 'back');
    } else this.ropes(R, now, 'front');
  }

  /** Three ropes on each side and a post at each corner; the back and sides go behind the fighters. */
  private ropes(R: number, now: number, layer: 'back' | 'front') {
    const { g, k } = this;
    const heights = [0.32, 0.6, 0.88];
    const wob = (side: number, u: number) => {
      const t = now - this.ropeHit[side]!;
      if (t > 600) return 0;
      return Math.sin(u * Math.PI) * Math.sin(t / 40) * (1 - t / 600) * k * 0.18;
    };
    const line = (x1: number, y1: number, x2: number, y2: number, side: number, lift: number, color: string) => {
      g.strokeStyle = color;
      g.lineWidth = Math.max(2, k * 0.085);
      g.lineCap = 'round';
      g.beginPath();
      for (let i = 0; i <= 12; i++) {
        const u = i / 12;
        const lean = x1 === x2 ? Math.sign(x1) * lift * 0.07 : 0;
        const x = this.sx(x1 + (x2 - x1) * u + lean);
        const sag = Math.sin(u * Math.PI) * k * 0.06;
        const y = this.sy(y1 + (y2 - y1) * u) - lift * k + sag + wob(side, u);
        if (i) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
      g.stroke();
    };
    const colors = ['#e83a3a', '#f4efe6', '#3a6be8'];
    const post = (x: number, y: number, c: string) => {
      const px = this.sx(x);
      const py = this.sy(y);
      const pw = k * 0.24;
      const ph = k * 1.05;
      g.fillStyle = INK;
      g.fillRect(px - pw / 2 - 2, py - ph - 2, pw + 4, ph + 4);
      g.fillStyle = c;
      g.fillRect(px - pw / 2, py - ph, pw, ph);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(px - pw / 2 + pw * 0.15, py - ph, pw * 0.18, ph);
    };
    if (layer === 'back') {
      post(-R, -R, '#d33');
      post(R, -R, '#2f5fd8');
      heights.forEach((hgt, i) => {
        line(-R, -R, R, -R, 2, hgt, colors[i]!);
        line(-R, -R, -R, R, 0, hgt, colors[i]!);
        line(R, -R, R, R, 1, hgt, colors[i]!);
      });
    } else {
      post(-R, R, '#2f5fd8');
      post(R, R, '#d33');
      heights.forEach((hgt, i) => line(-R, R, R, R, 3, hgt, colors[i]!));
    }
  }

  private crowdRow(now: number, which: (c: { x: number; y: number }) => boolean) {
    if (!this.crowdPieces.length) return;
    const cheering = now - this.cheer < 1400;
    for (const c of this.crowd.filter(which).sort((p, q) => p.y - q.y)) {
      const piece = this.crowdPieces[c.i]!;
      const jump = cheering ? Math.abs(Math.sin(now / 120 + c.seed * 9)) * this.k * 0.25 : 0;
      drawPiece(this.g, piece, this.sx(c.x), this.sy(c.y) - jump, { moving: false, seed: c.seed, face: 1, alpha: cheering ? 0.5 : 0.32 }, now);
    }
  }

  private fighter(s: FightState, i: 0 | 1, at: { x: number; y: number }, now: number, see = 1) {
    const { g, k } = this;
    const f = s.f[i];
    const piece = this.pieces[i];
    if (!piece) return;
    const x = this.sx(at.x);
    const y = this.sy(at.y);
    const flying = f.stun > 0 && Math.hypot(f.vx, f.vy) > 2.5;
    // Speed lines behind someone flying from a hit.
    if (flying || f.out) {
      const v = Math.hypot(f.vx, f.vy) || 1;
      g.strokeStyle = 'rgba(255,255,255,0.55)';
      g.lineWidth = 2;
      for (let n = -1; n <= 1; n++) {
        const px = x - (f.vx / v) * k * 0.9 + (f.vy / v) * n * k * 0.22;
        const py = y - piece.top * 0.5 - (f.vy / v) * k * 0.7 - (f.vx / v) * n * k * 0.22;
        g.beginPath();
        g.moveTo(px, py);
        g.lineTo(px - (f.vx / v) * k * 0.9, py - (f.vy / v) * k * 0.7);
        g.stroke();
      }
    }
    // Dash: two fading copies behind.
    if (f.dash > 0 || f.tackle > 0) {
      for (let n = 1; n <= 2; n++)
        drawPiece(g, piece, x - f.vx * n * 0.035 * k, y - f.vy * n * 0.03 * k, { moving: true, seed: i, face: f.fx < 0 ? -1 : 1, alpha: 0.22 / n }, now);
    }
    g.save();
    let rot = 0;
    if (f.out) {
      const t = (now - this.outAt[i]) / 1000;
      rot = t * 9 * (f.vx < 0 ? -1 : 1);
    } else if (flying) rot = Math.max(-0.7, Math.min(0.7, f.vx * 0.06));
    else if (f.swing >= 0) rot = f.swing <= FIGHT.hitWind ? -0.18 * (f.fx < 0 ? -1 : 1) : 0.22 * (f.fx < 0 ? -1 : 1);
    // A punch lunges forward a little.
    const lunge = f.swing > FIGHT.hitWind && f.swing <= FIGHT.hitWind + FIGHT.hitActive ? k * 0.16 : 0;
    g.translate(x + f.fx * lunge, y + f.fy * lunge * 0.8);
    g.rotate(rot);
    const alpha = (f.hide > 0 ? 0.35 + 0.15 * Math.sin(now / 50) : 1) * see;
    drawPiece(g, piece, 0, 0, { moving: !flying && Math.hypot(f.vx, f.vy) > 0.6, seed: i * 0.5, face: f.fx < 0 ? -1 : 1, alpha }, now);
    g.restore();
    // The swing's arc in front: you can see a hit coming.
    if (f.swing > 0 && f.swing <= FIGHT.hitWind + FIGHT.hitActive) {
      const live = f.swing > FIGHT.hitWind;
      const cx = x + f.fx * k * 0.75;
      const cy = y - piece.top * 0.45 + f.fy * k * 0.6;
      const ang = Math.atan2(f.fy, f.fx);
      g.strokeStyle = live ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.35)';
      g.lineWidth = live ? k * 0.12 : k * 0.06;
      g.lineCap = 'round';
      g.beginPath();
      g.arc(cx - f.fx * k * 0.4, cy - f.fy * k * 0.3, k * 0.55, ang - 0.9, ang + 0.9);
      g.stroke();
    }
    // Scared: a wobbling "?!" ; distracted: stars going round.
    if (f.scared > 0) this.label('?!', x, y - piece.top - k * 0.35 + Math.sin(now / 60) * 3, '#c792ff', k * 0.42);
    if (f.distracted > 0)
      for (let n = 0; n < 3; n++) {
        const a = now / 180 + (n * Math.PI * 2) / 3;
        this.label('★', x + Math.cos(a) * k * 0.4, y - piece.top - k * 0.2 + Math.sin(a) * k * 0.12, '#ffd23f', k * 0.26);
      }
    if (f.out) return;
    // The number on the base, shaking for a moment after a hit.
    const recent = this.bursts.find((b) => now - b.at < 220 && Math.hypot(b.x - f.x, b.y - f.y) < 1.2);
    const jig = recent ? Math.sin(now * 0.6) * 3 : 0;
    this.label(`${Math.round(f.pct)}%`, x + jig, y + k * 0.42, pctColor(f.pct), k * 0.4);
  }

  private bottle(x: number, y: number, t: number, now: number) {
    const { g, k } = this;
    // Where it'll land: a red ring that tightens; the bottle drops from above.
    const left = t / (FIGHT_TPS * 0.7);
    g.strokeStyle = `rgba(255,70,70,${0.4 + 0.4 * Math.sin(now / 50)})`;
    g.lineWidth = 2;
    g.beginPath();
    g.ellipse(this.sx(x), this.sy(y), k * (0.5 + left * 0.4), k * (0.5 + left * 0.4) * 0.82, 0, 0, Math.PI * 2);
    g.stroke();
    this.label('🍾', this.sx(x), this.sy(y) - left * k * 3.2, '#fff', k * 0.5);
  }

  private effects(now: number) {
    const { g, k } = this;
    this.bursts = this.bursts.filter((b) => now - b.at < 380);
    for (const b of this.bursts) {
      const t = (now - b.at) / 380;
      const r = k * (b.strong ? 1.1 : 0.65) * (0.4 + t);
      const x = this.sx(b.x);
      const y = this.sy(b.y) - k * 0.55;
      g.save();
      g.globalAlpha = 1 - t;
      g.translate(x, y);
      g.rotate(t * 0.8);
      g.fillStyle = b.strong ? '#ffe14a' : '#ffffff';
      g.strokeStyle = INK;
      g.lineWidth = 3;
      g.beginPath();
      for (let n = 0; n < 16; n++) {
        const rr = n % 2 ? r * 0.45 : r;
        const a = (n / 16) * Math.PI * 2;
        if (n) g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else g.moveTo(rr, 0);
      }
      g.closePath();
      g.fill();
      g.stroke();
      g.restore();
    }
    this.beams = this.beams.filter((b) => now - b.at < 260);
    for (const b of this.beams) {
      const t = (now - b.at) / 260;
      g.strokeStyle = `rgba(80,255,140,${1 - t})`;
      g.lineWidth = k * 0.22 * (1 - t);
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(this.sx(b.x), this.sy(b.y) - k * 0.7);
      g.lineTo(this.sx(b.tx), this.sy(b.ty) - k * 0.7);
      g.stroke();
    }
    this.puffs = this.puffs.filter((p) => now - p.at < 420);
    for (const p of this.puffs) {
      const t = (now - p.at) / 420;
      g.fillStyle = `rgba(230,225,240,${0.5 * (1 - t)})`;
      for (let n = 0; n < 5; n++) {
        const a = (n / 5) * Math.PI * 2;
        g.beginPath();
        g.arc(this.sx(p.x) + Math.cos(a) * p.r * k * t, this.sy(p.y) + Math.sin(a) * p.r * k * t * 0.6, p.r * k * 0.4 * (1 - t * 0.5), 0, Math.PI * 2);
        g.fill();
      }
    }
    this.popups = this.popups.filter((p) => now - p.at < 900);
    for (const p of this.popups) {
      const t = (now - p.at) / 900;
      g.globalAlpha = 1 - t;
      this.label(p.text, this.sx(p.x), this.sy(p.y) - k * (1.1 + t * 0.8), p.color, k * 0.36);
      g.globalAlpha = 1;
    }
  }

  private banners(s: FightState, now: number) {
    const { w, k } = this;
    if (s.phase === 'count') {
      const n = Math.ceil(s.wait / FIGHT_TPS / 0.5);
      this.label(String(Math.max(1, Math.min(3, n))), w / 2, this.cy - k * 0.9, '#fff', k * 1.6);
    }
    if (!this.stamp) return;
    const t = (now - this.stamp.at) / 1000;
    const life = this.stamp.text === 'FIGHT!' ? 0.7 : 1.3;
    if (t > life) {
      this.stamp = null;
      return;
    }
    const pop = t < 0.12 ? 1.6 - (t / 0.12) * 0.6 : 1;
    this.g.save();
    this.g.globalAlpha = t > life - 0.25 ? (life - t) / 0.25 : 1;
    this.g.translate(w / 2, this.cy - k * 1.1);
    this.g.rotate(-0.08);
    this.g.scale(pop, pop);
    this.label(this.stamp.text, 0, 0, this.stamp.text === 'OUT!' ? '#ff4a4a' : '#ffe14a', k * 1.5);
    this.g.restore();
  }

  /** Bold text with a thick dark outline, like the rest of the game's labels. */
  private label(text: string, x: number, y: number, color: string, size: number) {
    const { g } = this;
    g.font = `${Math.round(size)}px ${this.body}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.strokeStyle = INK;
    g.lineWidth = Math.max(3, size * 0.16);
    g.strokeText(text, x, y);
    g.fillStyle = color;
    g.fillText(text, x, y);
  }
}
