import { CITY, HOP } from '@chog-city/game/city';
import { hArt, loadHalloweenArt } from '../halloween-art';
import { Halloween, type HauntView } from './halloween';
import type { Pumpkin, PumpkinGot } from './live-city';

// The city's live hunts, drawn (the live server runs them: apps/live/src/hunts.ts).
//
// Pumpkin Rush: each pumpkin pops up out of the street, a Chog-o'-lantern like the ones by the doors but smaller
// and full of cash, with a column of light over it you can see from blocks away and its price floating above.
// A gold one glows gold. Whoever reaches it first: it bursts into coins and the amount floats up.
//
// Most Wanted: a red target turning on the ground under them (the plate over their head is in the name tag).
// Off screen, an arrow at the edge points to the nearest pumpkin and, for rivals, to the Most Wanted.
//
// The Blood Moon: the city washed red, and the moon's red light from the top of the screen.

type G = CanvasRenderingContext2D;
const INK = '#0d0b1a';

const money = (n: number) => `$${n.toLocaleString('en-US')}`;

export class CityHunts {
  pumpkins: Pumpkin[] = [];
  /** The Blood Moon is up. */
  moon = false;
  /** Pumpkin art from the Halloween set (its sprites, drawn at this size). */
  private art = new Halloween([]);
  private born = new Map<string, number>();
  private pops: (PumpkinGot & { at: number })[] = [];
  private gold = new Map<string, HTMLCanvasElement>();

  /** Someone reached a pumpkin: the burst of coins, where it was. */
  grabbed(e: PumpkinGot, now: number) {
    this.pops.push({ ...e, at: now });
    if (this.pops.length > 12) this.pops.shift();
  }

  /** The pumpkins, to stand among everything else (sorted by how far down the street they are). */
  things(
    v: HauntView,
    now: number,
    inView: (x: number, y: number) => boolean,
    push: (y: number, draw: () => void) => void,
  ) {
    if (this.pumpkins.length || this.moon) loadHalloweenArt();
    for (const p of this.pumpkins) {
      if (!this.born.has(p.id)) this.born.set(p.id, now);
      if (inView(p.x, p.y)) push(p.y, () => this.drawPumpkin(v, p, now));
    }
    if (this.born.size > 60)
      for (const id of this.born.keys()) if (!this.pumpkins.some((p) => p.id === id)) this.born.delete(id);
  }

  /** Each pumpkin lights the street round it at night (screen px). */
  lights(v: HauntView): { x: number; y: number; r: number }[] {
    const now = performance.now();
    return this.pumpkins.map((p) => {
      const at = this.where(p, now);
      return { x: v.sx(at.x), y: v.sy(at.y) - v.t * 0.4, r: v.t * (p.gold ? 2.6 : 2) };
    });
  }

  private scaleIn(p: Pumpkin, now: number) {
    const k = Math.min(1, (now - (this.born.get(p.id) ?? now)) / 520);
    // Ease out with a little overshoot: it pops out of the street.
    const c1 = 1.70158;
    return 1 + (c1 + 1) * (k - 1) ** 3 + c1 * (k - 1) ** 2;
  }

  /**
   * Where a pumpkin is drawn now: mid-hop it arcs from where it was to where it lands. `lift` is its height off
   * the street (tiles), `land` how hard it's squashing as it lands (0-1).
   */
  private where(p: Pumpkin, now: number) {
    const h = p.hop;
    if (!h) return { x: p.x, y: p.y, lift: 0, land: 0 };
    const k = (now - h.at) / HOP.air;
    if (k >= 1) {
      const after = (now - h.at - HOP.air) / 140;
      return { x: p.x, y: p.y, lift: 0, land: after < 1 ? Math.sin(after * Math.PI) : 0 };
    }
    const e = Math.max(0, k);
    return {
      x: h.fx + (p.x - h.fx) * e,
      y: h.fy + (p.y - h.fy) * e,
      lift: Math.sin(e * Math.PI) * 0.6,
      land: 0,
    };
  }

