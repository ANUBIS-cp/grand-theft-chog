// Prepares the Fight Night ring picture: node tools/images/fight-art.ts [art-in/season2/ring.jpeg]
// Finds the canvas floor's corners, takes the magenta background off, and straightens the picture: image
// generators draw the ring with a little perspective (the back edge narrower than the front), and the game
// draws the ring straight on, like the city. Each row is stretched so the canvas becomes a true rectangle;
// rows above and below it keep the nearest row's stretch, so the front of the platform stays upright.
// Writes apps/web/public/art/fight/ring.webp and prints where the canvas is in it (for fight-render.ts).
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { keyMagenta } from './key.ts';

const ROOT = new URL('../../', import.meta.url).pathname;
const IN = join(ROOT, process.argv[2] ?? 'art-in/season2/ring.jpeg');
const OUT = join(ROOT, 'apps/web/public/art/fight');

const { data, info } = await sharp(IN).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const H = info.height;
// The canvas: light and nearly grey, unlike the purple apron, the wood and the magenta.
const isCanvas = (x: number, y: number) => {
  const i = (y * W + x) * 4;
  const [r, g, b] = [data[i]!, data[i + 1]!, data[i + 2]!];
  return r > 185 && g > 180 && b > 160 && Math.max(r, g, b) - Math.min(r, g, b) < 45;
};
const rows: { y: number; a: number; z: number }[] = [];
for (let y = 0; y < H; y++) {
  let a = -1;
  let z = -1;
  for (let x = 0; x < W; x++)
    if (isCanvas(x, y)) {
      if (a < 0) a = x;
      z = x;
    }
  if (a >= 0 && z - a > W * 0.4) rows.push({ y, a, z });
}
if (rows.length < 20) throw new Error('could not find the canvas floor');
// Straight lines through the left and right edges (skipping the rounded corners), extended to the top and bottom.
const inner = rows.slice(Math.floor(rows.length * 0.1), Math.ceil(rows.length * 0.9));
const fit = (k: 'a' | 'z') => {
  const n = inner.length;
  const my = inner.reduce((s, r) => s + r.y, 0) / n;
  const mx = inner.reduce((s, r) => s + r[k], 0) / n;
  const slope = inner.reduce((s, r) => s + (r.y - my) * (r[k] - mx), 0) / inner.reduce((s, r) => s + (r.y - my) ** 2, 0);
  return (y: number) => mx + slope * (y - my);
};
const left = fit('a');
const right = fit('z');
const y0 = rows[0]!.y;
const y1 = rows[rows.length - 1]!.y;
// The canvas keeps its front edge's width; every row above is widened to match.
const X0 = left(y1);
const X1 = right(y1);

keyMagenta(data, W, H);
const out = Buffer.alloc(W * H * 4);
for (let y = 0; y < H; y++) {
  const yy = Math.max(y0, Math.min(y1, y));
  const l = left(yy);
  const scale = (X1 - X0) / (right(yy) - l);
  for (let x = 0; x < W; x++) {
    // Where this pixel comes from in the original row, with a blend of its two neighbours.
    const sx = l + (x - X0) / scale;
    const s0 = Math.floor(sx);
    const t = sx - s0;
    for (let c = 0; c < 4; c++) {
      const p = (s: number) => (s >= 0 && s < W ? data[(y * W + s) * 4 + c]! : 0);
      out[(y * W + x) * 4 + c] = Math.round(p(s0) * (1 - t) + p(s0 + 1) * t);
    }
  }
}
mkdirSync(OUT, { recursive: true });
await sharp(out, { raw: { width: W, height: H, channels: 4 } })
  .webp({ quality: 88, alphaQuality: 100, effort: 5 })
  .toFile(join(OUT, 'ring.webp'));
console.log(
  JSON.stringify({ w: W, h: H, floor: { x0: +X0.toFixed(1), x1: +X1.toFixed(1), y0, y1 } }),
);
