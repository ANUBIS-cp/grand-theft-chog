import type { RushState } from '@chog-city/game/rush';
import { hArt } from '../halloween-art';

// A haunted vault (Halloween): the lights are out. You carry a lantern, a warm circle that breathes a little;
// past it the vault is near-black. What gives itself away in the dark is drawn over the top: guards' eyes,
// a glint now and then off the cash, the lasers, the exit's green and the safe's gold. And the phantom: a
// see-through Chog with a wavy hem, drifting through the walls with a trail of mist, rising out of the floor
// and sinking back into it.

const MIST = '150, 255, 215';

export interface HauntDraw {
  g: CanvasRenderingContext2D;
  t: number;
  dpr: number;
  now: number;
  /** Screen size (CSS px) and the camera (world px at the screen's top left). */
  view: { w: number; h: number };
  cam: { x: number; y: number };
  /** World px of a position in tiles. */
  X: (x: number) => number;
  Y: (y: number) => number;
}

export class HauntFx {
  private dark: HTMLCanvasElement | null = null;
  private trail: { x: number; y: number; at: number }[] = [];
  private trailAt = 0;
  /** When the phantom last appeared, and where and when it last sank away (for the fades). */
  private shownAt = -1e9;
  private sank: { x: number; y: number; at: number } | null = null;
  private wasOut = true;

