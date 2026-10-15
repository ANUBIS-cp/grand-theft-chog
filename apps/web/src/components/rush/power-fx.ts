import type { PowerId } from '@chog-city/game/heist';
import type { RushState } from '@chog-city/game/rush';

// What each power looks like when you use it, so every one feels different: laser beams out of your eyes
// into the guard, a cardboard box to hide in, after-images when you sprint, a puff and a streak when you
// blink, a coin thrown to where the noise goes off, a shockwave that sends guards running. Looks only.

type P = { x: number; y: number };

interface Laser {
  guard: number;
  at: number;
}
interface Streak {
  from: P;
  to: P;
  at: number;
}
interface Toss {
  from: P;
  to: P;
  at: number;
}
interface Wave {
  x: number;
  y: number;
  at: number;
  color: string;
  size: number;
}
interface Puff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  at: number;
  life: number;
  r: number;
  color: string;
}

const LASER_MS = 520;
const STREAK_MS = 380;
const TOSS_MS = 520;
const WAVE_MS = 650;

export class PowerFx {
  private lasers: Laser[] = [];
  private streaks: Streak[] = [];
  private tosses: Toss[] = [];
  private waves: Wave[] = [];
  private puffs: Puff[] = [];
  private ghosts: (P & { at: number })[] = [];
  private lastGhost = 0;
  private hackAt = -1e9;
  private wasHidden = false;

  /** A power just went off. Positions are in vault pixels. */
  on(id: PowerId, now: number, me: P, opt: { guard?: number; from?: P; noise?: P | null } = {}) {
    switch (id) {
      case 'zap':
        if (opt.guard !== undefined) this.lasers.push({ guard: opt.guard, at: now });
        break;
      case 'blink':
        if (opt.from) {
          this.streaks.push({ from: opt.from, to: me, at: now });
          this.poof(opt.from, '#b48cff', 14, now);
          this.poof(me, '#e9d8ff', 10, now);
        }
        break;
      case 'distract':
        if (opt.noise) this.tosses.push({ from: me, to: opt.noise, at: now });
        break;
      case 'scare':
        this.waves.push({ x: me.x, y: me.y, at: now, color: '#9fd3ff', size: 5 });
        this.waves.push({ x: me.x, y: me.y, at: now + 120, color: '#ffffff', size: 4 });
        break;
      case 'hack':
        this.hackAt = now;
        this.waves.push({ x: me.x, y: me.y, at: now, color: '#5dffa8', size: 9 });
        break;
      case 'tackle':
        this.waves.push({ x: me.x, y: me.y, at: now, color: '#ff9f1c', size: 1.6 });
        break;
      case 'magnet':
        this.waves.push({ x: me.x, y: me.y, at: now, color: '#ffd666', size: 2.6 });
        break;
      case 'sprint':
        this.poof(me, '#ffffff', 8, now);
        break;
      case 'hide':
        this.poof(me, '#c8b48a', 12, now);
        break;
    }
  }

