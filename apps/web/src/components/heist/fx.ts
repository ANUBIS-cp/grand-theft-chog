// Short-lived effects drawn over the vault: sparks, floating numbers, rings, beams and screen shake.
// Only for looks: nothing here feeds back into the game rules, so it may use Math.random freely.

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  gravity: number;
}

interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  max: number;
  big: boolean;
}

interface Ring {
  x: number;
  y: number;
  life: number;
  max: number;
  color: string;
  radius: number;
}

interface Beam {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  life: number;
  max: number;
  color: string;
}

export class Fx {
  particles: Particle[] = [];
  floaters: Floater[] = [];
  rings: Ring[] = [];
  beams: Beam[] = [];
  shake = 0;
  flash = 0;
  flashColor = '#ffffff';

  burst(x: number, y: number, n: number, colors: string[], speed = 2.2, gravity = 0.12) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random());
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - speed * 0.6,
        life: 0,
        max: 26 + Math.random() * 18,
        size: 1.5 + Math.random() * 2.5,
        color: colors[i % colors.length]!,
        gravity,
      });
    }
  }

  float(x: number, y: number, text: string, color: string, big = false) {
    this.floaters.push({ x, y, text, color, life: 0, max: big ? 70 : 45, big });
  }

  ring(x: number, y: number, radius: number, color: string, max = 36) {
    this.rings.push({ x, y, life: 0, max, color, radius });
  }

  beam(x1: number, y1: number, x2: number, y2: number, color: string) {
    this.beams.push({ x1, y1, x2, y2, life: 0, max: 14, color });
  }

  /** Advance one display frame (~60 per second). */
  tick() {
    for (const p of this.particles) {
      p.life++;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.vx *= 0.97;
    }
    this.particles = this.particles.filter((p) => p.life < p.max);
    for (const f of this.floaters) f.life++;
    this.floaters = this.floaters.filter((f) => f.life < f.max);
    for (const r of this.rings) r.life++;
    this.rings = this.rings.filter((r) => r.life < r.max);
    for (const b of this.beams) b.life++;
    this.beams = this.beams.filter((b) => b.life < b.max);
    this.shake *= 0.86;
    if (this.shake < 0.3) this.shake = 0;
    this.flash *= 0.88;
    if (this.flash < 0.01) this.flash = 0;
  }

  draw(g: CanvasRenderingContext2D, t: number, font: string) {
    for (const b of this.beams) {
      const k = 1 - b.life / b.max;
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = b.color;
      g.lineCap = 'round';
      g.shadowColor = b.color;
      g.shadowBlur = t * 0.6;
      g.globalAlpha = k;
      g.lineWidth = t * 0.22 * k + 1;
      g.beginPath();
      g.moveTo(b.x1, b.y1);
      g.lineTo(b.x2, b.y2);
      g.stroke();
      g.strokeStyle = '#ffffff';
      g.lineWidth = t * 0.07 * k + 0.5;
      g.stroke();
      g.restore();
    }
    for (const r of this.rings) {
      const k = r.life / r.max;
      g.save();
      g.globalAlpha = (1 - k) * 0.9;
      g.strokeStyle = r.color;
      g.lineWidth = 3 * (1 - k) + 1;
      g.beginPath();
      g.arc(r.x, r.y, r.radius * (0.2 + k), 0, Math.PI * 2);
      g.stroke();
      g.restore();
    }
    for (const p of this.particles) {
      g.globalAlpha = 1 - p.life / p.max;
      g.fillStyle = p.color;
      g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    g.globalAlpha = 1;
    for (const f of this.floaters) {
      const k = f.life / f.max;
      const rise = (f.big ? 1.4 : 0.9) * t * Math.min(1, k * 1.6);
      const pop = k < 0.15 ? 0.6 + (k / 0.15) * 0.5 : 1.1 - Math.min(0.1, (k - 0.15) * 0.4);
      g.save();
      g.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      g.translate(f.x, f.y - rise);
      g.scale(pop, pop);
      g.font = `${Math.round(t * (f.big ? 0.8 : 0.48))}px ${font}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineJoin = 'round';
      g.lineWidth = Math.max(3, t * 0.12);
      g.strokeStyle = '#0d0b1a';
      g.strokeText(f.text, 0, 0);
      g.fillStyle = f.color;
      g.fillText(f.text, 0, 0);
      g.restore();
    }
  }
}
