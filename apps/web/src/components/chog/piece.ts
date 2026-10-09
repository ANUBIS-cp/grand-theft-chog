// A Chog as a game piece: the whole picture, uncut, on a thick card that stands in a round base in the
// owner's colour, like a board-game standee. The card is never mirrored (hats have words on them); turning
// round is a quick spin instead. Walking is a hop with a squash on landing.

const INK = '#0d0b1a';

export interface PieceLook {
  /** Base colour (the gang's colour, or a team colour in a heist). */
  base: string;
  /** Picture width in CSS px. */
  size: number;
  /** A guard's cap on top of the card. */
  cap?: boolean;
  /** A gold rim on the card: you. */
  gold?: boolean;
}

/** A pre-drawn piece. Its feet (the middle of the base) are at (fx, fy) inside the canvas, in CSS px. */
export interface Piece {
  c: HTMLCanvasElement;
  w: number;
  h: number;
  fx: number;
  fy: number;
  /** Height of the card above the feet, for placing names and bubbles. */
  top: number;
}

function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f)));
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

/**
 * Draws the piece once into its own canvas. `img` is the Chog's picture; without one (a guest, or while it
 * loads) the card shows a dark silhouette.
 */
export function makePiece(img: HTMLImageElement | undefined, look: PieceLook, dpr: number): Piece {
  const s = look.size;
  const border = Math.max(2, Math.round(s * 0.055));
  const edge = Math.max(2, Math.round(s * 0.06)); // the card's thickness, seen below it
  const cw = s + border * 2;
  const ch = s + border * 2;
  const r = Math.round(cw * 0.16);
  const bw = cw * 0.78; // base
  const bh = cw * 0.26;
  const lip = Math.max(3, Math.round(cw * 0.07));
  const capH = look.cap ? Math.round(s * 0.36) : 0;
  const pad = 3;
  const w = Math.ceil(Math.max(cw, bw) + pad * 2);
  const h = Math.ceil(capH + ch + edge + bh * 0.5 + lip + pad * 2);
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * dpr);
  c.height = Math.ceil(h * dpr);
  const g = c.getContext('2d')!;
  g.scale(dpr, dpr);
  const fx = w / 2;
  const fy = h - pad - lip - bh * 0.5; // middle of the base's top face
  const cx = fx - cw / 2;
  const cy = fy - ch - edge + bh * 0.18; // the card sits a little into the base

  // Base: a thick round puck in the owner's colour. Side first, then the top face.
  const base = look.base;
  g.lineWidth = 2;
  g.strokeStyle = INK;
  g.fillStyle = shade(base, -0.45);
  g.beginPath();
  g.ellipse(fx, fy + lip, bw / 2, bh / 2, 0, 0, Math.PI);
  g.lineTo(fx - bw / 2, fy);
  g.ellipse(fx, fy, bw / 2, bh / 2, 0, Math.PI, 0, true);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = base;
  g.beginPath();
  g.ellipse(fx, fy, bw / 2, bh / 2, 0, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.fillStyle = shade(base, -0.6);
  g.beginPath();
  g.ellipse(fx, fy - bh * 0.04, cw * 0.36, bh * 0.16, 0, 0, Math.PI * 2);
  g.fill();

  // The card's thickness.
  g.fillStyle = look.gold ? '#a8761a' : '#2a2540';
  g.beginPath();
  g.roundRect(cx, cy + edge, cw, ch, r);
  g.fill();
  g.stroke();

  // The card face: a white sticker border round the picture.
  g.fillStyle = look.gold ? '#ffd23f' : '#ffffff';
  g.beginPath();
  g.roundRect(cx, cy, cw, ch, r);
  g.fill();
  g.save();
  g.beginPath();
  g.roundRect(cx + border, cy + border, s, s, Math.max(2, r - border));
  g.clip();
  if (img && img.complete && img.naturalWidth) {
    g.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, cx + border, cy + border, s, s);
  } else {
    const gr = g.createLinearGradient(0, cy, 0, cy + s);
    gr.addColorStop(0, '#4a4366');
    gr.addColorStop(1, '#2b2640');
    g.fillStyle = gr;
    g.fillRect(cx + border, cy + border, s, s);
    // A Chog's outline: a round head with spikes.
    const hx = fx;
    const hy = cy + border + s * 0.62;
    g.fillStyle = '#6d6690';
    g.beginPath();
    for (let i = 0; i <= 14; i++) {
      const a = Math.PI + (i / 14) * Math.PI;
      const rr = i % 2 ? s * 0.5 : s * 0.36;
      g.lineTo(hx + Math.cos(a) * rr, hy + Math.sin(a) * rr * 0.9);
    }
    g.lineTo(hx + s * 0.36, hy + s * 0.5);
    g.lineTo(hx - s * 0.36, hy + s * 0.5);
    g.closePath();
    g.fill();
  }
  // A soft shine across the top so it reads as a glossy card.
  const sh = g.createLinearGradient(0, cy, 0, cy + s * 0.5);
  sh.addColorStop(0, 'rgba(255,255,255,0.22)');
  sh.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = sh;
  g.fillRect(cx + border, cy + border, s, s * 0.5);
  g.restore();
  g.lineWidth = Math.max(2, s * 0.04);
  g.strokeStyle = INK;
  g.beginPath();
  g.roundRect(cx, cy, cw, ch, r);
  g.stroke();
  g.lineWidth = 1;
  g.strokeStyle = 'rgba(13,11,26,0.35)';
  g.beginPath();
  g.roundRect(cx + border, cy + border, s, s, Math.max(2, r - border));
  g.stroke();

  // The front lip of the base, over the bottom of the card, so the card stands in a slot.
  g.lineWidth = 2;
  g.strokeStyle = INK;
  g.fillStyle = base;
  g.beginPath();
  g.ellipse(fx, fy, bw / 2, bh / 2, 0, 0.12 * Math.PI, 0.88 * Math.PI);
  g.ellipse(fx, fy - bh * 0.12, bw * 0.42, bh * 0.22, 0, 0.85 * Math.PI, 0.15 * Math.PI, true);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.beginPath();
  g.ellipse(fx - bw * 0.22, fy - bh * 0.18, bw * 0.08, bh * 0.08, -0.3, 0, Math.PI * 2);
  g.fill();

  if (look.cap) {
    // A guard's cap sitting on the card's top edge.
    const kw = cw * 0.7;
    const top = cy - capH * 0.8;
    g.fillStyle = '#1b2a52';
    g.strokeStyle = INK;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(fx - kw / 2, top + capH);
    g.quadraticCurveTo(fx - kw / 2, top, fx, top);
    g.quadraticCurveTo(fx + kw / 2, top, fx + kw / 2, top + capH);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = '#0d1428';
    g.beginPath();
    g.roundRect(fx - kw * 0.6, top + capH - 3, kw * 1.2, capH * 0.32, 3);
    g.fill();
    g.stroke();
    g.fillStyle = '#ffd666';
    g.beginPath();
    g.arc(fx, top + capH * 0.48, capH * 0.2, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 1.5;
    g.stroke();
  }
  return { c, w, h, fx, fy, top: fy - cy + capH * 0.8 };
}

