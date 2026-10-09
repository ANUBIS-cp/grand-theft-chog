import type { GangId } from '@chog-city/data';

// Each gang's building is dressed for its gang trait, so you can tell them apart from across the city: the
// Royals' castle, the Wizards' tower, the Clowns' tent, the BTC Maxis' giant coin and so on. A landmark is
// painted on the roof (0..R) and may rise up to LANDMARK_RISE tiles above it (it can hide someone on the
// road behind for a moment, like a tall building would). The front wall's material and
// trim come from facadeOf().

const INK = '#0d0b1a';
export const LANDMARK_RISE = 3.2;

export type Pattern = 'brick' | 'stone' | 'stripes' | 'glass' | 'wood' | 'tile' | 'panel' | 'diamonds';

export interface Facade {
  wall: string;
  pattern: Pattern;
  /** Second colour for stripes, diamonds and trim. */
  alt: string;
  roof: string;
  /** Bars over the upstairs windows. */
  bars?: boolean;
}

export const FACADE: Record<GangId, Facade> = {
  mcga: { wall: '#5c2730', pattern: 'brick', alt: '#e63946', roof: '#2a1d2b' },
  lazoor: { wall: '#2f3a4f', pattern: 'panel', alt: '#5dffa8', roof: '#1d2433' },
  gangstas: { wall: '#3d2a1f', pattern: 'wood', alt: '#d9b44a', roof: '#21170f' },
  robbers: { wall: '#4a3a33', pattern: 'brick', alt: '#9a8a70', roof: '#241c1a', bars: true },
  suits: { wall: '#2c3e5c', pattern: 'glass', alt: '#8fb7e8', roof: '#1b2538' },
  royals: { wall: '#6a6478', pattern: 'stone', alt: '#e8b931', roof: '#3a3446' },
  wizards: { wall: '#3d2d63', pattern: 'stone', alt: '#b48cff', roof: '#241a3d' },
  'squid-game': { wall: '#c2366a', pattern: 'panel', alt: '#2fd1b0', roof: '#3a1a2a' },
  jailbirds: { wall: '#2b2b30', pattern: 'stripes', alt: '#e9e6dc', roof: '#1e1e22', bars: true },
  clowns: { wall: '#6b2fa0', pattern: 'diamonds', alt: '#ffd23f', roof: '#2c1a40' },
  'btc-maxis': { wall: '#7a4512', pattern: 'panel', alt: '#f7931a', roof: '#2e1d0d' },
  'mon-maxis': { wall: '#3b2a7a', pattern: 'glass', alt: '#836ef9', roof: '#1f1740' },
  crybabies: { wall: '#3e6d8f', pattern: 'tile', alt: '#bfe6ff', roof: '#1e3346' },
  'visor-gang': { wall: '#1b1830', pattern: 'panel', alt: '#ff4fd8', roof: '#120f22' },
  skulls: { wall: '#2e2a30', pattern: 'stone', alt: '#d8d2c0', roof: '#18161a' },
  radioactive: { wall: '#4d5246', pattern: 'panel', alt: '#9dff3b', roof: '#23261f' },
};

type G = CanvasRenderingContext2D;

function ink(g: G, lw = 2) {
  g.strokeStyle = INK;
  g.lineWidth = lw;
  g.lineJoin = 'round';
  g.lineCap = 'round';
}

function shape(g: G, fill: string, draw: () => void, lw = 2) {
  g.beginPath();
  draw();
  g.fillStyle = fill;
  g.fill();
  ink(g, lw);
  g.stroke();
}

function poly(g: G, pts: [number, number][]) {
  g.moveTo(pts[0]![0], pts[0]![1]);
  for (const [x, y] of pts.slice(1)) g.lineTo(x, y);
  g.closePath();
}

function star(g: G, x: number, y: number, r: number, fill: string) {
  shape(
    g,
    fill,
    () => {
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? r * 0.45 : r;
        g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      g.closePath();
    },
    1.5,
  );
}

