import { TRUCK, blinker, poseAt, rearOf, type Bag, type Truck } from '@chog-city/game/city';
import type { Glow } from './city-render';
import type { HauntView } from './halloween';

// The winter cash truck, drawn (the rules are in packages/game/src/city/truck.ts): the armoured truck seen from
// above, swinging round corners with its blinker going, headlights on the snow, brake lights when it stops, the
// back doors bursting open and the money bags bouncing out onto the street. Snow falls over the whole city
// while it's on.

type G = CanvasRenderingContext2D;
const INK = '#0d0b1a';

function picture(src: string) {
  if (typeof Image === 'undefined') return null;
  const im = new Image();
  im.decoding = 'async';
  im.src = src;
  return im;
}

interface Puff {
  x: number;
  y: number;
  at: number;
  r: number;
}
interface Flake {
  x: number;
  y: number;
  r: number;
  v: number;
  sway: number;
}
interface Pop {
  x: number;
  y: number;
  at: number;
  text: string;
}

export class CityTruck {
  truck: Truck | null = null;
  bags: Bag[] = [];
  /** You're riding on the back. */
  riding = false;
  /** When the back doors burst open (ms, performance.now), 0 while shut. */
  openAt = 0;
  /** Snow falling over the city. */
  snow = false;
  font = 'Impact, sans-serif';
  private body = picture('/art/truck/truck.webp');
  private sack = picture('/art/truck/bag.webp');
  private puffs: Puff[] = [];
  private puffAt = 0;
  private flakes: Flake[] = [];
  private pops: Pop[] = [];
  private lastCam: { x: number; y: number } | null = null;

  /** A bag scooped up: "+$125" floats up where it was. */
  grabbed(b: { x: number; y: number }, text: string, now: number) {
    this.pops.push({ x: b.x, y: b.y, at: now, text });
    if (this.pops.length > 10) this.pops.shift();
  }

  reset() {
    this.truck = null;
    this.bags = [];
    this.riding = false;
    this.openAt = 0;
    this.puffs = [];
    this.pops = [];
  }

  /** The truck and the bags, to stand among everything else. */
  things(
    v: HauntView,
    now: number,
    inView: (x: number, y: number) => boolean,
    push: (y: number, draw: () => void) => void,
  ) {
    const t = this.truck;
    if (t && t.state !== 'gone') {
      const p = poseAt(t.route, t.s);
      if (t.v > 1.5 && now - this.puffAt > 90) {
        this.puffAt = now;
        const back = rearOf(p);
        for (const side of [-1, 1])
          this.puffs.push({
            x: back.x + -p.hy * side * TRUCK.width * 0.42 + p.hx * 0.3,
            y: back.y + p.hx * side * TRUCK.width * 0.42 + p.hy * 0.3,
            at: now,
            r: 0.07 + Math.random() * 0.06,
          });
      }
      // Riding on the back you're drawn over it, whichever way it faces (you stand at the back doors).
      if (inView(p.x, p.y))
        push(this.riding ? rearOf(p).y - 0.05 : p.y + 0.4, () => this.drawTruck(v, t, now));
    }
    this.puffs = this.puffs.filter((q) => now - q.at < 900);
    if (this.puffs.length) push(-1e9 - 1, () => this.drawPuffs(v, now));
    for (const b of this.bags) if (inView(b.x, b.y)) push(b.y, () => this.drawBag(v, b, now));
  }

  /** Headlights on the snow ahead, tail lights, the blinker. */
  lights(v: HauntView): Glow[] {
    const t = this.truck;
    if (!t || t.state === 'gone') return [];
    const now = performance.now();
    const p = poseAt(t.route, t.s);
    const out: Glow[] = [];
    const at = (along: number, across: number) => ({
      x: v.sx(p.x + p.hx * along - p.hy * across),
      y: v.sy(p.y + p.hy * along + p.hx * across),
    });
    // Two long beams ahead.
    for (const k of [1.9, 3.1]) {
      const q = at(k, 0);
      out.push({ ...q, r: v.t * (k > 2 ? 2.2 : 1.7), rgb: [150, 140, 105], k: 0.9 });
    }
    const stop = t.state !== 'driving';
    const back = at(-TRUCK.length / 2 - 0.2, 0);
    out.push({ ...back, r: v.t * (stop ? 1.6 : 1), rgb: [150, 30, 30], k: stop ? 1 : 0.6 });
    const side = blinker(t);
    if (side && Math.floor(now / 380) % 2 === 0) {
      const s = side === 'right' ? 1 : -1;
      out.push({ ...at(TRUCK.length / 2, (s * TRUCK.width) / 2), r: v.t * 1.1, rgb: [160, 100, 20] });
      out.push({ ...at(-TRUCK.length / 2, (s * TRUCK.width) / 2), r: v.t * 1.1, rgb: [160, 100, 20] });
    }
    // The string of bulbs round the roof.
    out.push({ ...at(0, 0), r: v.t * 1.6, rgb: [120, 90, 60], k: 0.7 });
    // The open doors spill gold light.
    if (this.openAt)
      out.push({ ...at(-TRUCK.length / 2 - 0.5, 0), r: v.t * 1.8, rgb: [150, 120, 40], k: 0.8 });
    return out;
  }

