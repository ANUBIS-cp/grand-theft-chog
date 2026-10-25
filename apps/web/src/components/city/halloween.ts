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
  /** Device pixels per CSS pixel, for sharp sprites. */
  dpr: number;
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
    // Four on the diagonals, clear of the benches either side and the paths in and out.
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      out.push({ x: f.x + Math.cos(a) * 3.6, y: f.y + Math.sin(a) * 2.6 + 0.3, flare: 0 });
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
    const WISPS = v.view.w < 600 ? 3 : 5;
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
      // Somewhere no other ghost is, so they don't bunch up.
      let p = spawn();
      for (let k = 0; k < 10 && this.ghosts.some((o) => Math.hypot(o.x - p.x, o.y - p.y) < 5); k++)
        p = spawn();
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
    for (const w of this.wisps) out.push({ x: v.sx(w.x), y: v.sy(w.y), r: t * 0.4 });
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
      g.globalAlpha = 0.38 * f;
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
        const s = t * 0.16 * k;
        g.globalAlpha = 0.4 * k;
        g.drawImage(sprite, v.sx(p.x) - s, v.sy(p.y) - s, s * 2, s * 2);
      });
      const pulse = 1 + 0.18 * Math.sin(now / 160 + w.x * 4);
      const s = t * 0.38 * pulse;
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
      g.globalAlpha = 0.4 + 0.12 * Math.sin(now / 500);
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
      // Just a tint on the lamp's own light, with the odd flicker.
      const flick =
        0.3 + 0.12 * Math.sin(now / 230 + p.x) + (Math.sin(now / 47 + p.y * 9) > 0.96 ? -0.25 : 0);
      g.globalAlpha = Math.max(0, flick);
      g.drawImage(
        this.glowSprite(green ? 'lg' : 'lp', green ? 80 : 170, green ? 255 : 90, green ? 140 : 255),
        x - t * 0.8,
        y - t * 0.8,
        t * 1.6,
        t * 1.6,
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

  /**
   * A jack-o'-lantern, the 🎃 kind but alive: a fat ribbed pumpkin (drawn once, sharp), an angry carved face
   * with the candle blazing through it, flickering. Walk up and it laughs at you: the grin stretches, it
   * shakes, embers spit out of its mouth, and the glints in its eyes turn to watch you.
   */
  private drawLantern(v: HauntView, l: { x: number; y: number; flare: number }, now: number) {
    const g = v.g;
    const t = v.t;
    const W = t * 1.5;
    const H = t * 1.18;
    const x = v.sx(l.x);
    const y = v.sy(l.y);
    const near = l.flare;
    const seed = l.x * 7.1 + l.y * 3.3;
    // Laughing: a quick shake and a bounce.
    const shake = near * Math.sin(now / 38 + seed) * 0.07;
    const bounce = near * Math.abs(Math.sin(now / 120 + seed)) * t * 0.08;
    // Shadow on the street.
    g.fillStyle = 'rgba(0,0,0,0.42)';
    g.beginPath();
    g.ellipse(x, y + t * 0.04, W * 0.48, t * 0.15, 0, 0, Math.PI * 2);
    g.fill();
    g.save();
    // Standing in front of your Chog: see-through, like anyone else in front of you.
    const me = this.me;
    if (me && l.y > me.y && l.y - me.y < 1.4 && Math.abs(l.x - me.x) < 1) g.globalAlpha = 0.35;
    g.translate(x, y - bounce);
    g.rotate(shake);
    const body = this.pumpkinBody(t, v.dpr);
    g.drawImage(body, -W * 0.62, -H * 1.42, W * 1.24, H * 1.5);
    // The face, live: the candle's flicker, the grin, the eyes.
    const flick = 0.78 + 0.22 * Math.sin(now / 57 + seed) * Math.sin(now / 31 + seed * 2);
    const grin = 1 + near * (0.35 + 0.1 * Math.sin(now / 90));
    const cy = -H * 0.52;
    this.pumpkinFace(g, 0, cy, W, H, flick, grin, near, l, now);
    g.restore();
    // Embers spat out of the grin while it laughs.
    if (near > 0.05) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 7; i++) {
        const life = (now / 700 + i / 7 + seed) % 1;
        const ex = x + Math.sin(i * 2.3 + seed) * W * 0.25 * life + Math.sin(now / 200 + i) * 3;
        const ey = y - bounce - H * 0.42 - life * t * 1.4;
        const r = t * 0.07 * (1 - life);
        g.globalAlpha = near * (1 - life);
        g.drawImage(this.glowSprite('ember', 255, 150, 40), ex - r * 4, ey - r * 4, r * 8, r * 8);
        g.fillStyle = '#ffe9a0';
        g.beginPath();
        g.arc(ex, ey, r, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    }
  }

  /** The carved face: angry triangle eyes, a nose, a jagged grin with teeth, cut deep and lit from inside. */
  pumpkinFace(
    g: G,
    cx: number,
    cy: number,
    W: number,
    H: number,
    flick: number,
    grin: number,
    near: number,
    l: { x: number; y: number },
    now: number,
  ) {
    const eye = (side: number) => {
      // Slanted down towards the nose: angry.
      const ex = cx + side * W * 0.2;
      const ey = cy - H * 0.12;
      g.moveTo(ex - side * W * 0.11, ey - H * 0.02);
      g.lineTo(ex + side * W * 0.12, ey - H * 0.17);
      g.lineTo(ex + side * W * 0.1, ey + H * 0.1);
      g.closePath();
    };
    const nose = () => {
      g.moveTo(cx, cy + H * 0.0);
      g.lineTo(cx - W * 0.055, cy + H * 0.12);
      g.lineTo(cx + W * 0.055, cy + H * 0.12);
      g.closePath();
    };
    const mouth = () => {
      // A wide grin, its bottom edge dropping as it laughs, with two teeth up top and one below.
      const mw = W * 0.36;
      const top = cy + H * 0.2;
      const drop = H * 0.2 * grin;
      g.moveTo(cx - mw, top - H * 0.04);
      g.quadraticCurveTo(cx - mw * 0.5, top + H * 0.05, cx - mw * 0.32, top + H * 0.03);
      g.lineTo(cx - mw * 0.25, top + H * 0.1); // tooth
      g.lineTo(cx - mw * 0.12, top + H * 0.035);
      g.lineTo(cx + mw * 0.12, top + H * 0.035);
      g.lineTo(cx + mw * 0.25, top + H * 0.1); // tooth
      g.lineTo(cx + mw * 0.32, top + H * 0.03);
      g.quadraticCurveTo(cx + mw * 0.5, top + H * 0.05, cx + mw, top - H * 0.04);
      g.quadraticCurveTo(cx + mw * 0.75, top + drop, cx + mw * 0.15, top + drop * 1.02);
      g.lineTo(cx + mw * 0.06, top + drop * 0.62); // bottom tooth
      g.lineTo(cx - mw * 0.06, top + drop * 0.62);
      g.lineTo(cx - mw * 0.15, top + drop * 1.02);
      g.quadraticCurveTo(cx - mw * 0.75, top + drop, cx - mw, top - H * 0.04);
      g.closePath();
    };
    const face = () => {
      g.beginPath();
      eye(-1);
      eye(1);
      nose();
      mouth();
    };
    // The cut's depth: the pumpkin's flesh, a little below the hole.
    g.save();
    g.translate(0, H * 0.035);
    face();
    g.fillStyle = '#ffcf6a';
    g.fill();
    g.restore();
    face();
    g.fillStyle = '#5c1c00';
    g.fill();
    // The candle inside: white-hot in the middle, orange at the edges.
    g.save();
    face();
    g.clip();
    const gl = g.createRadialGradient(cx, cy + H * 0.12, 0, cx, cy + H * 0.12, W * 0.48);
    gl.addColorStop(0, `rgba(255,255,230,${flick})`);
    gl.addColorStop(0.35, `rgba(255,214,90,${flick})`);
    gl.addColorStop(1, `rgba(255,110,20,${0.85 * flick})`);
    g.fillStyle = gl;
    g.fillRect(cx - W, cy - H, W * 2, H * 2);
    g.restore();
    // Light pouring out of the cuts.
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = (0.18 + near * 0.4) * flick;
    g.drawImage(this.glowSprite('faceglow', 255, 170, 50), cx - W * 0.6, cy - H * 0.55, W * 1.2, H * 1.2);
    g.restore();
    // Glints in its eyes, turned to look at you.
    const me = this.me;
    let lx = 0;
    let ly = 0;
    if (me) {
      const dx = me.x - l.x;
      const dy = me.y - l.y;
      const d = Math.hypot(dx, dy) || 1;
      lx = (dx / d) * W * 0.03;
      ly = (dy / d) * H * 0.02;
    }
    g.fillStyle = `rgba(255,255,255,${0.75 * flick})`;
    for (const side of [-1, 1]) {
      g.beginPath();
      g.arc(cx + side * W * 0.23 + lx, cy - H * 0.11 + ly, W * 0.022, 0, Math.PI * 2);
      g.fill();
    }
    void now;
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
      g.globalAlpha = alpha * 0.45;
      g.drawImage(this.glowSprite('ghost', 120, 200, 255), x - W * 0.9, y - W * 0.8, W * 1.8, H * 1.5);
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
    g.globalAlpha = 0.3;
    g.drawImage(this.glowSprite('brew', 160, 90, 255), x - t * 2.6, y - t * 1.4, t * 5.2, t * 2.8);
    g.globalAlpha = 0.15 + 0.12 * k;
    g.drawImage(this.glowSprite('brewG', 90, 255, 140), x - t * 2.2, y - t * 1.2, t * 4.4, t * 2.4);
    // A soft beam of light straight up out of the pot.
    g.globalAlpha = 0.22 + 0.1 * Math.sin(now / 400);
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

  /** Blue ghost-fire burning at both ends of the Skulls' roof: tongues of flame round a white-hot core. */
  private drawGhostFire(g: G, v: HauntView, p: Place, now: number) {
    const t = v.t;
    for (const [i, fxTile] of [
      [0, p.x + 0.9],
      [1, p.x + p.w - 0.9],
    ] as const) {
      const fx = v.sx(fxTile);
      const fy = v.sy(p.y) + t * 0.95;
      if (fx < -t * 2 || fx > v.view.w + t * 2 || fy < -t * 3 || fy > v.view.h + t * 3) continue;
      // A soft halo first, small.
      g.globalAlpha = 0.35;
      g.drawImage(this.glowSprite('gfire', 90, 160, 255), fx - t * 0.7, fy - t * 1.1, t * 1.4, t * 1.4);
      g.globalAlpha = 1;
      // Three tongues of flame, each with its own height and sway; outer blue, then cyan, then white.
      const layers = [
        { w: 0.3, h: 0.95, c: 'rgba(60,110,255,0.75)' },
        { w: 0.2, h: 0.72, c: 'rgba(110,210,255,0.85)' },
        { w: 0.1, h: 0.42, c: 'rgba(235,250,255,0.95)' },
      ];
      for (const [li, L] of layers.entries()) {
        for (let tongue = -1; tongue <= 1; tongue++) {
          const n = now / 1000;
          const k = 0.7 + 0.3 * Math.sin(n * (9 + tongue * 2) + i * 3 + li) * Math.sin(n * 5.3 + tongue);
          const h = t * L.h * k * (tongue ? 0.72 : 1);
          const w = t * L.w * (tongue ? 0.7 : 1);
          const bx = fx + tongue * t * L.w * 0.75;
          const sway = Math.sin(n * 4 + tongue + i) * w * 0.6;
          g.fillStyle = L.c;
          g.beginPath();
          g.moveTo(bx - w, fy);
          g.bezierCurveTo(
            bx - w * 1.1,
            fy - h * 0.45,
            bx - w * 0.2 + sway,
            fy - h * 0.7,
            bx + sway * 1.4,
            fy - h,
          );
          g.bezierCurveTo(bx + w * 0.3 + sway, fy - h * 0.65, bx + w * 1.1, fy - h * 0.4, bx + w, fy);
          g.quadraticCurveTo(bx, fy + w * 0.5, bx - w, fy);
          g.fill();
        }
      }
      // Sparks lifting off it.
      for (let s2 = 0; s2 < 4; s2++) {
        const life = (now / 900 + s2 * 0.25 + i * 0.5) % 1;
        g.globalAlpha = 1 - life;
        g.fillStyle = '#bfe8ff';
        g.beginPath();
        g.arc(
          fx + Math.sin(s2 * 3 + now / 300) * t * 0.15,
          fy - t * (0.8 + life * 0.9),
          t * 0.03,
          0,
          Math.PI * 2,
        );
        g.fill();
      }
      g.globalAlpha = 1;
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
    // One repeating pattern, not tiles side by side: tiles at in-between pixel positions leave a faint dark
    // seam along every edge, and the seams drift across the streets with the fog.
    const tiled = (c: CanvasRenderingContext2D, ox: number, oy: number, size: number) => {
      const pat = c.createPattern(tile, 'repeat');
      if (!pat) return;
      pat.setTransform(new DOMMatrix().translate(ox, oy).scale(size / tile.width));
      c.fillStyle = pat;
      c.fillRect(0, 0, fw, fh);
    };
    f.globalCompositeOperation = 'source-over';
    f.clearRect(0, 0, fw, fh);
    const layer = (speed: number, tint: string, alpha: number, size: number) => {
      const s = size * scale;
      const ox = (((-v.cam.x * scale - (now / 1000) * speed * v.t * scale) % s) + s) % s;
      const oy = (((-v.cam.y * scale + (now / 1000) * speed * 0.3 * v.t * scale) % s) + s) % s;
      f.globalAlpha = alpha;
      tiled(f, ox, oy, s);
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
    tiled(m, ox2, oy2, s2);
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
    g.globalAlpha = 0.6;
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
  glowSprite(key: string, r: number, g: number, b: number) {
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

  /** The pumpkin without its face, drawn once at the screen's full sharpness: ribs, creases, shine, stem. */
  pumpkinBody(t: number, dpr: number) {
    const k = `pumpkin:${t}:${dpr}`;
    let c = this.sprites.get(k);
    if (c) return c;
    const W = t * 1.5 * 1.24;
    const H = t * 1.18 * 1.5;
    c = document.createElement('canvas');
    c.width = Math.round(W * dpr);
    c.height = Math.round(H * dpr);
    const g = c.getContext('2d')!;
    g.scale(dpr, dpr);
    const cx = W / 2;
    const cy = H * 0.63;
    const R = t * 0.75;
    const RY = t * 0.56;
    const ink = '#2a0d00';
    // Lobes, back to front: the outer ones darker, the middle one brightest.
    const lobes = [
      { dx: -0.62, w: 0.42, light: 0.55 },
      { dx: 0.62, w: 0.42, light: 0.55 },
      { dx: -0.36, w: 0.5, light: 0.8 },
      { dx: 0.36, w: 0.5, light: 0.8 },
      { dx: 0, w: 0.52, light: 1 },
    ];
    // The outline first, thick, round the whole pumpkin.
    g.lineWidth = Math.max(2.5, t * 0.07);
    g.strokeStyle = ink;
    for (const l of lobes) {
      g.beginPath();
      g.ellipse(cx + l.dx * R, cy, R * l.w, RY, 0, 0, Math.PI * 2);
      g.stroke();
    }
    for (const l of lobes) {
      const lx = cx + l.dx * R;
      const gr = g.createRadialGradient(lx - R * l.w * 0.3, cy - RY * 0.45, 0, lx, cy, R * l.w * 1.2);
      const a = l.light;
      gr.addColorStop(0, `rgb(${Math.round(255)},${Math.round(150 + 50 * a)},${Math.round(40 + 40 * a)})`);
      gr.addColorStop(
        0.55,
        `rgb(${Math.round(225 + 25 * a)},${Math.round(95 + 30 * a)},${Math.round(10 + 10 * a)})`,
      );
      gr.addColorStop(1, `rgb(${Math.round(140 + 20 * a)},${Math.round(45 + 10 * a)},0)`);
      g.fillStyle = gr;
      g.beginPath();
      g.ellipse(lx, cy, R * l.w, RY, 0, 0, Math.PI * 2);
      g.fill();
      // The crease at each lobe's edge.
      g.strokeStyle = 'rgba(90,25,0,0.75)';
      g.lineWidth = Math.max(1.2, t * 0.025);
      g.beginPath();
      g.ellipse(lx, cy, R * l.w, RY * 0.98, 0, -Math.PI * 0.42, Math.PI * 0.42);
      g.stroke();
    }
    // Shadow under the bottom and a rim of light on top.
    const shade = g.createLinearGradient(0, cy - RY, 0, cy + RY);
    shade.addColorStop(0, 'rgba(255,230,160,0.18)');
    shade.addColorStop(0.55, 'rgba(0,0,0,0)');
    shade.addColorStop(1, 'rgba(60,10,0,0.45)');
    g.save();
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = shade;
    g.fillRect(0, 0, W, H);
    g.restore();
    // Glossy streaks.
    g.fillStyle = 'rgba(255,245,210,0.5)';
    for (const [dx, w] of [
      [-0.12, 0.09],
      [-0.48, 0.06],
    ] as const) {
      g.beginPath();
      g.ellipse(cx + dx * R, cy - RY * 0.55, R * w, RY * 0.16, -0.25, 0, Math.PI * 2);
      g.fill();
    }
    // The stem: thick, bent, dark green, with a curling vine and a leaf.
    const sx = cx + R * 0.04;
    const sy = cy - RY * 0.88;
    const sg = g.createLinearGradient(sx - t * 0.1, 0, sx + t * 0.12, 0);
    sg.addColorStop(0, '#2f4a14');
    sg.addColorStop(0.5, '#6b8f2a');
    sg.addColorStop(1, '#2a3f10');
    g.fillStyle = sg;
    g.strokeStyle = ink;
    g.lineWidth = Math.max(2, t * 0.05);
    g.beginPath();
    g.moveTo(sx - t * 0.1, sy + t * 0.05);
    g.quadraticCurveTo(sx - t * 0.12, sy - t * 0.22, sx + t * 0.08, sy - t * 0.36);
    g.lineTo(sx + t * 0.2, sy - t * 0.3);
    g.quadraticCurveTo(sx + t * 0.06, sy - t * 0.18, sx + t * 0.1, sy + t * 0.05);
    g.closePath();
    g.fill();
    g.stroke();
    // Vine: a little spiral off the stem.
    g.strokeStyle = '#4f7a1e';
    g.lineWidth = Math.max(1.5, t * 0.03);
    g.beginPath();
    for (let i = 0; i <= 30; i++) {
      const a = i * 0.32;
      const r = t * 0.16 * (1 - i / 34);
      const px = sx + t * 0.2 + Math.cos(a) * r;
      const py = sy - t * 0.12 + Math.sin(a) * r * 0.8;
      if (i) g.lineTo(px, py);
      else g.moveTo(px, py);
    }
    g.stroke();
    // Leaf.
    g.fillStyle = '#5e8c22';
    g.strokeStyle = ink;
    g.lineWidth = Math.max(1.5, t * 0.035);
    g.beginPath();
    g.moveTo(sx - t * 0.08, sy - t * 0.06);
    g.quadraticCurveTo(sx - t * 0.42, sy - t * 0.28, sx - t * 0.48, sy - t * 0.02);
    g.quadraticCurveTo(sx - t * 0.3, sy + t * 0.04, sx - t * 0.08, sy - t * 0.06);
    g.fill();
    g.stroke();
    this.sprites.set(k, c);
    return c;
  }
}