  /**
   * The dark, in screen space: everything is covered, then light is cut back out where it falls.
   * `lantern` is the screen position the light follows (you, or the guard a defender steers).
   */
  darkness(d: HauntDraw, s: RushState, lantern: { x: number; y: number }, lights: Light[]) {
    const { g, dpr, view, now, t } = d;
    const w = Math.max(1, Math.round(view.w * dpr));
    const h = Math.max(1, Math.round(view.h * dpr));
    if (!this.dark || this.dark.width !== w || this.dark.height !== h) {
      this.dark = document.createElement('canvas');
      this.dark.width = w;
      this.dark.height = h;
    }
    const k = this.dark.getContext('2d')!;
    k.setTransform(dpr, 0, 0, dpr, 0, 0);
    k.globalCompositeOperation = 'source-over';
    k.clearRect(0, 0, view.w, view.h);
    // The alarm throws red emergency light: the dark lifts a little and pulses.
    const alarm = s.alarm > 0 ? 0.5 + 0.5 * Math.sin(now / 160) : 0;
    k.fillStyle = `rgba(4, 2, 12, ${0.94 - alarm * 0.1})`;
    k.fillRect(0, 0, view.w, view.h);
    k.globalCompositeOperation = 'destination-out';
    const hole = (x: number, y: number, r: number, strength: number) => {
      const gr = k.createRadialGradient(x, y, r * 0.3, x, y, r);
      gr.addColorStop(0, `rgba(0,0,0,${strength})`);
      gr.addColorStop(0.55, `rgba(0,0,0,${strength * 0.75})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      k.fillStyle = gr;
      k.beginPath();
      k.arc(x, y, r, 0, Math.PI * 2);
      k.fill();
    };
    // A candle's breath: two slow waves and a quick one.
    const breathe = 1 + 0.035 * Math.sin(now / 410) + 0.02 * Math.sin(now / 137) + 0.012 * Math.sin(now / 53);
    hole(lantern.x, lantern.y, t * 3.9 * breathe, 1);
    for (const l of lights) hole(l.x - d.cam.x, l.y - d.cam.y, t * l.r, l.strength);
    k.globalCompositeOperation = 'source-over';
    g.save();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.drawImage(this.dark, 0, 0, view.w, view.h);
    // The lantern's warm colour on what it lights.
    g.globalCompositeOperation = 'lighter';
    const warm = g.createRadialGradient(lantern.x, lantern.y, 0, lantern.x, lantern.y, t * 3.4 * breathe);
    warm.addColorStop(0, 'rgba(255, 176, 92, 0.16)');
    warm.addColorStop(0.6, 'rgba(255, 140, 60, 0.06)');
    warm.addColorStop(1, 'rgba(255, 120, 40, 0)');
    g.fillStyle = warm;
    g.fillRect(lantern.x - t * 4, lantern.y - t * 4, t * 8, t * 8);
    g.restore();
  }

  /** Guards' eyes in the dark: two red points with a glow, blinking now and then. World space. */
  eyes(d: HauntDraw, s: RushState, at: (i: number) => { x: number; y: number }) {
    const { g, t, now } = d;
    s.guards.forEach((gd, i) => {
      if (gd.mode === 'out') return;
      const blink = (now / 1000 + i * 1.7) % 4.2 < 0.12;
      if (blink) return;
      const p = at(i);
      const y = p.y - t * 0.42;
      const dx = t * 0.13;
      const shift = gd.face * t * 0.04;
      const scared = gd.mode === 'panic';
      const col = scared ? '120, 180, 255' : '255, 60, 70';
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (const sx of [-dx, dx]) {
        const ex = p.x + sx + shift;
        const gr = g.createRadialGradient(ex, y, 0, ex, y, t * 0.22);
        gr.addColorStop(0, `rgba(${col}, 0.9)`);
        gr.addColorStop(1, `rgba(${col}, 0)`);
        g.fillStyle = gr;
        g.beginPath();
        g.arc(ex, y, t * 0.22, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(255, 235, 235, 0.95)';
        g.beginPath();
        g.ellipse(ex, y, t * 0.045, t * 0.032, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    });
  }

  /** A glint off a coin or a stack now and then, so the cash can be found in the dark. World space. */
  glints(d: HauntDraw, spots: { x: number; y: number; big: boolean }[]) {
    const { g, t, now } = d;
    g.save();
    g.globalCompositeOperation = 'lighter';
    spots.forEach((p, i) => {
      const win = p.big ? 0.1 : 0.035;
      const k = (now / 2600 + i * 0.618) % 1;
      if (k > win) return;
      const a = Math.sin((k / win) * Math.PI);
      const r = t * (p.big ? 0.26 : 0.15) * a;
      g.strokeStyle = `rgba(255, 236, 160, ${0.7 * a})`;
      g.lineWidth = Math.max(1, t * 0.035);
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(p.x - r, p.y);
      g.lineTo(p.x + r, p.y);
      g.moveTo(p.x, p.y - r);
      g.lineTo(p.x, p.y + r);
      g.stroke();
      const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 1.2);
      gr.addColorStop(0, `rgba(255, 220, 120, ${0.5 * a})`);
      gr.addColorStop(1, 'rgba(255, 220, 120, 0)');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(p.x, p.y, r * 1.2, 0, Math.PI * 2);
      g.fill();
    });
    g.restore();
  }

  /**
   * The phantom, in world space at `p` (its tile position eased between steps). Handles its rise out of the
   * floor, the mist it trails, and sinking away when it's gone.
   */
  phantom(d: HauntDraw, s: RushState, p: { x: number; y: number } | null) {
    const { now } = d;
    const ph = s.phantom;
    if (!ph) return;
    const out = ph.out > 0;
    if (!out && this.wasOut) {
      this.shownAt = now;
      this.trail = [];
    }
    if (out && !this.wasOut && p) this.sank = { x: p.x, y: p.y, at: now };
    this.wasOut = out;
    // Sinking away: it stretches up and thins out.
    if (this.sank) {
      const k = (now - this.sank.at) / 650;
      if (k >= 1) this.sank = null;
      else if (
        !this.sprite(d, this.sank.x, this.sank.y - k * d.t * 0.6, ph.face, 1 - k, 1 + k * 0.35, 1 - k * 0.4)
      )
        this.ghost(d, this.sank.x, this.sank.y - k * d.t * 0.6, ph.face, 1 - k, 1 + k * 0.35, 1 - k * 0.4);
    }
    if (out || !p) return;
    if (now - this.trailAt > 55) {
      this.trailAt = now;
      this.trail.push({ x: p.x, y: p.y, at: now });
      if (this.trail.length > 14) this.trail.shift();
    }
    this.mist(d);
    const rise = Math.min(1, (now - this.shownAt) / 750);
    const ease = 1 - (1 - rise) ** 3;
    if (!this.sprite(d, p.x, p.y + (1 - ease) * d.t * 0.5, ph.face, ease, 0.7 + 0.3 * ease, 1))
      this.ghost(d, p.x, p.y + (1 - ease) * d.t * 0.5, ph.face, ease, 0.7 + 0.3 * ease, 1);
  }

  private mist(d: HauntDraw) {
    const { g, t, now } = d;
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const m of this.trail) {
      const age = (now - m.at) / 800;
      if (age >= 1) continue;
      const r = t * (0.18 + age * 0.35);
      const gr = g.createRadialGradient(m.x, m.y + t * 0.1, 0, m.x, m.y + t * 0.1, r);
      gr.addColorStop(0, `rgba(${MIST}, ${0.22 * (1 - age)})`);
      gr.addColorStop(1, `rgba(${MIST}, 0)`);
      g.fillStyle = gr;
      g.beginPath();
      g.arc(m.x, m.y + t * 0.1, r, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }

  /**
   * The ghost itself: a Chog's round head with its spikes swept back, big round Chog eyes, little wisps of arms
   * reaching the way it drifts, and a body that narrows into a swaying tail. Lit from inside, with a halo.
   */
  /** The phantom's picture when it's loaded (else the drawn one): floating, breathing, its halo and pool. */
  private sprite(
    d: HauntDraw,
    x: number,
    y: number,
    face: number,
    alpha: number,
    scale: number,
    stretch: number,
  ) {
    const img = hArt('phantom');
    if (!img) return false;
    const { g, t, now } = d;
    const bob = Math.sin(now / 340) * t * 0.08;
    const h = t * 2.2 * scale * (2 - stretch);
    const w = (h * img.width) / img.height;
    // Breathing: a slow squash and stretch.
    const breathe = 1 + 0.035 * Math.sin(now / 520);
    g.save();
    g.globalAlpha = alpha;
    g.globalCompositeOperation = 'lighter';
    const halo = g.createRadialGradient(x, y - h * 0.45 + bob, h * 0.1, x, y - h * 0.45 + bob, h * 0.9);
    halo.addColorStop(0, `rgba(${MIST}, 0.26)`);
    halo.addColorStop(1, `rgba(${MIST}, 0)`);
    g.fillStyle = halo;
    g.beginPath();
    g.arc(x, y - h * 0.45 + bob, h * 0.9, 0, Math.PI * 2);
    g.fill();
    const pool = g.createRadialGradient(x, y + t * 0.38, 0, x, y + t * 0.38, t * 0.95);
    pool.addColorStop(0, `rgba(${MIST}, 0.3)`);
    pool.addColorStop(1, `rgba(${MIST}, 0)`);
    g.fillStyle = pool;
    g.beginPath();
    g.ellipse(x, y + t * 0.38, t * 0.95, t * 0.34, 0, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = 'source-over';
    g.translate(x, y + t * 0.3 + bob);
    // Leaning into the way it drifts.
    g.rotate(face * -0.06);
    g.scale(face < 0 ? -1 / breathe : 1 / breathe, breathe);
    g.globalAlpha = alpha * 0.92;
    g.drawImage(img, -w / 2, -h, w, h);
    g.restore();
    return true;
  }

  private ghost(
    d: HauntDraw,
    x: number,
    y: number,
    face: number,
    alpha: number,
    scale: number,
    stretch: number,
  ) {
    const { g, t, now } = d;
    const R = t * 0.5 * scale;
    const bob = Math.sin(now / 340) * t * 0.08;
    const hx = x;
    const hy = y - R * 0.95 + bob;
    const sway = Math.sin(now / 420) * R * 0.35;
    const tailY = hy + R * 2.45 * (2 - stretch);
    const lean = -face * R * 0.12;
    g.save();
    g.globalAlpha = alpha;
    // Halo, and its light pooled on the floor.
    g.globalCompositeOperation = 'lighter';
    const halo = g.createRadialGradient(hx, hy + R * 0.5, R * 0.3, hx, hy + R * 0.5, R * 2.6);
    halo.addColorStop(0, `rgba(${MIST}, 0.22)`);
    halo.addColorStop(1, `rgba(${MIST}, 0)`);
    g.fillStyle = halo;
    g.beginPath();
    g.arc(hx, hy + R * 0.5, R * 2.6, 0, Math.PI * 2);
    g.fill();
    const pool = g.createRadialGradient(x, y + t * 0.38, 0, x, y + t * 0.38, t * 0.95);
    pool.addColorStop(0, `rgba(${MIST}, 0.3)`);
    pool.addColorStop(1, `rgba(${MIST}, 0)`);
    g.fillStyle = pool;
    g.beginPath();
    g.ellipse(x, y + t * 0.38, t * 0.95, t * 0.34, 0, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = 'source-over';

    // The silhouette: up the left side, round the spiky crown, down the right side into the tail.
    g.beginPath();
    g.moveTo(hx - R, hy + R * 0.1);
    const spikes = 5;
    for (let i = 0; i <= spikes; i++) {
      // Points round the top of the head, from the left (180°) to the right (360°).
      const a0 = Math.PI + (Math.PI * i) / spikes;
      const bx = hx + Math.cos(a0) * R;
      const by = hy + Math.sin(a0) * R;
      g.lineTo(bx, by);
      if (i === spikes) break;
      // Each spike leans back from the way it drifts, and stirs a little.
      const am = Math.PI + (Math.PI * (i + 0.5)) / spikes;
      const len = R * (0.42 + 0.16 * Math.sin(i * 2.1)) * (1 + 0.06 * Math.sin(now / 260 + i));
      const tx = hx + Math.cos(am) * (R + len) + lean * (1.2 + i * 0.1);
      const ty = hy + Math.sin(am) * (R + len);
      g.quadraticCurveTo(
        hx + Math.cos(am - 0.12) * (R + len * 0.5),
        hy + Math.sin(am - 0.12) * (R + len * 0.5),
        tx,
        ty,
      );
      const a1 = Math.PI + (Math.PI * (i + 1)) / spikes;
      g.quadraticCurveTo(
        hx + Math.cos(am + 0.1) * (R + len * 0.35),
        hy + Math.sin(am + 0.1) * (R + len * 0.35),
        hx + Math.cos(a1 - 0.08) * R,
        hy + Math.sin(a1 - 0.08) * R,
      );
    }
    g.bezierCurveTo(
      hx + R * 1.12,
      hy + R * 0.9,
      hx + R * 0.85,
      hy + R * 1.6,
      hx + R * 0.35 + sway * 0.4,
      hy + R * 2.0,
    );
    g.quadraticCurveTo(hx + R * 0.1 + sway, tailY - R * 0.2, hx + sway * 1.6, tailY);
    g.quadraticCurveTo(hx - R * 0.2 + sway * 0.6, hy + R * 1.9, hx - R * 0.55 + sway * 0.2, hy + R * 1.75);
    g.bezierCurveTo(hx - R * 0.95, hy + R * 1.45, hx - R * 1.12, hy + R * 0.85, hx - R, hy + R * 0.1);
    g.closePath();
    const body = g.createLinearGradient(hx, hy - R * 1.4, hx, tailY);
    body.addColorStop(0, 'rgba(244, 255, 251, 0.96)');
    body.addColorStop(0.45, 'rgba(200, 255, 236, 0.86)');
    body.addColorStop(0.8, 'rgba(150, 255, 218, 0.4)');
    body.addColorStop(1, 'rgba(130, 255, 210, 0)');
    g.shadowColor = `rgba(${MIST}, 1)`;
    g.shadowBlur = t * 0.7;
    g.fillStyle = body;
    g.fill();
    g.shadowBlur = 0;
    // A cold rim of light down the side away from you, for shape.
    g.save();
    g.clip();
    const rim = g.createRadialGradient(hx - R * 0.35, hy - R * 0.4, R * 0.2, hx, hy + R * 0.3, R * 1.6);
    rim.addColorStop(0, 'rgba(255,255,255,0)');
    rim.addColorStop(0.75, 'rgba(255,255,255,0)');
    rim.addColorStop(1, 'rgba(120, 230, 210, 0.35)');
    g.fillStyle = rim;
    g.fillRect(hx - R * 2, hy - R * 2, R * 4, R * 5);
    g.restore();

    // Little arms, reaching the way it drifts.
    g.strokeStyle = 'rgba(214, 255, 240, 0.85)';
    g.lineCap = 'round';
    for (const side of [-1, 1]) {
      const reach = side === face ? 1 : 0.55;
      const sx = hx + side * R * 0.92;
      const sy = hy + R * 0.95;
      const wave = Math.sin(now / 200 + side) * R * 0.12;
      g.lineWidth = R * 0.22;
      g.beginPath();
      g.moveTo(sx, sy);
      g.quadraticCurveTo(
        sx + side * R * 0.45 * reach,
        sy - R * 0.05 + wave,
        sx + side * R * 0.62 * reach,
        sy + R * 0.28 + wave,
      );
      g.stroke();
    }

    // Big round Chog eyes, dark, with a cold glint; they look the way it drifts.
    const look = face * R * 0.14;
    const ey = hy + R * 0.12;
    for (const sx of [-0.38, 0.38]) {
      const ex = hx + R * sx + look;
      g.fillStyle = '#100b1f';
      g.beginPath();
      g.ellipse(ex, ey, R * 0.25, R * 0.31, 0, 0, Math.PI * 2);
      g.fill();
      const glow = g.createRadialGradient(
        ex + look * 0.35,
        ey + R * 0.04,
        0,
        ex + look * 0.35,
        ey + R * 0.04,
        R * 0.16,
      );
      glow.addColorStop(0, `rgba(${MIST}, 1)`);
      glow.addColorStop(1, `rgba(${MIST}, 0)`);
      g.fillStyle = glow;
      g.beginPath();
      g.arc(ex + look * 0.35, ey + R * 0.04, R * 0.16, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.9)';
      g.beginPath();
      g.arc(ex - R * 0.08, ey - R * 0.12, R * 0.055, 0, Math.PI * 2);
      g.fill();
    }
    // A wailing mouth.
    const open = 0.12 + 0.05 * Math.sin(now / 230);
    g.fillStyle = '#100b1f';
    g.beginPath();
    g.ellipse(hx + look * 0.8, ey + R * 0.58, R * 0.13, R * open, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  /** The phantom off screen: a mint ring at the edge with a little ghost in it, pointing at it. */
  mark(d: HauntDraw, s: RushState, p: { x: number; y: number } | null) {
    const { g, now, view, cam } = d;
    const ph = s.phantom;
    if (!ph || ph.out > 0 || !p) return;
    const gx = p.x - cam.x;
    const gy = p.y - cam.y;
    const m = 26;
    if (gx >= 0 && gy >= 0 && gx <= view.w && gy <= view.h) return;
    const x = Math.max(m, Math.min(view.w - m, gx));
    const y = Math.max(m, Math.min(view.h - m, gy));
    const ang = Math.atan2(gy - y, gx - x);
    const r = 15;
    g.save();
    g.setTransform(d.dpr, 0, 0, d.dpr, 0, 0);
    g.translate(x, y);
    g.globalAlpha = 0.8 + 0.2 * Math.sin(now / 200);
    g.save();
    g.rotate(ang);
    g.fillStyle = `rgb(${MIST})`;
    g.beginPath();
    g.moveTo(r + 8, 0);
    g.lineTo(r - 2, -7);
    g.lineTo(r - 2, 7);
    g.closePath();
    g.fill();
    g.restore();
    g.fillStyle = 'rgba(14, 30, 28, 0.92)';
    g.strokeStyle = `rgb(${MIST})`;
    g.lineWidth = 2.5;
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    // A tiny sheet ghost.
    g.fillStyle = `rgba(${MIST}, 0.95)`;
    g.beginPath();
    g.arc(0, -2, 6.5, Math.PI, 0);
    g.lineTo(6.5, 7);
    g.lineTo(3.2, 4.5);
    g.lineTo(0, 7);
    g.lineTo(-3.2, 4.5);
    g.lineTo(-6.5, 7);
    g.closePath();
    g.fill();
    g.fillStyle = '#0e1e1c';
    g.beginPath();
    g.arc(-2.4, -2, 1.4, 0, Math.PI * 2);
    g.arc(2.4, -2, 1.4, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
}

/** Something that gives off light in the dark: world px, radius in tiles, how strongly (0-1). */
export interface Light {
  x: number;
  y: number;
  r: number;
  strength: number;
}