  /** Over the lit city: the floating "+$125"s and the falling snow. */
  glow(g: G, v: HauntView, now: number) {
    this.pops = this.pops.filter((q) => now - q.at < 1100);
    for (const q of this.pops) {
      const k = (now - q.at) / 1100;
      g.save();
      g.globalAlpha = 1 - k * k;
      g.font = `${Math.round(v.t * 0.42)}px ${this.font}`;
      g.textAlign = 'center';
      g.lineWidth = 4;
      g.strokeStyle = INK;
      g.fillStyle = '#ffd23f';
      const x = v.sx(q.x);
      const y = v.sy(q.y) - v.t * (0.8 + k * 0.9);
      g.strokeText(q.text, x, y);
      g.fillText(q.text, x, y);
      g.restore();
    }
    if (this.snow) this.drawSnow(g, v, now);
    else this.flakes = [];
  }

  private drawTruck(v: HauntView, t: Truck, now: number) {
    const { g, sx, sy } = v;
    const T = v.t;
    const p = poseAt(t.route, t.s);
    const L = TRUCK.length * T;
    const W = TRUCK.width * T;
    // A heavy truck: it leans out of a corner and rumbles a little on the road.
    const rumble = t.v > 0.2 ? Math.sin(now / 45) * Math.min(1, t.v / 3) * 0.6 : 0;
    const lean = t.turning * 0.05;
    g.save();
    g.translate(sx(p.x), sy(p.y) + rumble);
    g.rotate(p.angle);
    // Shadow on the snow.
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath();
    g.roundRect(-W / 2 + T * 0.1, -L / 2 + T * 0.14, W, L, T * 0.22);
    g.fill();
    g.transform(1, 0, lean, 1, 0, 0);
    if (this.body?.complete && this.body.naturalWidth) g.drawImage(this.body, -W / 2, -L / 2, W, L);
    else {
      g.fillStyle = '#4a5a4c';
      g.strokeStyle = INK;
      g.lineWidth = 2;
      g.beginPath();
      g.roundRect(-W / 2, -L / 2, W, L, T * 0.18);
      g.fill();
      g.stroke();
    }
    // Brake lights: bright red when it's stopping.
    if (t.state !== 'driving') {
      g.fillStyle = '#ff3b3b';
      for (const s of [-1, 1]) {
        g.beginPath();
        g.arc(s * W * 0.33, L * 0.47, T * 0.09, 0, Math.PI * 2);
        g.fill();
      }
    }
    // The blinker on the side it's turning, front and back corners.
    const side = blinker(t);
    if (side && Math.floor(now / 380) % 2 === 0) {
      const s = side === 'right' ? 1 : -1;
      g.fillStyle = '#ffb21e';
      g.strokeStyle = INK;
      g.lineWidth = 1.5;
      for (const y of [-L * 0.47, L * 0.44]) {
        g.beginPath();
        g.arc((s * W) / 2.1, y, T * 0.1, 0, Math.PI * 2);
        g.fill();
        g.stroke();
      }
    }
    if (this.openAt) this.drawDoors(g, W, L, T, now);
    g.restore();
  }

