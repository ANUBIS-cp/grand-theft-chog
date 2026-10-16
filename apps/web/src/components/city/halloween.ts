import { CITY, placeOf, type Place } from '@chog-city/game/city';

// Halloween week in the city (packages/server/src/events.ts has the dates). Everything here is drawn by
// CityRenderer at a few points in its frame and lit against its night:
// - Chog-o'-lanterns: pumpkins carved with a Chog's face (big round eyes, a little grin) by every gang's door
//   and round the plaza, candlelight flickering and spilling orange on the pavement; one flares up as you pass.
// - Ghost Chogs: see-through ghosts of real Skulls and Radioactive Chogs, a wavy sheet for a hem, drifting
//   the streets, fading in and out, darting off when you come close.
// - Will-o'-wisps: little lights wandering with sparkle trails; near you they're drawn in and circle you.
// - Fog rolling along the ground in purple and green, parting round your Chog.
// - Your footprints glow green and fade behind you.
// - Bats cross in flocks with their shadows on the street, scattering when they pass over you.
// - Haunted buildings: Radioactive's yard is a bubbling toxic pool, Skulls' roof burns with blue ghost fire.

type G = CanvasRenderingContext2D;

export interface HauntView {
  /** The renderer's canvas. */
  g: G;
  t: number;
  view: { w: number; h: number };
  cam: { x: number; y: number };
  sx: (x: number) => number;
  sy: (y: number) => number;
  /** A Chog's picture, once it has loaded. */
  picture: (chog: number) => CanvasImageSource | undefined;
}

interface Wisp {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hue: number;
  trail: { x: number; y: number }[];
  /** Circling you since (ms), or 0; and when it may come back to you. */
  orbit: number;
  angle: number;
  rest: number;
}

interface Ghost {
  chog: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  /** Fled from you: faster, fainter for a moment. */
  scared: number;
}

interface Bat {
  x: number;
  y: number;
  vx: number;
  vy: number;
  flap: number;
  /** Height above the street (tiles), for its shadow. */
  z: number;
}

interface Step {
  x: number;
  y: number;
  at: number;
  side: number;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Where the lanterns go: two at every gang's door, a ring round the plaza's fountain. Fixed, not random. */
function lanternSpots(): { x: number; y: number; flare: number }[] {
  const out: { x: number; y: number; flare: number }[] = [];
  for (const p of CITY.places)
    if (p.kind === 'gang') {
      out.push(
        { x: p.door.x - 1.35, y: p.door.y + 0.45, flare: 0 },
        { x: p.door.x + 1.35, y: p.door.y + 0.45, flare: 0 },
      );
    }
  const f = CITY.props.find((p) => p.kind === 'fountain');
  if (f)
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      out.push({ x: f.x + Math.cos(a) * 2.9, y: f.y + Math.sin(a) * 2.1 + 0.3, flare: 0 });
    }
  return out;
}

export class Halloween {
  private lanterns = lanternSpots();
  private wisps: Wisp[] = [];
  private ghosts: Ghost[] = [];
  private bats: Bat[] = [];
  private steps: Step[] = [];
  private lastStep: { x: number; y: number } | null = null;
  private stepSide = 1;
  private nextFlock = 0;
  private last = 0;
  private sprites = new Map<string, HTMLCanvasElement>();
  private fog: HTMLCanvasElement | null = null;
  private fogTile: HTMLCanvasElement | null = null;
  private toxic = placeOf('radioactive');
  private skulls = placeOf('skulls');
  private me: { x: number; y: number } | null = null;
  /** The plaza's fountain, a witch's cauldron this week: where every player arrives. */
  private cauldron = CITY.props.find((p) => p.kind === 'fountain') ?? null;

  /** Ghosts wear these Chogs' pictures (the Skulls and Radioactive gangs' own faces). */
  constructor(private ghostChogs: number[]) {}

  // ---------- each frame ----------