export interface Motion {
  moving: boolean;
  /** A per-piece number so pieces don't hop in step. */
  seed: number;
  /** -1 left, 1 right: the way it leans while walking. */
  face: -1 | 1;
  /** ms since it last turned round (spins the card), or Infinity. */
  turned?: number;
  /** ms since it last did an emote (a wiggle), or Infinity. */
  emoted?: number;
  alpha?: number;
}

/** How high the piece is off the ground right now (CSS px), for the shadow and the name tag. */
export function hopHeight(p: Piece, m: Motion, now: number) {
  if (!m.moving) return 0;
  const k = (now / 260 + m.seed) % 1;
  return Math.sin(k * Math.PI) * p.top * 0.16;
}

/** Draws a piece with its feet at (x, y): shadow, hop, squash, lean, spin and wiggle. */
export function drawPiece(
  g: CanvasRenderingContext2D,
  p: Piece,
  x: number,
  y: number,
  m: Motion,
  now: number,
) {
  const lift = hopHeight(p, m, now);
  const k = (now / 260 + m.seed) % 1;
  // Squash on landing, stretch in the air, a slow breath when standing.
  let sy = 1;
  if (m.moving) sy = k < 0.12 || k > 0.92 ? 0.9 : 1 + Math.sin(k * Math.PI) * 0.05;
  else sy = 1 + Math.sin(now / 700 + m.seed * 6) * 0.012;
  let sx = 1 / sy;
  if (m.turned !== undefined && m.turned < 220) sx *= Math.abs(Math.cos((m.turned / 220) * Math.PI));
  let rot = m.moving ? m.face * 0.07 : 0;
  if (m.emoted !== undefined && m.emoted < 700) rot += Math.sin(m.emoted / 45) * 0.12 * (1 - m.emoted / 700);

  // Shadow: smaller and lighter while in the air.
  const sw = p.w * 0.42 * (1 - lift / (p.top * 0.4));
  g.fillStyle = `rgba(0,0,0,${0.42 - lift / (p.top * 1.2)})`;
  g.beginPath();
  g.ellipse(x, y + p.h - p.fy - 4, sw, sw * 0.3, 0, 0, Math.PI * 2);
  g.fill();

  g.save();
  if (m.alpha !== undefined) g.globalAlpha = m.alpha;
  g.translate(x, y - lift);
  g.rotate(rot);
  g.scale(Math.max(0.04, sx), sy);
  g.drawImage(p.c, -p.fx, -p.fy, p.w, p.h);
  g.restore();
}