  /** The two back doors flung open on their hinges, gold light from inside. */
  private drawDoors(g: G, W: number, L: number, T: number, now: number) {
    const k = Math.min(1, (now - this.openAt) / 260);
    // Overshoot, then settle, as they bang against their stops.
    const swing = k < 1 ? 1 - (1 - k) ** 3 : 1;
    const wobble = Math.sin((now - this.openAt) / 60) * Math.max(0, 1 - (now - this.openAt) / 700) * 0.18;
    const back = L * 0.45;
    g.fillStyle = '#20140a';
    g.fillRect(-W * 0.36, back - T * 0.2, W * 0.72, T * 0.28);
    g.fillStyle = 'rgba(255,205,80,0.65)';
    g.fillRect(-W * 0.3, back - T * 0.12, W * 0.6, T * 0.16);
    for (const s of [-1, 1]) {
      g.save();
      g.translate((s * W) / 2.05, back);
      g.rotate(-s * (swing * 1.6 + wobble));
      g.fillStyle = '#566656';
      g.strokeStyle = INK;
      g.lineWidth = 2;
      g.beginPath();
      g.roundRect(s > 0 ? -W * 0.46 : 0, -T * 0.04, W * 0.46, T * 0.13, T * 0.04);
      g.fill();
      g.stroke();
      g.restore();
    }
  }

  private drawPuffs(v: HauntView, now: number) {
    const { g } = v;
    for (const q of this.puffs) {
      const k = (now - q.at) / 900;
      g.globalAlpha = 0.4 * (1 - k) * (1 - k);
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(v.sx(q.x), v.sy(q.y), v.t * q.r * (1 + k * 1.4), 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }

  private drawBag(v: HauntView, b: Bag, now: number) {
    const { g } = v;
    const T = v.t;
    const x = v.sx(b.x);
    const y = v.sy(b.y);
    // Out of the back it bounces twice, smaller each time, then sits; now and then a coin glints on top.
    const a = b.age;
    const hop =
      a < 0.45
        ? Math.sin((a / 0.45) * Math.PI) * 0.5
        : a < 0.75
          ? Math.sin(((a - 0.45) / 0.3) * Math.PI) * 0.16
          : 0;
    const land = a > 0.42 && a < 0.55 ? 1 - Math.abs(a - 0.485) / 0.065 : 0;
    const w = T * 0.72 * (1 + land * 0.18);
    const h = T * 0.84 * (1 - land * 0.16);
    g.fillStyle = 'rgba(0,0,0,0.32)';
    g.beginPath();
    g.ellipse(x, y + T * 0.12, T * 0.32 * (1 - hop * 0.6), T * 0.1, 0, 0, Math.PI * 2);
    g.fill();
    const top = y + T * 0.14 - h - hop * T;
    if (this.sack?.complete && this.sack.naturalWidth) g.drawImage(this.sack, x - w / 2, top, w, h);
    else {
      g.fillStyle = '#d9c4a0';
      g.beginPath();
      g.ellipse(x, top + h * 0.6, w / 2, h * 0.4, 0, 0, Math.PI * 2);
      g.fill();
    }
    const glint = ((now / 1000 + b.id * 0.37) % 2.2) / 2.2;
    if (glint < 0.12 && a > 0.8) {
      const k = Math.sin((glint / 0.12) * Math.PI);
      g.save();
      g.globalAlpha = k;
      g.fillStyle = '#fff6c8';
      g.translate(x + w * 0.12, top + h * 0.12);
      g.rotate(Math.PI / 4);
      g.fillRect(-T * 0.11 * k, -1.5, T * 0.22 * k, 3);
      g.fillRect(-1.5, -T * 0.11 * k, 3, T * 0.22 * k);
      g.restore();
    }
  }

  /** Snowflakes drifting down the screen; they move with the camera a little, so they feel in the air. */
  private drawSnow(g: G, v: HauntView, now: number) {
    const { w, h } = v.view;
    const want = Math.round(Math.min(140, (w * h) / 9000));
    while (this.flakes.length < want)
      this.flakes.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 0.8 + Math.random() * 2.2,
        v: 18 + Math.random() * 34,
        sway: Math.random() * 6.28,
      });
    if (this.flakes.length > want) this.flakes.length = want;
    const cam = this.lastCam ?? v.cam;
    const dx = v.cam.x - cam.x;
    const dy = v.cam.y - cam.y;
    this.lastCam = { ...v.cam };
    g.save();
    g.fillStyle = '#ffffff';
    for (const f of this.flakes) {
      const depth = f.r / 3;
      f.y += f.v * (1 / 60) - dy * depth;
      f.x += Math.sin(now / 900 + f.sway) * 0.3 - dx * depth;
      if (f.y > h + 4) f.y -= h + 8;
      if (f.y < -4) f.y += h + 8;
      if (f.x > w + 4) f.x -= w + 8;
      if (f.x < -4) f.x += w + 8;
      g.globalAlpha = 0.35 + depth * 0.45;
      g.beginPath();
      g.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }
}