  private drawPumpkin(v: HauntView, p: Pumpkin, now: number) {
    const g = v.g;
    const t = v.t * 0.95;
    const W = t * 1.5;
    const H = t * 1.18;
    const at = this.where(p, now);
    const x = v.sx(at.x);
    const y = v.sy(at.y);
    const seed = p.id.length * 3.7 + p.id.charCodeAt(p.id.length - 1);
    const pop = Math.max(0, this.scaleIn(p, now));
    const left = p.until - Date.now();
    // Its last 15 seconds: it fades softly in and out, about to go.
    const fading = left < 15_000 ? 0.7 + 0.3 * Math.cos(now / 220) : 1;
    // Hopping away from you: up in an arc, a squash as it lands; standing, a nervous little bounce.
    const idle = at.lift === 0 && at.land === 0;
    const twitch = idle ? Math.abs(Math.sin(now / 260 + seed)) * v.t * 0.06 : 0;
    const squash = at.land * 0.16 - (at.lift > 0 ? 0.06 : 0);
    const bob = at.lift * v.t + twitch;
    g.save();
    g.globalAlpha = fading;
    g.fillStyle = 'rgba(0,0,0,0.4)';
    g.beginPath();
    // Its shadow stays on the street and shrinks as it jumps.
    const sh = 1 - at.lift * 0.45;
    g.ellipse(x, y + v.t * 0.04, W * 0.46 * pop * sh, v.t * 0.12 * pop * sh, 0, 0, Math.PI * 2);
    g.fill();
    g.translate(x, y - bob);
    g.scale(pop * (1 + squash), pop * (1 - squash));
    g.rotate(Math.sin(now / 520 + seed) * 0.05);
    // The drawn pumpkin full of cash (docs/art-halloween.md); until it's loaded, the carved lantern.
    const pic = hArt(p.gold ? 'pumpkin-gold' : 'pumpkin-cash');
    if (pic) {
      const ph = v.t * 1.55;
      const pw = (ph * pic.width) / pic.height;
      g.drawImage(pic, -pw / 2, -ph + v.t * 0.12, pw, ph);
    } else {
      const body = p.gold ? this.goldBody(t, v.dpr) : this.art.pumpkinBody(t, v.dpr);
      g.drawImage(body, -W * 0.62, -H * 1.42, W * 1.24, H * 1.5);
      this.art.pumpkinFace(g, 0, -H * 0.52, W, H, 1, 1.2, 0.5, p, now);
    }
    g.restore();
  }