function text(g: G, s: string, x: number, y: number, size: number, fill: string, font: string, max?: number) {
  g.font = `${Math.round(size)}px ${font}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = fill;
  g.fillText(s, x, y, max);
}

/** A flag on a pole, planted at (x, y). */
function flag(g: G, x: number, y: number, h: number, color: string) {
  ink(g, 2);
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x, y - h);
  g.stroke();
  shape(
    g,
    color,
    () =>
      poly(g, [
        [x, y - h],
        [x + h * 0.55, y - h * 0.82],
        [x, y - h * 0.64],
      ]),
    1.5,
  );
}

/** Wall texture inside (x, y, w, h). */
export function paintWall(g: G, f: Facade, x: number, y: number, w: number, h: number, t: number) {
  g.fillStyle = f.wall;
  g.fillRect(x, y, w, h);
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.strokeStyle = 'rgba(0,0,0,0.2)';
  g.lineWidth = 1;
  switch (f.pattern) {
    case 'brick':
    case 'stone': {
      const bh = f.pattern === 'brick' ? t * 0.22 : t * 0.36;
      const bw = f.pattern === 'brick' ? bh * 2 : bh * 1.6;
      for (let yy = y, row = 0; yy < y + h; yy += bh, row++) {
        g.beginPath();
        g.moveTo(x, yy);
        g.lineTo(x + w, yy);
        g.stroke();
        for (let xx = x + (row % 2 ? bw / 2 : 0); xx < x + w; xx += bw) {
          g.beginPath();
          g.moveTo(xx, yy);
          g.lineTo(xx, yy + bh);
          g.stroke();
        }
      }
      if (f.pattern === 'stone') {
        g.fillStyle = 'rgba(255,255,255,0.05)';
        for (let i = 0; i < 18; i++) g.fillRect(x + ((i * 97) % w), y + ((i * 53) % h), bw * 0.8, bh * 0.7);
      }
      break;
    }
    case 'stripes': {
      const sw = t * 0.32;
      g.fillStyle = f.alt;
      for (let xx = x; xx < x + w; xx += sw * 2) g.fillRect(xx, y, sw, h);
      break;
    }
    case 'glass': {
      const cw = t * 0.7;
      g.fillStyle = 'rgba(255,255,255,0.08)';
      for (let xx = x; xx < x + w; xx += cw) {
        g.fillRect(xx + 2, y, cw * 0.35, h);
        g.beginPath();
        g.moveTo(xx, y);
        g.lineTo(xx, y + h);
        g.stroke();
      }
      break;
    }
    case 'wood': {
      const ph = t * 0.18;
      for (let yy = y; yy < y + h; yy += ph) {
        g.beginPath();
        g.moveTo(x, yy);
        g.lineTo(x + w, yy);
        g.stroke();
      }
      break;
    }
    case 'tile': {
      const s = t * 0.3;
      for (let yy = y; yy < y + h; yy += s) {
        g.beginPath();
        g.moveTo(x, yy);
        g.lineTo(x + w, yy);
        g.stroke();
      }
      for (let xx = x; xx < x + w; xx += s) {
        g.beginPath();
        g.moveTo(xx, y);
        g.lineTo(xx, y + h);
        g.stroke();
      }
      break;
    }
    case 'panel': {
      const pw = t * 1.25;
      for (let xx = x; xx < x + w; xx += pw) {
        g.beginPath();
        g.moveTo(xx, y);
        g.lineTo(xx, y + h);
        g.stroke();
        g.fillStyle = 'rgba(0,0,0,0.6)';
        for (const yy of [y + t * 0.2, y + h - t * 0.2]) {
          g.beginPath();
          g.arc(xx + t * 0.15, yy, 1.4, 0, Math.PI * 2);
          g.fill();
        }
      }
      break;
    }
    case 'diamonds': {
      const s = t * 0.5;
      g.fillStyle = f.alt;
      g.globalAlpha = 0.35;
      for (let yy = y, row = 0; yy < y + h + s; yy += s, row++)
        for (let xx = x + (row % 2 ? s / 2 : 0); xx < x + w + s; xx += s) {
          g.beginPath();
          poly(g, [
            [xx, yy - s / 2],
            [xx + s / 4, yy],
            [xx, yy + s / 2],
            [xx - s / 4, yy],
          ]);
          g.fill();
        }
      g.globalAlpha = 1;
      break;
    }
  }
  g.restore();
}

/**
 * Paints the gang's landmark on the roof. W is the building's width and R the roof's depth (px); t is one
 * tile. `color` is the gang's colour.
 */
export function paintLandmark(
  g: G,
  gang: GangId,
  W: number,
  R: number,
  t: number,
  color: string,
  font: string,
) {
  const cx = W / 2;
  const f = FACADE[gang];
  switch (gang) {
    case 'mcga': {
      // A giant red cap with the words on it.
      const by = R * 0.9;
      shape(g, '#c92d39', () => g.ellipse(cx + t * 1.4, by, t * 1.6, t * 0.42, 0, 0, Math.PI * 2));
      shape(g, '#e63946', () => {
        g.moveTo(cx - t * 2.2, by);
        g.bezierCurveTo(cx - t * 2.2, by - t * 2.9, cx + t * 2.2, by - t * 2.9, cx + t * 2.2, by);
        g.closePath();
      });
      shape(g, '#e63946', () => g.arc(cx, by - t * 2.15, t * 0.2, 0, Math.PI * 2), 1.5);
      text(g, 'MCGA', cx, by - t * 0.85, t * 0.95, '#ffffff', font, t * 3.6);
      flag(g, t * 0.8, R * 0.85, t * 1.5, '#e63946');
      flag(g, W - t * 0.8, R * 0.85, t * 1.5, '#ffffff');
      break;
    }
    case 'lazoor': {
      // A laser cannon on a turret, its beam going up into the sky.
      const bx = cx + t * 0.3;
      const by = R * 0.75;
      g.save();
      const beam = g.createLinearGradient(bx, by - t, bx + t * 4, by - t * 3.5);
      beam.addColorStop(0, 'rgba(93,255,168,0.95)');
      beam.addColorStop(1, 'rgba(93,255,168,0)');
      g.strokeStyle = beam;
      g.lineWidth = t * 0.28;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(bx + t * 0.9, by - t * 1.3);
      g.lineTo(bx + t * 4.5, by - t * 3.6);
      g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.lineWidth = t * 0.08;
      g.stroke();
      g.restore();
      shape(g, '#55617a', () => g.ellipse(bx, by, t * 1.3, t * 0.45, 0, 0, Math.PI * 2));
      shape(g, '#6f7d99', () => g.roundRect(bx - t * 0.8, by - t * 1.2, t * 1.6, t * 1.1, t * 0.3));
      g.save();
      g.translate(bx, by - t * 0.8);
      g.rotate(-0.58);
      shape(g, '#8a97b3', () => g.roundRect(0, -t * 0.22, t * 1.5, t * 0.44, t * 0.12));
      shape(g, '#5dffa8', () => g.roundRect(t * 1.4, -t * 0.26, t * 0.25, t * 0.52, t * 0.08), 1.5);
      g.restore();
      // A dish beside it.
      shape(g, '#c9d1e6', () => g.ellipse(t * 1.7, R * 0.45, t * 0.75, t * 0.5, -0.4, 0, Math.PI * 2));
      shape(g, '#8a97b3', () => g.arc(t * 1.7, R * 0.45, t * 0.12, 0, Math.PI * 2), 1.5);
      break;
    }
    case 'gangstas': {
      // A huge fedora with a gold band, and a fat cigar with smoke.
      const by = R * 0.85;
      shape(g, '#3b3540', () => g.ellipse(cx, by, t * 2.6, t * 0.55, 0, 0, Math.PI * 2));
      shape(g, '#4a4352', () => {
        g.moveTo(cx - t * 1.6, by - t * 0.1);
        g.bezierCurveTo(cx - t * 1.7, by - t * 2.2, cx - t * 0.4, by - t * 1.6, cx, by - t * 1.9);
        g.bezierCurveTo(cx + t * 0.4, by - t * 1.6, cx + t * 1.7, by - t * 2.2, cx + t * 1.6, by - t * 0.1);
        g.closePath();
      });
      shape(g, f.alt, () => g.rect(cx - t * 1.6, by - t * 0.62, t * 3.2, t * 0.38), 1.5);
      const sx = W - t * 2.2;
      shape(g, '#8b5a2b', () => g.roundRect(sx - t * 1.1, R * 0.5, t * 1.6, t * 0.3, t * 0.12), 1.5);
      shape(g, '#ff7a1a', () => g.roundRect(sx + t * 0.4, R * 0.5, t * 0.2, t * 0.3, t * 0.05), 1.5);
      g.fillStyle = 'rgba(220,220,230,0.55)';
      for (const [dx, dy, r] of [
        [0.7, -0.2, 0.25],
        [0.95, -0.7, 0.32],
        [0.8, -1.3, 0.4],
      ] as const) {
        g.beginPath();
        g.arc(sx + dx * t, R * 0.5 + dy * t, r * t, 0, Math.PI * 2);
        g.fill();
      }
      break;
    }
    case 'robbers': {
      // A bulging money bag on the roof.
      const by = R * 0.95;
      shape(g, '#c8a46a', () => {
        g.moveTo(cx - t * 0.5, by - t * 2.0);
        g.bezierCurveTo(cx - t * 2.3, by - t * 1.2, cx - t * 2.0, by, cx, by);
        g.bezierCurveTo(cx + t * 2.0, by, cx + t * 2.3, by - t * 1.2, cx + t * 0.5, by - t * 2.0);
        g.closePath();
      });
      shape(g, '#a67f45', () => g.ellipse(cx, by - t * 2.05, t * 0.75, t * 0.25, 0, 0, Math.PI * 2), 1.5);
      shape(
        g,
        '#c8a46a',
        () => {
          poly(g, [
            [cx - t * 0.6, by - t * 2.1],
            [cx - t * 0.9, by - t * 2.7],
            [cx, by - t * 2.3],
            [cx + t * 0.9, by - t * 2.7],
            [cx + t * 0.6, by - t * 2.1],
          ]);
        },
        1.5,
      );
      text(g, '$', cx, by - t * 0.85, t * 1.3, '#2f7d4f', font);
      // Loose notes beside it.
      for (const [x, r] of [
        [t * 1.6, 0.3],
        [W - t * 1.8, -0.4],
      ] as const) {
        g.save();
        g.translate(x, R * 0.55);
        g.rotate(r);
        shape(g, '#7bd389', () => g.rect(-t * 0.5, -t * 0.25, t, t * 0.5), 1.5);
        text(g, '$', 0, 0, t * 0.35, '#2f7d4f', font);
        g.restore();
      }
      break;
    }
    case 'suits': {
      // A glass tower rising off one end, and a helipad.
      const x0 = W - t * 3.6;
      shape(g, '#3d5a85', () => g.rect(x0, -t * 1.6, t * 2.8, R + t * 1.6 - t * 0.2));
      g.fillStyle = 'rgba(160,200,255,0.35)';
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 4; j++)
          g.fillRect(x0 + t * 0.2 + i * t * 0.66, -t * 1.4 + j * t * 0.8, t * 0.46, t * 0.6);
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(x0 + t * 0.15, -t * 1.6, t * 0.25, R + t * 1.4);
      ink(g, 2);
      g.strokeRect(x0, -t * 1.6, t * 2.8, R + t * 1.4);
      shape(g, '#4a5470', () => g.ellipse(t * 2.6, R * 0.5, t * 1.3, t * 0.6, 0, 0, Math.PI * 2));
      g.strokeStyle = '#ffd666';
      g.lineWidth = 2;
      g.beginPath();
      g.ellipse(t * 2.6, R * 0.5, t * 1.05, t * 0.45, 0, 0, Math.PI * 2);
      g.stroke();
      text(g, 'H', t * 2.6, R * 0.52, t * 0.6, '#ffd666', font);
      break;
    }
    case 'royals': {
      // Battlements, two turrets with flags, and a giant crown.
      const merl = t * 0.5;
      for (let x = 0; x < W; x += merl * 2)
        shape(g, '#7a7488', () => g.rect(x, -t * 0.35, merl, t * 0.4), 1.5);
      for (const x of [t * 0.9, W - t * 0.9]) {
        shape(g, '#7a7488', () => g.rect(x - t * 0.7, -t * 1.2, t * 1.4, R + t * 1.2));
        shape(g, '#2b4fa8', () =>
          poly(g, [
            [x - t * 0.85, -t * 1.2],
            [x, -t * 2.3],
            [x + t * 0.85, -t * 1.2],
          ]),
        );
        flag(g, x, -t * 2.25, t * 0.9, f.alt);
        shape(g, '#1a1626', () => g.roundRect(x - t * 0.18, -t * 0.6, t * 0.36, t * 0.6, t * 0.18), 1.5);
      }
      const s = t * 1.4;
      const cy = R * 0.6;
      shape(
        g,
        '#ffd23f',
        () => {
          poly(g, [
            [cx - s, cy + s * 0.45],
            [cx - s * 1.05, cy - s * 0.55],
            [cx - s * 0.5, cy - s * 0.05],
            [cx, cy - s * 0.85],
            [cx + s * 0.5, cy - s * 0.05],
            [cx + s * 1.05, cy - s * 0.55],
            [cx + s, cy + s * 0.45],
          ]);
        },
        2.5,
      );
      for (const [dx, c] of [
        [-0.55, '#e63946'],
        [0, '#2b4fa8'],
        [0.55, '#2a9d8f'],
      ] as const)
        shape(g, c, () => g.arc(cx + dx * s, cy + s * 0.15, s * 0.13, 0, Math.PI * 2), 1.5);
      break;
    }
    case 'wizards': {
      // A round tower with a starry wizard-hat roof, and sparkles.
      const x = t * 2.2;
      shape(g, '#4b3a7a', () => g.rect(x - t * 0.9, -t * 0.4, t * 1.8, R + t * 0.3));
      shape(g, '#ffd88a', () => g.roundRect(x - t * 0.22, t * 0.1, t * 0.44, t * 0.6, t * 0.22), 1.5);
      shape(g, '#5b3db0', () => {
        g.moveTo(x - t * 1.25, -t * 0.35);
        g.quadraticCurveTo(x - t * 0.2, -t * 1.2, x + t * 0.5, -t * 2.6);
        g.quadraticCurveTo(x + t * 0.3, -t * 1.2, x + t * 1.25, -t * 0.35);
        g.closePath();
      });
      shape(g, '#3d2a7a', () => g.ellipse(x, -t * 0.35, t * 1.35, t * 0.25, 0, 0, Math.PI * 2));
      star(g, x - t * 0.1, -t * 1.0, t * 0.22, '#ffd23f');
      star(g, x + t * 0.35, -t * 1.7, t * 0.15, '#ffd23f');
      // A crescent moon and sparkles over the roof.
      g.fillStyle = '#ffe9a8';
      g.beginPath();
      g.arc(W - t * 2, R * 0.35, t * 0.6, 0, Math.PI * 2);
      g.fill();
      ink(g, 2);
      g.stroke();
      g.fillStyle = FACADE.wizards.roof;
      g.beginPath();
      g.arc(W - t * 1.75, R * 0.25, t * 0.5, 0, Math.PI * 2);
      g.fill();
      for (const [sx, sy, r] of [
        [5.2, 0.4, 0.14],
        [6.1, 1.3, 0.1],
        [4.4, 1.2, 0.09],
      ] as const)
        star(g, sx * t, sy * t, r * t, '#b48cff');
      break;
    }
    case 'squid-game': {
      // The three shapes, big, on the roof.
      const y = R * 0.55;
      g.lineWidth = t * 0.22;
      g.strokeStyle = '#ffffff';
      g.beginPath();
      g.arc(cx - t * 2.4, y, t * 0.65, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      poly(g, [
        [cx, y - t * 0.75],
        [cx + t * 0.75, y + t * 0.55],
        [cx - t * 0.75, y + t * 0.55],
      ]);
      g.stroke();
      g.strokeRect(cx + t * 1.75, y - t * 0.65, t * 1.3, t * 1.3);
      // Ink outline round the white strokes.
      g.lineWidth = 1.5;
      g.strokeStyle = INK;
      g.beginPath();
      g.arc(cx - t * 2.4, y, t * 0.76, 0, Math.PI * 2);
      g.stroke();
      flag(g, t * 0.7, R * 0.9, t * 1.3, '#2fd1b0');
      flag(g, W - t * 0.7, R * 0.9, t * 1.3, '#ef476f');
      break;
    }
    case 'jailbirds': {
      // A big birdcage on the roof with a bird inside.
      const by = R * 0.95;
      shape(g, '#3a3a44', () => g.ellipse(cx, by, t * 1.5, t * 0.3, 0, 0, Math.PI * 2));
      g.strokeStyle = '#d9d4c3';
      g.lineWidth = t * 0.09;
      for (let i = -4; i <= 4; i++) {
        g.beginPath();
        g.moveTo(cx + i * t * 0.34, by);
        g.quadraticCurveTo(cx + i * t * 0.34, by - t * 2.6, cx, by - t * 2.7);
        g.stroke();
      }
      // The bird.
      shape(g, '#ffcc33', () => g.ellipse(cx, by - t * 0.85, t * 0.45, t * 0.38, 0, 0, Math.PI * 2), 1.5);
      shape(
        g,
        '#ff8c1a',
        () =>
          poly(g, [
            [cx + t * 0.4, by - t * 0.9],
            [cx + t * 0.7, by - t * 0.8],
            [cx + t * 0.4, by - t * 0.7],
          ]),
        1.5,
      );
      g.fillStyle = INK;
      g.beginPath();
      g.arc(cx + t * 0.18, by - t * 0.95, t * 0.06, 0, Math.PI * 2);
      g.fill();
      // Stripes on the bird, of course.
      g.strokeStyle = INK;
      g.lineWidth = 1.5;
      for (const dx of [-0.2, 0]) {
        g.beginPath();
        g.moveTo(cx + dx * t, by - t * 1.2);
        g.lineTo(cx + dx * t, by - t * 0.5);
        g.stroke();
      }
      shape(g, '#3a3a44', () => g.arc(cx, by - t * 2.75, t * 0.18, 0, Math.PI * 2), 1.5);
      break;
    }
    case 'clowns': {
      // A circus tent over the roof.
      const by = R * 0.95;
      const n = 8;
      const x0 = t * 1.2;
      const x1 = W - t * 1.2;
      const peak = { x: cx, y: -t * 1.6 };
      for (let i = 0; i < n; i++) {
        const a = x0 + ((x1 - x0) / n) * i;
        const b = a + (x1 - x0) / n;
        shape(
          g,
          i % 2 ? '#ffffff' : '#e63946',
          () =>
            poly(g, [
              [peak.x, peak.y],
              [a, by],
              [b, by],
            ]),
          1.5,
        );
      }
      for (let i = 0; i < n; i++) {
        const a = x0 + ((x1 - x0) / n) * i;
        const b = a + (x1 - x0) / n;
        shape(
          g,
          i % 2 ? '#e63946' : '#ffffff',
          () => {
            g.moveTo(a, by);
            g.quadraticCurveTo((a + b) / 2, by + t * 0.35, b, by);
            g.closePath();
          },
          1.5,
        );
      }
      flag(g, peak.x, peak.y, t * 0.9, '#ffd23f');
      // Balloons.
      for (const [x, y, c] of [
        [0.6, 0.2, '#3a86ff'],
        [W / t - 0.6, 0.0, '#ffd23f'],
      ] as const) {
        ink(g, 1.2);
        g.beginPath();
        g.moveTo(x * t, y * t + t * 0.4);
        g.lineTo(x * t, R);
        g.stroke();
        shape(g, c, () => g.ellipse(x * t, y * t, t * 0.35, t * 0.42, 0, 0, Math.PI * 2), 1.5);
      }
      break;
    }
    case 'btc-maxis': {
      // A giant gold-orange coin standing on the roof.
      const y = R * 0.15;
      const r = t * 1.45;
      shape(g, '#c46f0f', () => g.ellipse(cx + t * 0.18, y, r * 0.92, r, 0, 0, Math.PI * 2), 2.5);
      shape(g, '#f7931a', () => g.ellipse(cx, y, r * 0.92, r, 0, 0, Math.PI * 2), 2.5);
      g.strokeStyle = '#ffc266';
      g.lineWidth = 2;
      g.beginPath();
      g.ellipse(cx, y, r * 0.75, r * 0.83, 0, 0, Math.PI * 2);
      g.stroke();
      // The B with its two strokes.
      text(g, 'B', cx, y + t * 0.05, r * 1.2, '#ffffff', font);
      g.fillStyle = '#ffffff';
      for (const dx of [-0.12, 0.12]) {
        g.fillRect(cx + dx * r - t * 0.05, y - r * 0.72, t * 0.1, r * 0.22);
        g.fillRect(cx + dx * r - t * 0.05, y + r * 0.5, t * 0.1, r * 0.22);
      }
      shape(g, '#5a3a1a', () => g.rect(cx - t * 0.9, R * 0.85, t * 1.8, t * 0.3), 1.5);
      break;
    }
    case 'mon-maxis': {
      // The Monad mark: a big purple rounded diamond with a hole.
      const y = R * 0.15;
      const s = t * 1.5;
      g.save();
      g.translate(cx, y);
      g.rotate(Math.PI / 4);
      shape(
        g,
        '#836ef9',
        () => {
          g.roundRect(-s, -s, s * 2, s * 2, s * 0.55);
          g.roundRect(-s * 0.45, -s * 0.45, s * 0.9, s * 0.9, s * 0.25);
        },
        2.5,
      );
      g.restore();
      // Fill rule: redraw the hole in the roof colour so it reads as a ring.
      g.save();
      g.translate(cx, y);
      g.rotate(Math.PI / 4);
      shape(g, f.roof, () => g.roundRect(-s * 0.45, -s * 0.45, s * 0.9, s * 0.9, s * 0.25), 2);
      g.restore();
      shape(g, '#2a2050', () => g.rect(cx - t * 0.25, R * 0.55, t * 0.5, R * 0.4), 1.5);
      break;
    }
    case 'crybabies': {
      // A rain cloud parked over the roof, crying on it.
      const y = -t * 0.6;
      g.strokeStyle = 'rgba(150,200,255,0.8)';
      g.lineWidth = t * 0.06;
      for (let i = 0; i < 9; i++) {
        const x = cx - t * 2 + i * t * 0.5;
        g.beginPath();
        g.moveTo(x, y + t * 0.7);
        g.lineTo(x - t * 0.15, y + t * (1.4 + (i % 3) * 0.5));
        g.stroke();
      }
      shape(g, '#9fb3c8', () => {
        g.arc(cx - t * 1.4, y + t * 0.2, t * 0.7, Math.PI * 0.5, Math.PI * 1.5);
        g.arc(cx - t * 0.5, y - t * 0.4, t * 0.9, Math.PI, Math.PI * 1.9);
        g.arc(cx + t * 0.7, y - t * 0.3, t * 0.8, Math.PI * 1.2, Math.PI * 2);
        g.arc(cx + t * 1.5, y + t * 0.25, t * 0.6, Math.PI * 1.5, Math.PI * 0.5);
        g.closePath();
      });
      // Sad face on the cloud.
      g.fillStyle = INK;
      for (const dx of [-0.45, 0.45]) {
        g.beginPath();
        g.arc(cx + dx * t, y - t * 0.1, t * 0.09, 0, Math.PI * 2);
        g.fill();
      }
      ink(g, 2);
      g.beginPath();
      g.arc(cx, y + t * 0.35, t * 0.28, Math.PI * 1.15, Math.PI * 1.85);
      g.stroke();
      shape(
        g,
        '#7cc6ff',
        () => {
          g.moveTo(cx + t * 0.62, y);
          g.quadraticCurveTo(cx + t * 0.45, y + t * 0.3, cx + t * 0.62, y + t * 0.36);
          g.quadraticCurveTo(cx + t * 0.79, y + t * 0.3, cx + t * 0.62, y);
        },
        1.2,
      );
      // A puddle on the roof.
      g.fillStyle = 'rgba(120,180,255,0.35)';
      g.beginPath();
      g.ellipse(cx, R * 0.75, t * 2.2, t * 0.35, 0, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'visor-gang': {
      // A giant neon visor sign.
      const y = R * 0.2;
      const w = t * 5.6;
      const h = t * 1.5;
      shape(g, '#2a2440', () => g.rect(cx - t * 0.2, y + h / 2, t * 0.4, R * 0.8), 1.5);
      const gr = g.createLinearGradient(0, y - h / 2, 0, y + h / 2);
      gr.addColorStop(0, '#ff4fd8');
      gr.addColorStop(0.5, '#ffb84f');
      gr.addColorStop(1, '#4fd8ff');
      shape(
        g,
        '#14111f',
        () => g.roundRect(cx - w / 2 - t * 0.15, y - h / 2 - t * 0.15, w + t * 0.3, h + t * 0.3, h * 0.55),
        2.5,
      );
      g.beginPath();
      g.roundRect(cx - w / 2, y - h / 2, w, h, h * 0.5);
      g.fillStyle = gr;
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.45)';
      g.lineWidth = 2;
      for (let i = 1; i < 4; i++) {
        g.beginPath();
        g.moveTo(cx - w / 2 + t * 0.4, y - h / 2 + (h / 4) * i);
        g.lineTo(cx + w / 2 - t * 0.4, y - h / 2 + (h / 4) * i);
        g.stroke();
      }
      g.fillStyle = 'rgba(255,255,255,0.6)';
      g.beginPath();
      g.ellipse(cx - w * 0.3, y - h * 0.2, t * 0.6, t * 0.16, -0.2, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'skulls': {
      // A giant skull on the roof, and candles.
      const y = R * 0.05;
      const r = t * 1.35;
      shape(
        g,
        '#ece5d0',
        () => {
          g.arc(cx, y, r, Math.PI * 0.85, Math.PI * 2.15);
          g.lineTo(cx + r * 0.55, y + r * 1.05);
          g.lineTo(cx - r * 0.55, y + r * 1.05);
          g.closePath();
        },
        2.5,
      );
      g.fillStyle = INK;
      for (const dx of [-0.42, 0.42]) {
        g.beginPath();
        g.ellipse(cx + dx * r, y + r * 0.1, r * 0.27, r * 0.32, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.beginPath();
      poly(g, [
        [cx, y + r * 0.45],
        [cx - r * 0.12, y + r * 0.68],
        [cx + r * 0.12, y + r * 0.68],
      ]);
      g.fill();
      ink(g, 1.5);
      for (let i = -2; i <= 2; i++) {
        g.beginPath();
        g.moveTo(cx + i * r * 0.18, y + r * 0.82);
        g.lineTo(cx + i * r * 0.18, y + r * 1.05);
        g.stroke();
      }
      for (const x of [t * 1.4, W - t * 1.4]) {
        shape(g, '#e9e2cc', () => g.rect(x - t * 0.14, R * 0.4, t * 0.28, t * 0.7), 1.5);
        shape(g, '#ffb340', () => g.ellipse(x, R * 0.32, t * 0.1, t * 0.18, 0, 0, Math.PI * 2), 1);
      }
      break;
    }
    case 'radioactive': {
      // A cooling tower with green steam, and the warning sign.
      const x = W - t * 2.6;
      g.fillStyle = 'rgba(157,255,59,0.35)';
      for (const [dx, dy, r] of [
        [0, -2.1, 0.7],
        [0.5, -2.7, 0.8],
        [-0.3, -3.1, 0.6],
      ] as const) {
        g.beginPath();
        g.arc(x + dx * t, dy * t + t * 0.6, r * t, 0, Math.PI * 2);
        g.fill();
      }
      shape(g, '#8d9384', () => {
        g.moveTo(x - t * 1.3, R * 0.95);
        g.quadraticCurveTo(x - t * 0.6, -t * 0.2, x - t * 0.85, -t * 1.3);
        g.lineTo(x + t * 0.85, -t * 1.3);
        g.quadraticCurveTo(x + t * 0.6, -t * 0.2, x + t * 1.3, R * 0.95);
        g.closePath();
      });
      shape(g, '#6b7163', () => g.ellipse(x, -t * 1.3, t * 0.85, t * 0.22, 0, 0, Math.PI * 2), 2);
      // The trefoil sign.
      const sx = t * 2.4;
      const sy = R * 0.45;
      shape(g, '#ffd23f', () => g.arc(sx, sy, t * 0.95, 0, Math.PI * 2), 2.5);
      g.fillStyle = INK;
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + (i * Math.PI * 2) / 3;
        g.beginPath();
        g.moveTo(sx, sy);
        g.arc(sx, sy, t * 0.8, a - 0.5, a + 0.5);
        g.closePath();
        g.fill();
      }
      g.fillStyle = '#ffd23f';
      g.beginPath();
      g.arc(sx, sy, t * 0.24, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = INK;
      g.beginPath();
      g.arc(sx, sy, t * 0.15, 0, Math.PI * 2);
      g.fill();
      // Glowing barrels.
      for (const bx of [4.6, 5.3]) {
        shape(g, '#3f6b1f', () => g.rect(bx * t - t * 0.28, R * 0.45, t * 0.56, t * 0.75), 1.5);
        g.fillStyle = '#9dff3b';
        g.fillRect(bx * t - t * 0.28, R * 0.45, t * 0.56, t * 0.12);
      }
      break;
    }
  }
  void color;
}

/**
 * The front yard in front of a gang's door, painted flat on the ground (you walk over it): W x H px with the
 * door at the top middle.
 */
export function paintYard(g: G, gang: GangId, W: number, H: number, t: number) {
  const cx = W / 2;
  const path = (fill: string, edge?: string) => {
    g.fillStyle = fill;
    g.fillRect(cx - t * 0.8, 0, t * 1.6, H);
    if (edge) {
      g.fillStyle = edge;
      g.fillRect(cx - t * 0.8, 0, t * 0.12, H);
      g.fillRect(cx + t * 0.68, 0, t * 0.12, H);
    }
  };
  const dots = (colors: string[], n: number, r: number, seed: number) => {
    for (let i = 0; i < n; i++) {
      const a = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
      const b = Math.sin(seed * 39.3467 + i * 11.135) * 24634.6345;
      const x = (a - Math.floor(a)) * W;
      const y = (b - Math.floor(b)) * H;
      g.fillStyle = colors[i % colors.length]!;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
  };
  switch (gang) {
    case 'mcga':
    case 'royals':
      path(gang === 'royals' ? '#9e1b32' : '#c92d39', '#e8b931');
      if (gang === 'mcga') for (let y = t * 0.5; y < H; y += t) star(g, cx, y, t * 0.18, '#ffffff');
      break;
    case 'gangstas': {
      const s = t * 0.4;
      for (let y = 0; y < H; y += s)
        for (let x = cx - t * 0.8; x < cx + t * 0.8; x += s) {
          g.fillStyle = (Math.round(x / s) + Math.round(y / s)) % 2 ? '#e9e2cc' : '#1a1622';
          g.fillRect(x, y, s, s);
        }
      break;
    }
    case 'robbers':
      // Muddy footprints leading out of the door.
      g.fillStyle = 'rgba(40,28,20,0.55)';
      for (let i = 0; i < 6; i++) {
        g.beginPath();
        g.ellipse(
          cx + (i % 2 ? t * 0.3 : -t * 0.3),
          t * 0.35 + i * t * 0.45,
          t * 0.12,
          t * 0.18,
          0,
          0,
          Math.PI * 2,
        );
        g.fill();
      }
      break;
    case 'suits':
      path('#c9cfdc', '#8fb7e8');
      g.strokeStyle = 'rgba(0,0,0,0.15)';
      for (let y = t * 0.8; y < H; y += t * 0.8) {
        g.beginPath();
        g.moveTo(cx - t * 0.8, y);
        g.lineTo(cx + t * 0.8, y);
        g.stroke();
      }
      break;
    case 'wizards': {
      // A glowing rune circle.
      const y = H * 0.55;
      g.strokeStyle = 'rgba(180,140,255,0.85)';
      g.lineWidth = t * 0.07;
      for (const r of [1.3, 1.0]) {
        g.beginPath();
        g.ellipse(cx, y, t * r * 1.4, t * r * 0.7, 0, 0, Math.PI * 2);
        g.stroke();
      }
      g.beginPath();
      for (let i = 0; i <= 5; i++) {
        const a = -Math.PI / 2 + ((i * 2) % 5) * ((Math.PI * 2) / 5);
        g.lineTo(cx + Math.cos(a) * t * 1.4, y + Math.sin(a) * t * 0.7);
      }
      g.stroke();
      break;
    }
    case 'squid-game': {
      // The chalk shapes from the playground game.
      g.strokeStyle = 'rgba(255,255,255,0.7)';
      g.lineWidth = t * 0.07;
      const y = H * 0.55;
      g.beginPath();
      g.arc(cx - t * 2.4, y, t * 0.5, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      poly(g, [
        [cx, y - t * 0.55],
        [cx + t * 0.55, y + t * 0.45],
        [cx - t * 0.55, y + t * 0.45],
      ]);
      g.stroke();
      g.strokeRect(cx + t * 1.9, y - t * 0.5, t, t);
      break;
    }
    case 'jailbirds':
      path('#2b2b30');
      g.fillStyle = '#ffd23f';
      for (let y = 0; y < H; y += t * 0.6) g.fillRect(cx - t * 0.06, y, t * 0.12, t * 0.35);
      break;
    case 'clowns':
      dots(['#e63946', '#ffd23f', '#3a86ff', '#2fd1b0', '#ff4fd8'], 70, t * 0.07, 3);
      break;
    case 'btc-maxis':
      path('#5a3a1a', '#f7931a');
      dots(['#f7931a'], 10, t * 0.12, 5);
      break;
    case 'mon-maxis':
      path('#4b3a9a', '#836ef9');
      break;
    case 'crybabies':
      g.fillStyle = 'rgba(120,180,255,0.35)';
      for (const [x, y, r] of [
        [0.3, 0.4, 0.9],
        [0.62, 0.75, 0.7],
        [0.45, 0.2, 0.5],
      ] as const) {
        g.beginPath();
        g.ellipse(W * x, H * y, t * r, t * r * 0.4, 0, 0, Math.PI * 2);
        g.fill();
      }
      break;
    case 'visor-gang':
      for (const [dx, c] of [
        [-0.7, '#ff4fd8'],
        [0.7, '#4fd8ff'],
      ] as const) {
        g.fillStyle = c;
        g.globalAlpha = 0.8;
        g.fillRect(cx + dx * t - t * 0.05, 0, t * 0.1, H);
        g.globalAlpha = 1;
      }
      break;
    case 'skulls':
      // Cracked flagstones and a scatter of bones.
      path('#3a363d');
      g.strokeStyle = 'rgba(0,0,0,0.4)';
      g.lineWidth = 1.5;
      for (let y = t * 0.6; y < H; y += t * 0.7) {
        g.beginPath();
        g.moveTo(cx - t * 0.8, y);
        g.lineTo(cx - t * 0.1, y + t * 0.1);
        g.lineTo(cx + t * 0.8, y - t * 0.05);
        g.stroke();
      }
      g.strokeStyle = '#d8d2c0';
      g.lineWidth = t * 0.08;
      for (const [x, y, a] of [
        [0.3, 0.5, 0.4],
        [0.72, 0.65, -0.6],
      ] as const) {
        g.beginPath();
        g.moveTo(W * x - Math.cos(a) * t * 0.3, H * y - Math.sin(a) * t * 0.3);
        g.lineTo(W * x + Math.cos(a) * t * 0.3, H * y + Math.sin(a) * t * 0.3);
        g.stroke();
      }
      break;
    case 'radioactive':
      g.fillStyle = 'rgba(157,255,59,0.4)';
      for (const [x, y, r] of [
        [0.32, 0.55, 0.8],
        [0.66, 0.35, 0.6],
      ] as const) {
        g.beginPath();
        g.ellipse(W * x, H * y, t * r, t * r * 0.45, 0, 0, Math.PI * 2);
        g.fill();
      }
      // Hazard stripes across the door step.
      for (let x = cx - t * 1.2; x < cx + t * 1.2; x += t * 0.4) {
        g.fillStyle = Math.round((x - cx) / (t * 0.4)) % 2 ? '#ffd23f' : '#1a1622';
        g.fillRect(x, 0, t * 0.4, t * 0.3);
      }
      break;
    case 'lazoor':
      g.strokeStyle = 'rgba(93,255,168,0.45)';
      g.lineWidth = 1.5;
      for (let x = t * 0.5; x < W; x += t) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, H);
        g.stroke();
      }
      for (let y = t * 0.5; y < H; y += t) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(W, y);
        g.stroke();
      }
      break;
  }
}

export interface TreeLook {
  kind: 'round' | 'dead' | 'cone' | 'balloon';
  trunk: string;
  leaves: [string, string, string];
}

const ROUND: TreeLook = { kind: 'round', trunk: '#4a3222', leaves: ['#1f5a3f', '#246548', '#2b7553'] };

/** The trees in a gang's yard match the gang. */
export function treeOf(gang: GangId | null): TreeLook {
  switch (gang) {
    case 'skulls':
      return { kind: 'dead', trunk: '#3a2e2a', leaves: ROUND.leaves };
    case 'royals':
    case 'suits':
      return { kind: 'cone', trunk: '#4a3222', leaves: ['#1d5a3a', '#23704a', '#2e8658'] };
    case 'clowns':
      return { kind: 'balloon', trunk: '#d8d2c0', leaves: ['#e63946', '#ffd23f', '#3a86ff'] };
    case 'wizards':
      return { kind: 'round', trunk: '#3a2a4a', leaves: ['#4b2f8f', '#5b3db0', '#7a57d6'] };
    case 'radioactive':
      return { kind: 'round', trunk: '#3a3a2a', leaves: ['#4f8f1f', '#6fbf2a', '#9dff3b'] };
    case 'mon-maxis':
      return { kind: 'round', trunk: '#3a2a4a', leaves: ['#5a3fc0', '#6f56e0', '#836ef9'] };
    case 'btc-maxis':
      return { kind: 'round', trunk: '#4a3222', leaves: ['#a8580f', '#d17414', '#f7931a'] };
    case 'squid-game':
      return { kind: 'cone', trunk: '#4a3222', leaves: ['#1f8f78', '#26b394', '#2fd1b0'] };
    case 'crybabies':
      return { kind: 'round', trunk: '#4a3a3a', leaves: ['#2f5f7f', '#3a7399', '#4a8ab3'] };
    default:
      return ROUND;
  }
}