  private poof(p: P, color: string, n: number, now: number) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      const v = 0.6 + Math.random() * 0.9;
      this.puffs.push({
        x: p.x,
        y: p.y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v * 0.6 - 0.3,
        at: now,
        life: 420 + Math.random() * 300,
        r: 0.16 + Math.random() * 0.14,
        color,
      });
    }
  }

  /** Under everyone: shockwaves, the hack's scan, the magnet's field, sprint after-images. */
  under(
    g: CanvasRenderingContext2D,
    t: number,
    s: RushState,
    me: P,
    now: number,
    drawGhost: (x: number, y: number, alpha: number) => void,
  ) {
    // Sprint and tackle leave after-images: copies of you fading out behind.
    const fast = s.fx.sprint > 0 || s.fx.tackle > 0;
    if (fast && s.me.dir !== -1 && now - this.lastGhost > 55) {
      this.ghosts.push({ x: me.x, y: me.y, at: now });
      this.lastGhost = now;
      if (Math.random() < 0.5) this.poof({ x: me.x, y: me.y + t * 0.35 }, 'rgba(255,255,255,0.7)', 1, now);
    }
    this.ghosts = this.ghosts.filter((p) => now - p.at < 260);
    for (const p of this.ghosts) drawGhost(p.x, p.y, 0.32 * (1 - (now - p.at) / 260));

    // Speed lines while sprinting.
    if (fast && s.me.dir !== -1) {
      const dirs: [number, number][] = [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ];
      const [dx, dy] = dirs[s.me.dir] ?? [0, 0];
      g.save();
      g.strokeStyle = s.fx.tackle > 0 ? 'rgba(255,159,28,0.7)' : 'rgba(255,255,255,0.65)';
      g.lineCap = 'round';
      for (let i = 0; i < 5; i++) {
        const k = (now / 140 + i * 0.37) % 1;
        const off = (i - 2) * t * 0.18;
        const bx = me.x - dx * t * (0.6 + k * 1.2) + dy * off;
        const by = me.y - t * 0.3 - dy * t * (0.6 + k * 1.2) + dx * off;
        g.globalAlpha = 1 - k;
        g.lineWidth = 2.5 * (1 - k) + 0.5;
        g.beginPath();
        g.moveTo(bx, by);
        g.lineTo(bx - dx * t * 0.5, by - dy * t * 0.5);
        g.stroke();
      }
      g.restore();
    }

    // Tackle: a fiery aura round you.
    if (s.fx.tackle > 0) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        const k = (now / 260 + i / 3) % 1;
        g.globalAlpha = 0.35 * (1 - k);
        g.fillStyle = i % 2 ? '#ff9f1c' : '#ff4d00';
        g.beginPath();
        g.ellipse(
          me.x,
          me.y - t * 0.1 - k * t * 0.5,
          t * (0.55 - k * 0.2),
          t * (0.7 - k * 0.3),
          0,
          0,
          Math.PI * 2,
        );
        g.fill();
      }
      g.restore();
    }

    // Magnet: field lines curling in towards you.
    if (s.fx.magnet > 0) {
      g.save();
      g.strokeStyle = '#ffd666';
      g.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + now / 900;
        const k = (now / 700 + i / 6) % 1;
        const r = t * (2.4 - k * 2);
        g.globalAlpha = 0.55 * k;
        g.beginPath();
        g.arc(me.x, me.y, r, a, a + 0.6);
        g.stroke();
        // A spark riding each line in.
        g.fillStyle = '#fff3b0';
        g.beginPath();
        g.arc(me.x + Math.cos(a + 0.6) * r, me.y + Math.sin(a + 0.6) * r, 2.2, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    }

    // Shockwaves.
    this.waves = this.waves.filter((w) => now - w.at < WAVE_MS);
    for (const w of this.waves) {
      const k = (now - w.at) / WAVE_MS;
      if (k < 0) continue;
      const e = 1 - (1 - k) ** 3;
      g.save();
      g.globalAlpha = (1 - k) * 0.85;
      g.strokeStyle = w.color;
      g.lineWidth = t * 0.22 * (1 - k) + 1;
      g.beginPath();
      g.ellipse(w.x, w.y, t * w.size * e, t * w.size * e * 0.62, 0, 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = (1 - k) * 0.12;
      g.fillStyle = w.color;
      g.fill();
      g.restore();
    }
  }

  /** Over everyone: laser beams, the blink streak, the thrown coin, puffs, the hack glitch. */
  over(
    g: CanvasRenderingContext2D,
    t: number,
    me: P,
    eyes: { l: P; r: P },
    guardAt: (i: number) => P | null,
    now: number,
    view: { w: number; h: number; x: number; y: number },
  ) {
    this.lasers = this.lasers.filter((l) => now - l.at < LASER_MS);
    for (const l of this.lasers) {
      const to = guardAt(l.guard);
      if (!to) continue;
      const k = (now - l.at) / LASER_MS;
      // The beams snap on, hold, then thin out.
      const w = k < 0.1 ? k / 0.1 : k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
      const hit = { x: to.x, y: to.y - t * 0.5 };
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.lineCap = 'round';
      for (const e of [eyes.l, eyes.r]) {
        const jitter = (Math.random() - 0.5) * t * 0.05;
        g.shadowColor = '#ff2d55';
        g.shadowBlur = t * 0.7;
        g.strokeStyle = '#ff2d55';
        g.lineWidth = t * 0.2 * w + 1;
        g.beginPath();
        g.moveTo(e.x, e.y);
        g.lineTo(hit.x + jitter, hit.y + jitter);
        g.stroke();
        g.shadowBlur = 0;
        g.strokeStyle = '#ffe3e8';
        g.lineWidth = t * 0.06 * w + 0.5;
        g.stroke();
        // A glow on each eye.
        g.fillStyle = '#ff6b8a';
        g.globalAlpha = w;
        g.beginPath();
        g.arc(e.x, e.y, t * 0.12 * w + 1, 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = 1;
      }
      // Sparks where it hits.
      g.fillStyle = '#ffd666';
      for (let i = 0; i < 6; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * t * 0.45 * w;
        g.fillRect(hit.x + Math.cos(a) * r - 1.5, hit.y + Math.sin(a) * r - 1.5, 3, 3);
      }
      g.restore();
      if (k > 0.25 && k < 0.3) this.poof(hit, 'rgba(90,90,100,0.8)', 3, now);
    }

    // Blink: a bright streak from where you were to where you are.
    this.streaks = this.streaks.filter((s) => now - s.at < STREAK_MS);
    for (const s of this.streaks) {
      const k = (now - s.at) / STREAK_MS;
      g.save();
      g.globalCompositeOperation = 'lighter';
      const gr = g.createLinearGradient(s.from.x, s.from.y, s.to.x, s.to.y);
      gr.addColorStop(0, 'rgba(180,140,255,0)');
      gr.addColorStop(1, `rgba(233,216,255,${1 - k})`);
      g.strokeStyle = gr;
      g.lineCap = 'round';
      g.lineWidth = t * 0.5 * (1 - k);
      g.beginPath();
      g.moveTo(s.from.x, s.from.y - t * 0.4);
      g.lineTo(s.to.x, s.to.y - t * 0.4);
      g.stroke();
      g.restore();
    }

    // Distract: a coin flies in an arc and lands where the noise goes off.
    this.tosses = this.tosses.filter((s) => now - s.at < TOSS_MS + 500);
    for (const s of this.tosses) {
      const k = Math.min(1, (now - s.at) / TOSS_MS);
      const x = s.from.x + (s.to.x - s.from.x) * k;
      const y = s.from.y + (s.to.y - s.from.y) * k - Math.sin(k * Math.PI) * t * 2.2 - t * 0.4 * (1 - k);
      if (k < 1) {
        g.save();
        g.translate(x, y);
        g.scale(Math.abs(Math.cos(now / 60)), 1);
        g.fillStyle = '#ffd23f';
        g.strokeStyle = '#0d0b1a';
        g.lineWidth = 1.5;
        g.beginPath();
        g.arc(0, 0, t * 0.14, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        g.restore();
      } else {
        // Clink: rings and a little note where it landed.
        const q = (now - s.at - TOSS_MS) / 500;
        g.save();
        g.globalAlpha = 1 - q;
        g.strokeStyle = '#ffd23f';
        g.lineWidth = 2;
        for (let i = 0; i < 2; i++) {
          g.beginPath();
          g.ellipse(
            s.to.x,
            s.to.y,
            t * (0.4 + q * 1.4 + i * 0.4),
            t * (0.25 + q * 0.8 + i * 0.25),
            0,
            0,
            Math.PI * 2,
          );
          g.stroke();
        }
        g.fillStyle = '#ffd23f';
        g.font = `${Math.round(t * 0.5)}px system-ui`;
        g.textAlign = 'center';
        g.fillText('♪', s.to.x + t * 0.3, s.to.y - t * (0.6 + q * 0.6));
        g.restore();
      }
    }

    // Puffs of smoke and dust.
    this.puffs = this.puffs.filter((p) => now - p.at < p.life);
    for (const p of this.puffs) {
      const k = (now - p.at) / p.life;
      const age = (now - p.at) / 16;
      g.save();
      g.globalAlpha = (1 - k) * 0.8;
      g.fillStyle = p.color;
      g.beginPath();
      g.arc(p.x + p.vx * age, p.y + p.vy * age - k * t * 0.3, t * p.r * (1 + k * 1.2), 0, Math.PI * 2);
      g.fill();
      g.restore();
    }

    // Hack: a green scan sweeps down the screen and the picture glitches for a moment.
    const hk = (now - this.hackAt) / 600;
    if (hk >= 0 && hk < 1) {
      g.save();
      const y = view.y + view.h * hk;
      const gr = g.createLinearGradient(0, y - t * 1.5, 0, y);
      gr.addColorStop(0, 'rgba(93,255,168,0)');
      gr.addColorStop(1, `rgba(93,255,168,${0.35 * (1 - hk)})`);
      g.fillStyle = gr;
      g.fillRect(view.x, y - t * 1.5, view.w, t * 1.5);
      g.fillStyle = `rgba(93,255,168,${0.9 * (1 - hk)})`;
      g.fillRect(view.x, y, view.w, 2);
      g.font = `${Math.round(t * 0.32)}px ui-monospace, monospace`;
      for (let i = 0; i < 14; i++) {
        g.globalAlpha = (1 - hk) * Math.random();
        g.fillText(
          Math.random() < 0.5 ? '0' : '1',
          me.x + (Math.random() - 0.5) * t * 4,
          me.y - Math.random() * t * 2.5,
        );
      }
      g.restore();
    }
  }

  /** Hide: you're a cardboard box with two eyes peeking out, shuffling along. */
  box(
    g: CanvasRenderingContext2D,
    t: number,
    x: number,
    y: number,
    moving: boolean,
    hidden: boolean,
    now: number,
  ) {
    if (hidden !== this.wasHidden) {
      this.poof({ x, y: y - t * 0.3 }, '#c8b48a', 10, now);
      this.wasHidden = hidden;
    }
    if (!hidden) return false;
    const w = t * 1.15;
    const h = t * 0.88;
    const hop = moving ? Math.abs(Math.sin(now / 90)) * t * 0.06 : 0;
    const tilt = moving ? Math.sin(now / 90) * 0.05 : 0;
    g.save();
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath();
    g.ellipse(x, y + t * 0.32, w * 0.55, t * 0.14, 0, 0, Math.PI * 2);
    g.fill();
    g.translate(x, y + t * 0.3 - hop);
    g.rotate(tilt);
    g.lineJoin = 'round';
    g.strokeStyle = '#0d0b1a';
    g.lineWidth = 2;
    // Front.
    g.fillStyle = '#c8955a';
    g.beginPath();
    g.rect(-w / 2, -h, w, h);
    g.fill();
    g.stroke();
    // Lid flaps.
    g.fillStyle = '#ddb07a';
    g.beginPath();
    g.moveTo(-w / 2, -h);
    g.lineTo(-w * 0.62, -h - t * 0.22);
    g.lineTo(-w * 0.08, -h - t * 0.16);
    g.lineTo(0, -h);
    g.closePath();
    g.fill();
    g.stroke();
    g.beginPath();
    g.moveTo(w / 2, -h);
    g.lineTo(w * 0.62, -h - t * 0.22);
    g.lineTo(w * 0.08, -h - t * 0.16);
    g.lineTo(0, -h);
    g.closePath();
    g.fill();
    g.stroke();
    // Tape and a "fragile" stamp.
    g.fillStyle = 'rgba(255,240,200,0.55)';
    g.fillRect(-w * 0.08, -h, w * 0.16, h);
    g.strokeStyle = 'rgba(180,30,40,0.7)';
    g.lineWidth = 1.5;
    g.strokeRect(-w * 0.38, -h * 0.42, w * 0.24, h * 0.18);
    // Eyes peeking out of a slit, looking around.
    g.fillStyle = '#0d0b1a';
    g.fillRect(-w * 0.32, -h * 0.82, w * 0.64, h * 0.16);
    const look = Math.sin(now / 500) * w * 0.06;
    g.fillStyle = '#ffffff';
    for (const ex of [-w * 0.12, w * 0.12]) {
      g.beginPath();
      g.arc(ex + look, -h * 0.74, t * 0.05, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
    return true;
  }
}

/**
 * Which ready power would help right now (its slot), or -1: a guard close for laser eyes or a scare, a guard
 * hunting you for hide or sprint, cash around you for the magnet, a laser gate ahead for hack, a wall in
 * front for blink. Shown as a key bubble over your head so you never have to hunt for the button.
 */
export function powerHint(
  s: RushState,
  m: { coins: P[]; lasers: P[] },
  laserOn: (i: number) => boolean,
): number {
  const me = s.me;
  const d2 = (p: P) => (p.x + 0.5 - me.x) ** 2 + (p.y + 0.5 - me.y) ** 2;
  const guards = s.guards.filter((g) => g.mode !== 'out');
  const nearest = Math.min(Infinity, ...guards.map((g) => (g.x - me.x) ** 2 + (g.y - me.y) ** 2));
  const hunted = guards.some((g) => g.mode === 'hunt' && (g.x - me.x) ** 2 + (g.y - me.y) ** 2 < 30);
  for (let i = 0; i < s.powers.length; i++) {
    const p = s.powers[i]!;
    if (p.used || s.clock < p.ready) continue;
    const busy = p.id in s.fx && s.fx[p.id as keyof RushState['fx']] > 0;
    if (busy) continue;
    switch (p.id) {
      case 'zap':
        if (nearest < 25) return i;
        break;
      case 'scare':
      case 'tackle':
        if (nearest < 9) return i;
        break;
      case 'hide':
      case 'sprint':
        if (hunted || nearest < 6) return i;
        break;
      case 'distract':
        if (nearest < 36 && nearest > 6) return i;
        break;
      case 'magnet':
        if (m.coins.filter((c, k) => s.coins[k] && d2(c) < 9).length >= 4) return i;
        break;
      case 'hack':
        if (m.lasers.some((l, k) => laserOn(k) && d2(l) < 10)) return i;
        break;
      case 'blink':
        if (hunted && s.me.dir !== -1) return i;
        break;
    }
  }
  return -1;
}