  /** The gold pumpkin's body: the same pumpkin, gilded, drawn once. */
  private goldBody(t: number, dpr: number) {
    const k = `${t}:${dpr}`;
    let c = this.gold.get(k);
    if (c) return c;
    const src = this.art.pumpkinBody(t, dpr);
    c = document.createElement('canvas');
    c.width = src.width;
    c.height = src.height;
    const g = c.getContext('2d')!;
    g.drawImage(src, 0, 0);
    // Gold in the pumpkin's own shape (a mask), then laid over it in colour mode so the shading stays.
    const mask = document.createElement('canvas');
    mask.width = src.width;
    mask.height = src.height;
    const mg = mask.getContext('2d')!;
    mg.fillStyle = '#ffc93a';
    mg.fillRect(0, 0, mask.width, mask.height);
    mg.globalCompositeOperation = 'destination-in';
    mg.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'color';
    g.drawImage(mask, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    const sheen = g.createLinearGradient(0, 0, c.width, c.height);
    sheen.addColorStop(0, 'rgba(255,255,220,0.35)');
    sheen.addColorStop(0.5, 'rgba(255,220,120,0)');
    sheen.addColorStop(1, 'rgba(120,70,0,0.25)');
    g.fillStyle = sheen;
    g.fillRect(0, 0, c.width, c.height);
    this.gold.set(k, c);
    return c;
  }

  /**
   * After the night: the light over each pumpkin, its price, and the coin bursts. Drawn over the dark so they
   * read from far off.
   */
  glow(g: G, v: HauntView, now: number) {
    const t = v.t;
    for (const p of this.pumpkins) {
      const at = this.where(p, now);
      const x = v.sx(at.x);
      const y = v.sy(at.y) - at.lift * t;
      if (x < -t * 3 || x > v.view.w + t * 3 || y < -t * 8 || y > v.view.h + t * 3) continue;
      const pop = Math.max(0, this.scaleIn(p, now));
      const col = p.gold ? '255, 214, 90' : '255, 150, 50';
      // Steady light, breathing very slowly.
      const pulse = 0.95 + 0.05 * Math.sin(now / 900 + p.x);
      g.save();
      g.globalCompositeOperation = 'lighter';
      // The column of light, rising from the top of the pumpkin (not over it) and narrowing as it goes.
      const base = y - t * 1.35;
      const top = base - t * 4.5;
      const beam = g.createLinearGradient(0, base, 0, top);
      beam.addColorStop(0, `rgba(${col}, 0)`);
      beam.addColorStop(0.06, `rgba(${col}, ${0.5 * pulse * pop})`);
      beam.addColorStop(0.45, `rgba(${col}, ${0.17 * pulse * pop})`);
      beam.addColorStop(1, `rgba(${col}, 0)`);
      g.fillStyle = beam;
      g.beginPath();
      g.moveTo(x - t * 0.6, base);
      g.lineTo(x - t * 0.3, top);
      g.lineTo(x + t * 0.3, top);
      g.lineTo(x + t * 0.6, base);
      g.closePath();
      g.fill();
      // A bright core up the middle.
      const core = g.createLinearGradient(0, base, 0, base - t * 4);
      core.addColorStop(0, `rgba(255, 245, 210, 0)`);
      core.addColorStop(0.08, `rgba(255, 245, 210, ${0.35 * pulse * pop})`);
      core.addColorStop(1, 'rgba(255, 245, 210, 0)');
      g.fillStyle = core;
      g.fillRect(x - t * 0.06, base - t * 4, t * 0.12, t * 4);
      // Warm light on the street round its base.
      const pool = g.createRadialGradient(x, y, 0, x, y, t * 1.3);
      pool.addColorStop(0, `rgba(${col}, ${0.22 * pop})`);
      pool.addColorStop(1, `rgba(${col}, 0)`);
      g.fillStyle = pool;
      g.beginPath();
      g.ellipse(x, y, t * 1.3, t * 0.5, 0, 0, Math.PI * 2);
      g.fill();
      // Sparks rising up the light.
      for (let i = 0; i < 5; i++) {
        const k = (now / 1600 + i / 5 + p.y * 0.13) % 1;
        const sx = x + Math.sin(i * 2.4 + now / 500) * t * 0.3;
        const sy = y - t * 1.5 - k * t * 5;
        const r = t * 0.05 * (1 - k * 0.6);
        g.globalAlpha = (1 - k) * pop;
        g.fillStyle = p.gold ? '#fff2b0' : '#ffd9a0';
        g.beginPath();
        g.arc(sx, sy, r, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
      // The price, floating over it.
      if (pop > 0.6) this.priceTag(g, x, y - t * 1.85 + Math.sin(now / 300 + p.x) * t * 0.06, p, t);
    }
    // Bursts where pumpkins were taken.
    this.pops = this.pops.filter((e) => now - e.at < 1600);
    for (const e of this.pops) this.burst(g, v, e, now);
  }

  private priceTag(g: G, x: number, y: number, p: Pumpkin, t: number) {
    const size = Math.max(11, Math.round(t * 0.26));
    const label = p.gold ? `GOLD ${money(p.cash)}` : money(p.cash);
    g.save();
    g.font = `800 ${size}px ${this.font}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const w = g.measureText(label).width + size * 2.2;
    const h = size * 1.6;
    g.shadowColor = 'rgba(0,0,0,0.5)';
    g.shadowBlur = 10;
    g.shadowOffsetY = 3;
    const fill = g.createLinearGradient(0, y - h / 2, 0, y + h / 2);
    if (p.gold) {
      fill.addColorStop(0, '#fff1a8');
      fill.addColorStop(1, '#f2b81f');
    } else {
      fill.addColorStop(0, '#ffb15c');
      fill.addColorStop(1, '#ff7a1a');
    }
    g.fillStyle = fill;
    g.beginPath();
    g.roundRect(x - w / 2, y - h / 2, w, h, h / 2);
    g.fill();
    g.shadowColor = 'transparent';
    g.strokeStyle = INK;
    g.lineWidth = 2;
    g.stroke();
    // A coin on the left.
    const cx = x - w / 2 + h * 0.55;
    g.fillStyle = '#ffd23f';
    g.beginPath();
    g.arc(cx, y, h * 0.3, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = INK;
    g.font = `900 ${Math.round(size * 0.7)}px ${this.font}`;
    g.fillText('$', cx, y + 0.5);
    g.font = `800 ${size}px ${this.font}`;
    g.fillText(label, x + h * 0.28, y + 1);
    g.restore();
  }

  private burst(g: G, v: HauntView, e: PumpkinGot & { at: number }, now: number) {
    const t = v.t;
    const age = (now - e.at) / 1000;
    const x = v.sx(e.x);
    const y = v.sy(e.y) - t * 0.5;
    g.save();
    // A ring of light going out.
    g.globalCompositeOperation = 'lighter';
    const ring = Math.min(1, age / 0.5);
    g.strokeStyle = e.gold ? `rgba(255, 220, 110, ${1 - ring})` : `rgba(255, 170, 70, ${1 - ring})`;
    g.lineWidth = t * 0.12 * (1 - ring) + 1;
    g.beginPath();
    g.ellipse(x, y + t * 0.4, t * (0.4 + ring * 1.8), t * (0.15 + ring * 0.6), 0, 0, Math.PI * 2);
    g.stroke();
    g.globalCompositeOperation = 'source-over';
    // Coins thrown up and falling, spinning.
    const n = e.gold ? 22 : 14;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + i * 0.7;
      const speed = t * (2.2 + (i % 5) * 0.45);
      const vx = Math.cos(a) * speed * 0.55;
      const vy = -t * (4.5 + (i % 3));
      const cx = x + vx * age;
      const cy = y + vy * age + t * 9 * age * age;
      const life = 1 - age / 1.3;
      if (life <= 0) continue;
      const spin = Math.abs(Math.cos(now / 90 + i));
      g.globalAlpha = Math.min(1, life * 1.4);
      g.fillStyle = '#ffd23f';
      g.strokeStyle = INK;
      g.lineWidth = 1.5;
      g.beginPath();
      g.ellipse(cx, cy, t * 0.11 * spin + 1, t * 0.11, 0, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    // The amount, rising.
    const k = Math.min(1, age / 1.4);
    g.globalAlpha = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25;
    const size = Math.round(t * (e.gold ? 0.5 : 0.42) * (1 + 0.25 * Math.max(0, 1 - age * 5)));
    g.font = `900 ${size}px ${this.font}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = Math.max(3, size * 0.16);
    g.strokeStyle = INK;
    const ty = y - t * 1.2 - k * t * 1.6;
    g.strokeText(`+${money(e.cash)}`, x, ty);
    g.fillStyle = e.gold ? '#ffe066' : '#ffb347';
    g.fillText(`+${money(e.cash)}`, x, ty);
    g.restore();
  }

  /** The red target turning on the ground under today's Most Wanted (screen px of their feet). */
  ring(g: G, x: number, y: number, t: number, now: number) {
    const pulse = 0.5 + 0.5 * Math.sin(now / 400);
    const rx = t * 0.75;
    const ry = t * 0.28;
    g.save();
    g.globalCompositeOperation = 'lighter';
    const glow = g.createRadialGradient(x, y, 0, x, y, rx * 1.4);
    glow.addColorStop(0, `rgba(255, 40, 60, ${0.28 + 0.12 * pulse})`);
    glow.addColorStop(1, 'rgba(255, 40, 60, 0)');
    g.fillStyle = glow;
    g.beginPath();
    g.ellipse(x, y, rx * 1.4, ry * 1.4, 0, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = 'source-over';
    g.strokeStyle = `rgba(255, 59, 79, ${0.75 + 0.25 * pulse})`;
    g.lineWidth = Math.max(2, t * 0.06);
    g.beginPath();
    g.ellipse(x, y, rx * 0.72, ry * 0.72, 0, 0, Math.PI * 2);
    g.stroke();
    // The outer ring in four turning pieces, like a scope.
    const turn = now / 900;
    g.lineWidth = Math.max(2.5, t * 0.08);
    g.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const a = turn + (i * Math.PI) / 2;
      g.beginPath();
      g.ellipse(x, y, rx, ry, 0, a, a + 0.9);
      g.stroke();
    }
    g.restore();
  }

  /**
   * Off screen: a marker at the edge pointing to the nearest pumpkin, and (for a rival) one to the Most Wanted.
   */
  marks(
    g: G,
    v: HauntView,
    now: number,
    me: { x: number; y: number } | null,
    hunted: { x: number; y: number; bounty: number } | null,
  ) {
    if (!me) return;
    const near = this.pumpkins
      .map((p) => ({ p, d: Math.hypot(p.x - me.x, p.y - me.y) }))
      .sort((a, b) => a.d - b.d)[0];
    if (near && near.d < 60)
      this.edge(g, v, now, near.p, near.p.gold ? '#ffd23f' : '#ff8a1f', money(near.p.cash), 'pumpkin');
    if (hunted) this.edge(g, v, now, hunted, '#ff3b4f', money(hunted.bounty), 'target');
  }

  private edge(
    g: G,
    v: HauntView,
    now: number,
    at: { x: number; y: number },
    color: string,
    label: string,
    icon: 'pumpkin' | 'target',
  ) {
    const W = v.view.w;
    const H = v.view.h;
    const px = v.sx(at.x);
    const py = v.sy(at.y);
    const m = 34;
    // Anywhere on screen (even half in at an edge) it's seen already: no marker over it.
    const t = v.t;
    if (px >= -t * 0.6 && px <= W + t * 0.6 && py >= -t * 0.3 && py <= H + t * 1.6) return;
    const cx = W / 2;
    const cy = H / 2;
    const ang = Math.atan2(py - cy, px - cx);
    const k = Math.min(
      Math.abs((W / 2 - m) / Math.cos(ang) || Infinity),
      Math.abs((H / 2 - m) / Math.sin(ang) || Infinity),
    );
    const x = cx + Math.cos(ang) * k;
    const y = cy + Math.sin(ang) * k;
    const r = 16;
    const bob = 1 + 0.06 * Math.sin(now / 180);
    g.save();
    g.translate(x, y);
    g.scale(bob, bob);
    g.save();
    g.rotate(ang);
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(r + 9, 0);
    g.lineTo(r - 1, -7);
    g.lineTo(r - 1, 7);
    g.closePath();
    g.fill();
    g.restore();
    g.shadowColor = 'rgba(0,0,0,0.5)';
    g.shadowBlur = 8;
    g.fillStyle = 'rgba(20, 16, 32, 0.92)';
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.fill();
    g.shadowColor = 'transparent';
    g.strokeStyle = color;
    g.lineWidth = 2.5;
    g.stroke();
    if (icon === 'pumpkin') {
      g.fillStyle = color;
      g.beginPath();
      g.ellipse(-3.2, 2, 4.2, 5.2, 0, 0, Math.PI * 2);
      g.ellipse(3.2, 2, 4.2, 5.2, 0, 0, Math.PI * 2);
      g.ellipse(0, 2, 4.4, 5.8, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#3b6b16';
      g.fillRect(-1, -6, 2.4, 4);
    } else {
      g.strokeStyle = color;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(0, 0, 7, 0, Math.PI * 2);
      g.moveTo(0, -11);
      g.lineTo(0, -4);
      g.moveTo(0, 4);
      g.lineTo(0, 11);
      g.moveTo(-11, 0);
      g.lineTo(-4, 0);
      g.moveTo(4, 0);
      g.lineTo(11, 0);
      g.stroke();
    }
    // Its price under the marker.
    g.font = `800 11px ${this.font}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const lw = g.measureText(label).width + 10;
    g.fillStyle = color;
    g.beginPath();
    g.roundRect(-lw / 2, r + 3, lw, 15, 7.5);
    g.fill();
    g.fillStyle = INK;
    g.fillText(label, 0, r + 11);
    g.restore();
  }

  private mist: HTMLCanvasElement | null = null;

  /** A soft cloudy tile, drawn once: the Blood Moon's mist, drifting over the streets. */
  private mistTile() {
    if (this.mist) return this.mist;
    const S = 512;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d')!;
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    // Soft blobs, wrapped round the edges so the tile repeats without a seam.
    for (let i = 0; i < 26; i++) {
      const x = rnd() * S;
      const y = rnd() * S;
      const r = S * (0.08 + rnd() * 0.16);
      for (const dx of [-S, 0, S])
        for (const dy of [-S, 0, S]) {
          const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
          gr.addColorStop(0, `rgba(170, 24, 44, ${0.22 + rnd() * 0.1})`);
          gr.addColorStop(1, 'rgba(170, 24, 44, 0)');
          g.fillStyle = gr;
          g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
        }
    }
    this.mist = c;
    return c;
  }

  /**
   * The Blood Moon in the city, without a filter over the screen: the street lamps burn crimson, a low red mist
   * drifts along the streets, the edges of the night go a little red, and the moon shows in the plaza
   * fountain's water. (The moon itself is in the badge under the map.)
   */
  bloodMoon(g: G, v: HauntView, now: number) {
    if (!this.moon) return;
    const W = v.view.w;
    const H = v.view.h;
    const t = v.t;
    const seen = (x: number, y: number, m: number) => x > -m && x < W + m && y > -m && y < H + m;
    g.save();
    // The mist, in two layers drifting at different speeds, so it rolls.
    const tile = this.mistTile();
    const size = t * 14;
    for (const [speed, alpha, scale] of [
      [0.012, 0.12, 1],
      [-0.008, 0.08, 1.6],
    ] as const) {
      const sz = size * scale;
      const ox = (((v.cam.x * 0.9 + now * speed * t) % sz) + sz) % sz;
      const oy = (((v.cam.y * 0.9 + now * speed * 0.4 * t) % sz) + sz) % sz;
      g.globalAlpha = alpha;
      for (let x = -ox; x < W; x += sz) for (let y = -oy; y < H; y += sz) g.drawImage(tile, x, y, sz, sz);
    }
    g.globalAlpha = 1;
    // A faint red at the edges of the night.
    const edge = g.createRadialGradient(
      W / 2,
      H / 2,
      Math.min(W, H) * 0.4,
      W / 2,
      H / 2,
      Math.max(W, H) * 0.75,
    );
    edge.addColorStop(0, 'rgba(120, 8, 24, 0)');
    edge.addColorStop(1, 'rgba(90, 6, 20, 0.1)');
    g.fillStyle = edge;
    g.fillRect(0, 0, W, H);
    // Crimson lamps.
    g.globalCompositeOperation = 'lighter';
    for (const p of CITY.props) {
      if (p.kind !== 'lamp') continue;
      const x = v.sx(p.x);
      const y = v.sy(p.y) - t * 1.95;
      if (!seen(x, y, t * 3)) continue;
      const flick = 0.96 + 0.04 * Math.sin(now / 1500 + p.x * 3);
      const r = t * 1.4;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(255, 70, 60, ${0.32 * flick})`);
      gr.addColorStop(0.3, `rgba(220, 30, 40, ${0.12 * flick})`);
      gr.addColorStop(1, 'rgba(200, 20, 30, 0)');
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    g.globalCompositeOperation = 'source-over';
    // The moon in the fountain: its picture in the water, rippling.
    const moon = hArt('blood-moon');
    if (moon)
      for (const p of CITY.props) {
        if (p.kind !== 'fountain') continue;
        const x = v.sx(p.x);
        const y = v.sy(p.y) - t * 0.08;
        if (!seen(x, y, t * 3)) continue;
        g.save();
        g.beginPath();
        g.ellipse(x, y, t * 0.92, t * 0.44, 0, 0, Math.PI * 2);
        g.clip();
        const r = t * 0.5;
        const wob = Math.sin(now / 700) * t * 0.04;
        g.globalAlpha = 0.45;
        g.drawImage(moon, x + t * 0.25 - r + wob, y - r * 0.55, r * 2, r * 1.1);
        g.restore();
      }
    g.restore();
  }

  font = 'Impact, sans-serif';
}