  /** Moves everything on. `me` is your Chog (null as a watcher). */
  step(v: HauntView, now: number, me: { x: number; y: number } | null) {
    const dt = Math.min(0.1, this.last ? (now - this.last) / 1000 : 0.016);
    this.last = now;
    this.me = me;
    const t = v.t;
    // What's on screen, in tiles, with a margin.
    const vx0 = v.cam.x / t - 3;
    const vy0 = v.cam.y / t - 3;
    const vx1 = (v.cam.x + v.view.w) / t + 3;
    const vy1 = (v.cam.y + v.view.h) / t + 3;
    const off = (x: number, y: number) => x < vx0 - 6 || x > vx1 + 6 || y < vy0 - 6 || y > vy1 + 6;
    const spawn = () => ({ x: rand(vx0, vx1), y: rand(vy0, vy1) });

    // Lanterns flare as you pass.
    for (const l of this.lanterns) {
      const near = me ? Math.hypot(l.x - me.x, l.y - me.y) < 2.4 : false;
      l.flare += ((near ? 1 : 0) - l.flare) * Math.min(1, dt * (near ? 6 : 1.5));
    }

    // Wisps: wander, and circle you for a while when they come near.
    const WISPS = v.view.w < 600 ? 6 : 9;
    while (this.wisps.length < WISPS) {
      const p = spawn();
      this.wisps.push({
        ...p,
        vx: rand(-0.6, 0.6),
        vy: rand(-0.6, 0.6),
        hue: Math.random() < 0.6 ? 150 : 275,
        trail: [],
        orbit: 0,
        angle: rand(0, 6.28),
        rest: 0,
      });
    }
    for (const w of this.wisps) {
      if (off(w.x, w.y)) Object.assign(w, spawn(), { trail: [], orbit: 0 });
      const d = me ? Math.hypot(me.x - w.x, me.y - w.y) : 99;
      if (me && !w.orbit && d < 4.5 && now > w.rest) w.orbit = now;
      if (w.orbit && me) {
        // Circle your Chog for six seconds, then drift away and leave you alone for a bit.
        w.angle += dt * 2.6;
        const tx = me.x + Math.cos(w.angle) * 1.15;
        const ty = me.y - 0.7 + Math.sin(w.angle) * 0.55;
        w.vx += (tx - w.x) * dt * 9 - w.vx * dt * 3;
        w.vy += (ty - w.y) * dt * 9 - w.vy * dt * 3;
        if (now - w.orbit > 6000) {
          w.orbit = 0;
          w.rest = now + 9000;
          w.vx = (w.x - me.x) * 1.2;
          w.vy = (w.y - me.y) * 1.2;
        }
      } else {
        w.vx += Math.sin(now / 900 + w.hue + w.y) * dt * 0.9;
        w.vy += Math.cos(now / 1100 + w.hue + w.x) * dt * 0.9;
        const sp = Math.hypot(w.vx, w.vy);
        if (sp > 1.1) {
          w.vx *= 1.1 / sp;
          w.vy *= 1.1 / sp;
        }
      }
      w.x += w.vx * dt;
      w.y += w.vy * dt;
      w.trail.unshift({ x: w.x, y: w.y });
      if (w.trail.length > 14) w.trail.pop();
    }

    // Ghost Chogs: drift, and dart away from you.
    const GHOSTS = Math.min(this.ghostChogs.length, v.view.w < 600 ? 3 : 5);
    while (this.ghosts.length < GHOSTS) {
      const p = spawn();
      this.ghosts.push({
        chog: this.ghostChogs[this.ghosts.length % this.ghostChogs.length]!,
        ...p,
        vx: rand(-0.4, 0.4),
        vy: rand(-0.25, 0.25),
        phase: rand(0, 6.28),
        scared: 0,
      });
    }
    for (const gh of this.ghosts) {
      if (off(gh.x, gh.y)) Object.assign(gh, spawn());
      const d = me ? Math.hypot(me.x - gh.x, me.y - gh.y) : 99;
      if (me && d < 2.6 && gh.scared <= 0) {
        gh.scared = 1;
        const k = 3.2 / Math.max(0.3, d);
        gh.vx = (gh.x - me.x) * k;
        gh.vy = (gh.y - me.y) * k;
      }
      gh.scared = Math.max(0, gh.scared - dt * 0.6);
      const calm = 1 - gh.scared;
      gh.vx += (Math.sin(now / 2300 + gh.phase) * 0.35 - gh.vx) * dt * 0.5 * calm;
      gh.vy += (Math.cos(now / 2900 + gh.phase) * 0.2 - gh.vy) * dt * 0.5 * calm;
      gh.x += gh.vx * dt;
      gh.y += gh.vy * dt;
    }

    // Bats: a flock now and then, from one side of the screen to the other.
    if (now > this.nextFlock) {
      this.nextFlock = now + rand(9000, 16000);
      const fromLeft = Math.random() < 0.5;
      const y = rand(vy0 + 3, vy1 - 3);
      const n = Math.round(rand(6, 11));
      for (let i = 0; i < n; i++)
        this.bats.push({
          x: (fromLeft ? vx0 - 1 : vx1 + 1) + rand(-2, 2),
          y: y + rand(-1.6, 1.6),
          vx: (fromLeft ? 1 : -1) * rand(5, 7),
          vy: rand(-0.6, 0.6),
          flap: rand(0, 6.28),
          z: rand(2.2, 3.6),
        });
    }
    for (const b of this.bats) {
      if (me && Math.hypot(me.x - b.x, me.y - b.y) < 2.5 && Math.abs(b.vy) < 3) {
        // Startled: scatter up and away.
        b.vy = (b.y < me.y ? -1 : 1) * rand(3, 6);
        b.vx *= 1.3;
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt + Math.sin(now / 180 + b.flap) * dt * 0.8;
      b.flap += dt * 22;
    }
    this.bats = this.bats.filter((b) => b.x > vx0 - 8 && b.x < vx1 + 8 && b.y > vy0 - 8 && b.y < vy1 + 8);

    // Your footprints.
    if (me) {
      if (!this.lastStep) this.lastStep = { ...me };
      if (Math.hypot(me.x - this.lastStep.x, me.y - this.lastStep.y) > 0.42) {
        this.stepSide = -this.stepSide;
        const dx = me.x - this.lastStep.x;
        const dy = me.y - this.lastStep.y;
        const len = Math.hypot(dx, dy) || 1;
        // Left and right feet, a little to each side of the way you're going.
        this.steps.push({
          x: me.x - (dy / len) * 0.12 * this.stepSide,
          y: me.y + 0.12 + (dx / len) * 0.06 * this.stepSide,
          at: now,
          side: this.stepSide,
        });
        this.lastStep = { ...me };
      }
    }
    this.steps = this.steps.filter((s) => now - s.at < 3200).slice(-40);
  }

  // ---------- drawing ----------

  /** On the ground, under everyone: footprints, the toxic pool, bat shadows, then the fog over it all. */
  ground(g: G, v: HauntView, now: number) {
    const t = v.t;
    // Footprints, glowing green and fading.
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const s of this.steps) {
      const k = 1 - (now - s.at) / 3200;
      g.fillStyle = `rgba(110,255,170,${0.5 * k})`;
      g.beginPath();
      g.ellipse(v.sx(s.x), v.sy(s.y), t * 0.07, t * 0.045, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();

    // Radioactive's yard: a bubbling toxic pool.
    const tox = this.toxic;
    if (tox) {
      const cx = v.sx(tox.door.x + 3.4);
      const cy = v.sy(tox.door.y + 1.4);
      if (cx > -t * 4 && cx < v.view.w + t * 4 && cy > -t * 3 && cy < v.view.h + t * 3) {
        const rw = t * 1.5;
        const rh = t * 0.6;
        // A spill, not an oval: its edge wobbles, with a dark wet rim.
        const blob = (k: number) => {
          g.beginPath();
          for (let i = 0; i <= 24; i++) {
            const a = (i / 24) * Math.PI * 2;
            const wob = 1 + 0.16 * Math.sin(a * 3 + 1.3) + 0.09 * Math.sin(a * 5 + now / 900);
            const px = cx + Math.cos(a) * rw * wob * k;
            const py = cy + Math.sin(a) * rh * wob * k;
            if (i) g.lineTo(px, py);
            else g.moveTo(px, py);
          }
          g.closePath();
        };
        blob(1.12);
        g.fillStyle = 'rgba(10,40,10,0.7)';
        g.fill();
        const gr = g.createRadialGradient(cx - rw * 0.2, cy - rh * 0.2, 0, cx, cy, rw);
        gr.addColorStop(0, 'rgba(210,255,120,0.95)');
        gr.addColorStop(0.5, 'rgba(110,230,50,0.9)');
        gr.addColorStop(1, 'rgba(40,140,30,0.9)');
        blob(1);
        g.fillStyle = gr;
        g.fill();
        // Ripples going out from the middle.
        for (let i = 0; i < 2; i++) {
          const k = (now / 1600 + i * 0.5) % 1;
          g.strokeStyle = `rgba(230,255,170,${0.6 * (1 - k)})`;
          g.lineWidth = 1.5;
          g.beginPath();
          g.ellipse(cx, cy, rw * 0.8 * k, rh * 0.8 * k, 0, 0, Math.PI * 2);
          g.stroke();
        }
        // Bubbles: each grows, then pops.
        for (let i = 0; i < 9; i++) {
          const life = (now / 1400 + i * 0.37) % 1;
          const bx = cx + Math.sin(i * 12.9) * rw * 0.6;
          const by = cy + Math.cos(i * 7.3) * rh * 0.5;
          const r = t * 0.05 + life * t * 0.13;
          g.strokeStyle = `rgba(210,255,140,${0.8 * (1 - life)})`;
          g.lineWidth = 1.5;
          g.beginPath();
          g.arc(bx, by - life * t * 0.08, r, 0, Math.PI * 2);
          g.stroke();
        }
      }
    }

    // Bat shadows, down and to the side of each bat by its height.
    g.fillStyle = 'rgba(0,0,0,0.28)';
    for (const b of this.bats) {
      const x = v.sx(b.x + b.z * 0.25);
      const y = v.sy(b.y + b.z * 0.35);
      const w = t * 0.3 * (0.6 + 0.4 * Math.abs(Math.sin(b.flap)));
      g.beginPath();
      g.ellipse(x, y, w, t * 0.07, 0, 0, Math.PI * 2);
      g.fill();
    }

    this.drawFog(g, v, now);
  }

  /** Standing things to sort in with everyone else: the lanterns and the ghosts. */
  things(v: HauntView, now: number, push: (y: number, draw: () => void) => void) {
    const t = v.t;
    const onScreen = (x: number, y: number) => {
      const px = v.sx(x);
      const py = v.sy(y);
      return px > -t * 2 && px < v.view.w + t * 2 && py > -t * 3 && py < v.view.h + t * 2;
    };
    for (const l of this.lanterns) if (onScreen(l.x, l.y)) push(l.y, () => this.drawLantern(v, l, now));
    for (const gh of this.ghosts)
      if (onScreen(gh.x, gh.y)) push(gh.y + 0.5, () => this.drawGhost(v, gh, now));
    const c = this.cauldron;
    // Just in front of the fountain's own picture, so the brew sits in its basin.
    if (c && onScreen(c.x, c.y)) push(c.y + 0.21, () => this.drawBrew(v, c, now));
  }

  /** Light that cuts through the night: candlelight round each lantern, a little round every wisp. */
  lights(v: HauntView, now: number): { x: number; y: number; r: number }[] {
    const t = v.t;
    const out: { x: number; y: number; r: number }[] = [];
    for (const l of this.lanterns) {
      const f = 0.85 + 0.15 * Math.sin(now / 70 + l.x) * Math.sin(now / 41 + l.y);
      out.push({ x: v.sx(l.x), y: v.sy(l.y) - t * 0.2, r: t * (1.25 + l.flare * 0.7) * f });
    }
    for (const w of this.wisps) out.push({ x: v.sx(w.x), y: v.sy(w.y), r: t * 0.7 });
    return out;
  }

  /** Coloured glow on top of the night: candles, wisps and their trails, ghost-fire, the toxic pool, lamps. */
  glow(g: G, v: HauntView, now: number) {
    const t = v.t;
    g.save();
    g.globalCompositeOperation = 'lighter';
    // Candlelight.
    for (const l of this.lanterns) {
      const x = v.sx(l.x);
      const y = v.sy(l.y) - t * 0.25;
      if (x < -t * 3 || x > v.view.w + t * 3 || y < -t * 3 || y > v.view.h + t * 3) continue;
      const f = 0.75 + 0.25 * Math.sin(now / 63 + l.x * 3) * Math.sin(now / 37 + l.y);
      // Candlelight spilling on the ground round it; brighter when it flares at you.
      g.globalAlpha = 0.6 * f;
      g.drawImage(this.glowSprite('lantern', 255, 140, 30), x - t * 2, y + t * 0.1 - t * 1.2, t * 4, t * 2.4);
      g.globalAlpha = (0.12 + l.flare * 0.45) * f;
      g.drawImage(this.glowSprite('lantern', 255, 140, 30), x - t * 1.3, y - t * 1.3, t * 2.6, t * 2.6);
      g.globalAlpha = 1;
    }
    // Wisps and their sparkle trails.
    for (const w of this.wisps) {
      const [r, gg, b] = w.hue === 150 ? [90, 255, 170] : [190, 120, 255];
      const sprite = this.glowSprite(`w${w.hue}`, r, gg, b);
      w.trail.forEach((p, i) => {
        const k = 1 - i / w.trail.length;
        const s = t * 0.35 * k;
        g.globalAlpha = 0.5 * k;
        g.drawImage(sprite, v.sx(p.x) - s, v.sy(p.y) - s, s * 2, s * 2);
      });
      const pulse = 1 + 0.18 * Math.sin(now / 160 + w.x * 4);
      const s = t * 0.75 * pulse;
      g.globalAlpha = 1;
      g.drawImage(sprite, v.sx(w.x) - s, v.sy(w.y) - s, s * 2, s * 2);
      g.fillStyle = 'rgba(255,255,255,0.9)';
      g.beginPath();
      g.arc(v.sx(w.x), v.sy(w.y), t * 0.06, 0, Math.PI * 2);
      g.fill();
    }
    // The toxic pool's glow.
    if (this.toxic) {
      const x = v.sx(this.toxic.door.x + 3.4);
      const y = v.sy(this.toxic.door.y + 1.4);
      g.globalAlpha = 0.65 + 0.2 * Math.sin(now / 500);
      g.drawImage(this.glowSprite('toxic', 120, 255, 60), x - t * 2.6, y - t * 1.6, t * 5.2, t * 3.2);
      // Green vapour rising off it and fading.
      for (let i = 0; i < 10; i++) {
        const life = (now / 2600 + i * 0.1) % 1;
        const px = x + Math.sin(i * 4.1) * t * 1.1 + Math.sin(now / 700 + i) * t * 0.15;
        const py = y - life * t * 2.4;
        const r = t * (0.12 + life * 0.35);
        g.globalAlpha = 0.55 * Math.sin(life * Math.PI);
        g.drawImage(this.glowSprite('toxic', 120, 255, 60), px - r, py - r, r * 2, r * 2);
      }
      g.globalAlpha = 1;
    }
    // The cauldron's column of sparks and smoke.
    if (this.cauldron) this.drawBrewGlow(g, v, this.cauldron, now);
    // Ghost-fire on the Skulls' roof.
    if (this.skulls) this.drawGhostFire(g, v, this.skulls, now);
    // The street lamps burn a little eerie: purple and green, flickering.
    for (const p of CITY.props) {
      if (p.kind !== 'lamp') continue;
      const x = v.sx(p.x);
      const y = v.sy(p.y) - t * 1.6;
      if (x < -t * 2 || x > v.view.w + t * 2 || y < -t * 2 || y > v.view.h + t * 2) continue;
      const green = Math.round(p.x * 7 + p.y * 3) % 2 === 0;
      const flick = 0.55 + 0.3 * Math.sin(now / 230 + p.x) + (Math.sin(now / 47 + p.y * 9) > 0.96 ? -0.4 : 0);
      g.globalAlpha = Math.max(0, flick);
      g.drawImage(
        this.glowSprite(green ? 'lg' : 'lp', green ? 80 : 170, green ? 255 : 90, green ? 140 : 255),
        x - t * 1.2,
        y - t * 1.2,
        t * 2.4,
        t * 2.4,
      );
    }
    g.restore();
  }

  /** Above everything: the bats. */
  sky(g: G, v: HauntView) {
    const t = v.t;
    g.save();
    g.fillStyle = '#120a1c';
    g.strokeStyle = 'rgba(190,140,255,0.5)';
    g.lineWidth = 1;
    for (const b of this.bats) {
      const x = v.sx(b.x);
      const y = v.sy(b.y) - b.z * t * 0.6;
      const s = t * 0.32;
      const w = Math.sin(b.flap);
      const dir = b.vx > 0 ? 1 : -1;
      g.beginPath();
      // Two wings, each a scalloped curve, beating up and down.
      for (const side of [-1, 1]) {
        g.moveTo(x, y);
        g.quadraticCurveTo(x + side * s * 0.5, y - s * 0.6 * w, x + side * s, y - s * 0.25 * w);
        g.quadraticCurveTo(
          x + side * s * 0.75,
          y + s * 0.1,
          x + side * s * 0.55,
          y + s * 0.05 - s * 0.15 * w,
        );
        g.quadraticCurveTo(x + side * s * 0.35, y + s * 0.15, x, y + s * 0.08);
      }
      g.fill();
      g.stroke();
      g.beginPath();
      g.ellipse(x + dir * s * 0.05, y, s * 0.16, s * 0.2, 0, 0, Math.PI * 2);
      g.fill();
      // Eyes catching the light.
      g.fillStyle = '#ff5c93';
      g.fillRect(x + dir * s * 0.08 - 1, y - s * 0.08, 2, 2);
      g.fillStyle = '#120a1c';
    }
    g.restore();
  }

  // ---------- pieces ----------

  private drawLantern(v: HauntView, l: { x: number; y: number; flare: number }, now: number) {
    const t = v.t;
    const sprite = this.lanternSprite(t);
    const x = v.sx(l.x);
    const y = v.sy(l.y);
    const w = t * 1.35;
    const h = t * 1.35;
    // A little hop when it flares, like it noticed you.
    const hop = l.flare * Math.abs(Math.sin(now / 160)) * t * 0.06;
    {
      const g = v.g;
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.beginPath();
      g.ellipse(x, y + t * 0.05, w * 0.45, t * 0.12, 0, 0, Math.PI * 2);
      g.fill();
      g.drawImage(sprite, x - w / 2, y - h * 0.92 - hop, w, h);
      // The candle inside, through the carved face.
      const f = 0.7 + 0.3 * Math.sin(now / 55 + l.x * 5) * Math.sin(now / 31 + l.y * 3);
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = (0.75 + l.flare * 0.25) * f;
      g.drawImage(this.faceSprite(t), x - w / 2, y - h * 0.92 - hop, w, h);
      // A soft bloom round the carving, so it reads from across the street.
      g.globalAlpha = (0.18 + l.flare * 0.35) * f;
      g.drawImage(this.faceSprite(t), x - w * 0.53, y - h * 0.95 - hop, w * 1.06, h * 1.06);
      g.restore();
    }
  }

  private drawGhost(v: HauntView, gh: Ghost, now: number) {
    const t = v.t;
    const pic = v.picture(gh.chog);
    const x = v.sx(gh.x);
    const bob = Math.sin(now / 520 + gh.phase) * t * 0.18;
    const y = v.sy(gh.y) - t * 1.1 + bob;
    const W = t * 1.05;
    const H = t * 1.25;
    // Fades in and out as it drifts, and goes faint when it's run from you.
    const alpha = (0.68 + 0.22 * Math.sin(now / 1700 + gh.phase)) * (1 - gh.scared * 0.55);
    {
      const g = v.g;
      // A faint shadow far below: it's floating.
      g.fillStyle = `rgba(120,200,255,${0.12 * alpha})`;
      g.beginPath();
      g.ellipse(x, v.sy(gh.y) + t * 0.1, W * 0.35, t * 0.1, 0, 0, Math.PI * 2);
      g.fill();
      g.save();
      g.globalAlpha = alpha;
      // The sheet: round on top, a hem that ripples.
      const path = () => {
        g.beginPath();
        g.moveTo(x - W / 2, y);
        g.arc(x, y, W / 2, Math.PI, 0);
        const n = 4;
        for (let i = 0; i <= n * 2; i++) {
          const px = x + W / 2 - (i / (n * 2)) * W;
          const wave = Math.sin(now / 160 + i * 1.3 + gh.phase) * t * 0.09;
          const py = y + H * 0.62 + (i % 2 ? -t * 0.12 : t * 0.04) + wave;
          g.lineTo(px, py);
        }
        g.closePath();
      };
      path();
      g.fillStyle = 'rgba(200,235,255,0.9)';
      g.fill();
      if (pic) {
        g.save();
        path();
        g.clip();
        g.globalAlpha = alpha * 0.95;
        g.drawImage(pic, x - W / 2, y - W / 2, W, W);
        // Washed pale and blue, like a ghost.
        g.globalCompositeOperation = 'source-atop';
        g.fillStyle = 'rgba(150,220,255,0.45)';
        g.fillRect(x - W, y - W, W * 2, H * 2);
        g.restore();
      }
      g.restore();
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = alpha;
      g.drawImage(this.glowSprite('ghost', 120, 200, 255), x - W * 1.3, y - W * 1.1, W * 2.6, H * 2);
      // Ectoplasm dripping off the hem as it drifts.
      for (let i = 0; i < 5; i++) {
        const life = (now / 900 + i * 0.2 + gh.phase) % 1;
        const px = x + Math.sin(i * 2.7 + gh.phase) * W * 0.35;
        const py = y + H * 0.6 + life * t * 0.6;
        const r = t * 0.09 * (1 - life);
        g.globalAlpha = alpha * (1 - life);
        g.drawImage(this.glowSprite('ghost', 120, 200, 255), px - r * 3, py - r * 3, r * 6, r * 6);
      }
      g.restore();
    }
  }

  /** The fountain's water turned to a swirling, bubbling brew. */
  private drawBrew(v: HauntView, c: { x: number; y: number }, now: number) {
    const g = v.g;
    const t = v.t;
    const x = v.sx(c.x);
    const y = v.sy(c.y) - t * 0.22;
    const rx = t * 0.95;
    const ry = t * 0.36;
    g.save();
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    g.clip();
    // The brew turns slowly from purple to green and back, swirling.
    const k = (Math.sin(now / 2500) + 1) / 2;
    const base = g.createRadialGradient(x, y, 0, x, y, rx);
    // A witch's brew: bright toxic green in the middle, deep purple at the edge.
    base.addColorStop(0, `rgba(${Math.round(150 + 60 * k)},255,${Math.round(90 + 60 * k)},1)`);
    base.addColorStop(0.55, `rgba(${Math.round(60 + 40 * k)},${Math.round(200 - 40 * k)},60,1)`);
    base.addColorStop(1, `rgba(${Math.round(90 + 40 * k)},30,${Math.round(150 + 40 * k)},1)`);
    g.fillStyle = base;
    g.fillRect(x - rx, y - ry, rx * 2, ry * 2);
    // Swirl: three arms going round.
    g.strokeStyle = 'rgba(230,255,200,0.55)';
    g.lineWidth = 2.5;
    for (let arm = 0; arm < 3; arm++) {
      g.beginPath();
      for (let i = 0; i <= 20; i++) {
        const a = now / 900 + arm * 2.09 + i * 0.22;
        const r = (i / 20) * rx;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r * (ry / rx);
        if (i) g.lineTo(px, py);
        else g.moveTo(px, py);
      }
      g.stroke();
    }
    // Bubbles rising and popping.
    for (let i = 0; i < 8; i++) {
      const life = (now / 1100 + i * 0.125) % 1;
      const bx = x + Math.sin(i * 9.7) * rx * 0.7;
      const by = y + Math.cos(i * 5.3) * ry * 0.6;
      g.fillStyle = `rgba(255,255,255,${0.5 * (1 - life)})`;
      g.beginPath();
      g.arc(bx, by, t * (0.04 + life * 0.1), 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }

  /** Sparks spiralling up out of the cauldron, and rings of coloured smoke. */
  private drawBrewGlow(g: G, v: HauntView, c: { x: number; y: number }, now: number) {
    const t = v.t;
    const x = v.sx(c.x);
    const y = v.sy(c.y) - t * 0.22;
    if (x < -t * 4 || x > v.view.w + t * 4 || y < -t * 6 || y > v.view.h + t * 4) return;
    const k = (Math.sin(now / 2500) + 1) / 2;
    // Glow round the pot, not on it, so the brew keeps its colour.
    g.globalAlpha = 0.45;
    g.drawImage(this.glowSprite('brew', 160, 90, 255), x - t * 2.6, y - t * 1.4, t * 5.2, t * 2.8);
    g.globalAlpha = 0.25 + 0.2 * k;
    g.drawImage(this.glowSprite('brewG', 90, 255, 140), x - t * 2.2, y - t * 1.2, t * 4.4, t * 2.4);
    // A soft beam of light straight up out of the pot.
    g.globalAlpha = 0.35 + 0.15 * Math.sin(now / 400);
    g.drawImage(this.glowSprite('beam', 140, 255, 160), x - t * 0.7, y - t * 4.6, t * 1.4, t * 4.2);
    for (let i = 0; i < 30; i++) {
      const life = (now / 2200 + i / 30) % 1;
      const a = life * 9 + i * 1.7;
      const r = t * (0.25 + life * 0.6);
      const px = x + Math.cos(a) * r;
      const py = y - life * t * 3.6 + Math.sin(a) * r * 0.3;
      const size = t * 0.3 * (1 - life * 0.6);
      const hue = i % 3;
      g.globalAlpha = Math.sin(life * Math.PI);
      g.drawImage(
        this.glowSprite(
          `spark${hue}`,
          hue === 0 ? 190 : hue === 1 ? 90 : 255,
          hue === 0 ? 110 : hue === 1 ? 255 : 170,
          hue === 0 ? 255 : hue === 1 ? 150 : 60,
        ),
        px - size * 2,
        py - size * 2,
        size * 4,
        size * 4,
      );
    }
    // Smoke rings, every couple of seconds.
    for (let i = 0; i < 2; i++) {
      const life = (now / 3000 + i * 0.5) % 1;
      g.globalAlpha = 0.45 * (1 - life);
      g.strokeStyle = i ? 'rgba(170,120,255,1)' : 'rgba(110,255,170,1)';
      g.lineWidth = t * 0.08 * (1 - life) + 1;
      g.beginPath();
      g.ellipse(x, y - life * t * 3, t * (0.4 + life * 0.9), t * (0.15 + life * 0.3), 0, 0, Math.PI * 2);
      g.stroke();
    }
    g.globalAlpha = 1;
  }

  private drawGhostFire(g: G, v: HauntView, p: Place, now: number) {
    const t = v.t;
    // Blue flames along the roof line, each flickering on its own.
    for (let i = 0; i < 5; i++) {
      const fx = v.sx(p.x + 1.2 + (i * (p.w - 2.4)) / 4);
      const fy = v.sy(p.y) + t * 0.4;
      if (fx < -t * 2 || fx > v.view.w + t * 2 || fy < -t * 3 || fy > v.view.h + t * 3) continue;
      const k = 0.75 + 0.25 * Math.sin(now / 90 + i * 2.1) * Math.sin(now / 53 + i);
      const h = t * 0.9 * k;
      const w = t * 0.32;
      const lean = Math.sin(now / 300 + i) * w * 0.4;
      const gr = g.createLinearGradient(fx, fy, fx, fy - h);
      gr.addColorStop(0, 'rgba(80,140,255,0.9)');
      gr.addColorStop(0.5, 'rgba(110,220,255,0.7)');
      gr.addColorStop(1, 'rgba(200,250,255,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(fx - w, fy);
      g.quadraticCurveTo(fx - w * 0.9, fy - h * 0.55, fx + lean, fy - h);
      g.quadraticCurveTo(fx + w * 0.9, fy - h * 0.55, fx + w, fy);
      g.closePath();
      g.fill();
      g.drawImage(this.glowSprite('gfire', 90, 160, 255), fx - t, fy - t * 1.2, t * 2, t * 2);
    }
  }

  private drawFog(g: G, v: HauntView, now: number) {
    // Drawn small and stretched (it's soft anyway, and cheap on a phone), anchored to the city so it doesn't
    // slide with the camera, in two layers drifting different ways; a hole round your Chog.
    const scale = 0.25;
    const fw = Math.max(1, Math.round(v.view.w * scale));
    const fh = Math.max(1, Math.round(v.view.h * scale));
    if (!this.fog || this.fog.width !== fw || this.fog.height !== fh) {
      this.fog = document.createElement('canvas');
      this.fog.width = fw;
      this.fog.height = fh;
    }
    const tile = this.fogTileSprite();
    const f = this.fog.getContext('2d')!;
    f.globalCompositeOperation = 'source-over';
    f.clearRect(0, 0, fw, fh);
    const layer = (speed: number, tint: string, alpha: number, size: number) => {
      const s = size * scale;
      const ox = (((-v.cam.x * scale - (now / 1000) * speed * v.t * scale) % s) + s) % s;
      const oy = (((-v.cam.y * scale + (now / 1000) * speed * 0.3 * v.t * scale) % s) + s) % s;
      f.globalAlpha = alpha;
      for (let x = ox - s; x < fw; x += s) for (let y = oy - s; y < fh; y += s) f.drawImage(tile, x, y, s, s);
      f.globalAlpha = 1;
      f.globalCompositeOperation = 'source-atop';
      f.fillStyle = tint;
      f.fillRect(0, 0, fw, fh);
      f.globalCompositeOperation = 'source-over';
    };
    layer(0.35, 'rgba(150,110,230,0.9)', 0.55, v.t * 9);
    // The second layer goes on its own canvas pass so its tint stays its own.
    const mid = this.fogMid(fw, fh);
    const m = mid.getContext('2d')!;
    m.clearRect(0, 0, fw, fh);
    const s2 = v.t * 7 * scale;
    const ox2 = (((-v.cam.x * scale + (now / 1000) * 0.5 * v.t * scale) % s2) + s2) % s2;
    const oy2 = (((-v.cam.y * scale - (now / 1000) * 0.2 * v.t * scale) % s2) + s2) % s2;
    m.globalAlpha = 0.4;
    for (let x = ox2 - s2; x < fw; x += s2)
      for (let y = oy2 - s2; y < fh; y += s2) m.drawImage(tile, x, y, s2, s2);
    m.globalAlpha = 1;
    m.globalCompositeOperation = 'source-atop';
    m.fillStyle = 'rgba(90,220,160,0.9)';
    m.fillRect(0, 0, fw, fh);
    m.globalCompositeOperation = 'source-over';
    f.drawImage(mid, 0, 0);
    // It parts round you.
    if (this.me) {
      const mx = v.sx(this.me.x) * scale;
      const my = v.sy(this.me.y) * scale;
      const r = v.t * 2.2 * scale;
      f.globalCompositeOperation = 'destination-out';
      const gr = f.createRadialGradient(mx, my, 0, mx, my, r);
      gr.addColorStop(0, 'rgba(0,0,0,0.9)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      f.fillStyle = gr;
      f.fillRect(mx - r, my - r, r * 2, r * 2);
      f.globalCompositeOperation = 'source-over';
    }
    g.save();
    g.imageSmoothingEnabled = true;
    g.globalAlpha = 0.85;
    g.drawImage(this.fog, 0, 0, v.view.w, v.view.h);
    g.restore();
  }

  // ---------- sprites, drawn once ----------

  private fogMidCanvas: HTMLCanvasElement | null = null;
  private fogMid(w: number, h: number) {
    if (!this.fogMidCanvas || this.fogMidCanvas.width !== w || this.fogMidCanvas.height !== h) {
      this.fogMidCanvas = document.createElement('canvas');
      this.fogMidCanvas.width = w;
      this.fogMidCanvas.height = h;
    }
    return this.fogMidCanvas;
  }

  /** A square of soft blobs that tiles: the fog's texture. */
  private fogTileSprite() {
    if (this.fogTile) return this.fogTile;
    const S = 128;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d')!;
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 26; i++) {
      const x = rnd() * S;
      const y = rnd() * S;
      const r = S * (0.12 + rnd() * 0.22);
      // Drawn at each wrap so the tile has no seams.
      for (const ox of [-S, 0, S])
        for (const oy of [-S, 0, S]) {
          const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
          gr.addColorStop(0, 'rgba(255,255,255,0.5)');
          gr.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = gr;
          g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
        }
    }
    this.fogTile = c;
    return c;
  }

  /** A soft round glow of one colour. */
  private glowSprite(key: string, r: number, g: number, b: number) {
    const k = `glow:${key}`;
    let c = this.sprites.get(k);
    if (!c) {
      c = document.createElement('canvas');
      c.width = c.height = 64;
      const x = c.getContext('2d')!;
      const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, `rgba(${r},${g},${b},0.75)`);
      gr.addColorStop(0.35, `rgba(${r},${g},${b},0.3)`);
      gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
      x.fillStyle = gr;
      x.fillRect(0, 0, 64, 64);
      this.sprites.set(k, c);
    }
    return c;
  }

  /** The Chog-o'-lantern: a ribbed pumpkin, its stem, and a Chog's face carved in it (dark until lit). */
  private lanternSprite(t: number) {
    const k = `lantern:${t}`;
    let c = this.sprites.get(k);
    if (c) return c;
    const S = Math.round(t * 2);
    c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d')!;
    const cx = S / 2;
    const cy = S * 0.58;
    const R = S * 0.4;
    // Ribs: overlapping lobes, darker at the sides.
    const lobes = [
      { dx: -0.55, w: 0.5, c: '#c4500f' },
      { dx: 0.55, w: 0.5, c: '#c4500f' },
      { dx: -0.25, w: 0.55, c: '#e8711c' },
      { dx: 0.25, w: 0.55, c: '#e8711c' },
      { dx: 0, w: 0.55, c: '#f78a2a' },
    ];
    for (const l of lobes) {
      g.fillStyle = l.c;
      g.strokeStyle = '#3a1404';
      g.lineWidth = S * 0.025;
      g.beginPath();
      g.ellipse(cx + l.dx * R, cy, R * l.w, R * 0.82, 0, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    // A sheen on top.
    g.fillStyle = 'rgba(255,220,150,0.25)';
    g.beginPath();
    g.ellipse(cx - R * 0.25, cy - R * 0.45, R * 0.3, R * 0.12, -0.3, 0, Math.PI * 2);
    g.fill();
    // Stem, curling.
    g.fillStyle = '#4f6b22';
    g.strokeStyle = '#1f2a0c';
    g.beginPath();
    g.moveTo(cx - R * 0.1, cy - R * 0.75);
    g.quadraticCurveTo(cx - R * 0.05, cy - R * 1.1, cx + R * 0.22, cy - R * 1.12);
    g.lineTo(cx + R * 0.15, cy - R * 0.98);
    g.quadraticCurveTo(cx + R * 0.05, cy - R * 0.92, cx + R * 0.1, cy - R * 0.75);
    g.closePath();
    g.fill();
    g.stroke();
    // The carved face, cut in dark: the candle lights it from inside (faceSprite, drawn on top).
    this.carve(g, cx, cy, R, '#2a0c02');
    this.sprites.set(k, c);
    return c;
  }

  /** Just the carved face, in candle colour, to glow through the pumpkin. */
  private faceSprite(t: number) {
    const k = `face:${t}`;
    let c = this.sprites.get(k);
    if (c) return c;
    const S = Math.round(t * 2);
    c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d')!;
    this.carve(g, S / 2, S * 0.58, S * 0.4, '#ffd66b');
    this.sprites.set(k, c);
    return c;
  }

  /** A Chog's face: two big round eyes with a crescent of pumpkin left in each (its look), and a small grin. */
  private carve(g: G, cx: number, cy: number, R: number, fill: string) {
    g.fillStyle = fill;
    for (const side of [-1, 1]) {
      const ex = cx + side * R * 0.32;
      const ey = cy - R * 0.12;
      g.beginPath();
      g.arc(ex, ey, R * 0.22, 0, Math.PI * 2);
      // The pupil is left uncut, looking to the side, so the eyes have the Chog's side-eye.
      g.arc(ex + R * 0.06, ey - R * 0.02, R * 0.09, 0, Math.PI * 2, true);
      g.fill('evenodd');
    }
    // The grin, with two little teeth left in.
    g.beginPath();
    g.moveTo(cx - R * 0.32, cy + R * 0.28);
    g.quadraticCurveTo(cx, cy + R * 0.66, cx + R * 0.32, cy + R * 0.28);
    g.quadraticCurveTo(cx + R * 0.12, cy + R * 0.38, cx + R * 0.08, cy + R * 0.33);
    g.lineTo(cx + R * 0.02, cy + R * 0.42);
    g.lineTo(cx - R * 0.04, cy + R * 0.34);
    g.lineTo(cx - R * 0.1, cy + R * 0.43);
    g.lineTo(cx - R * 0.14, cy + R * 0.34);
    g.quadraticCurveTo(cx - R * 0.2, cy + R * 0.38, cx - R * 0.32, cy + R * 0.28);
    g.closePath();
    g.fill();
  }
}
