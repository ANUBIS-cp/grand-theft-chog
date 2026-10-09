// Straightens a building picture that came back drawn from a corner, so it sits square on the city's
// straight street grid: it finds the front wall's bottom edge, shears the picture so that edge is level
// (upright lines stay upright), and moves the door to the middle. Writes a see-through PNG into art-in/,
// ready for tools/images/art.ts.
//   node tools/images/straighten.ts <picture> <name> [doorX 0..1 in the original] [slope]
// Without a slope it measures one, and prints what it found so it can be checked or given by hand.
import { join } from 'node:path';
import sharp from 'sharp';
import { keyMagenta } from './key.ts';

const ROOT = new URL('../../', import.meta.url).pathname;
const [file, name, doorArg, slopeArg] = process.argv.slice(2);
if (!file || !name) throw new Error('usage: straighten.ts <picture> <name> [doorX] [slope]');

const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: w, height: h } = info;
keyMagenta(data, w, h);

// The lowest solid pixel in each column: the building's base line.
const base = new Float64Array(w).fill(-1);
for (let x = 0; x < w; x++)
  for (let y = h - 1; y >= 0; y--)
    if (data[(y * w + x) * 4 + 3]! > 200) {
      base[x] = y;
      break;
    }

/** The longest stretch of columns whose base runs along one straight line of this slope. */
function run(slope: number) {
  let best = { len: 0, from: 0 };
  let from = -1;
  let ref = 0;
  for (let x = 0; x < w; x++) {
    const r = base[x]! - slope * x;
    if (base[x]! >= 0 && from >= 0 && Math.abs(r - ref) <= 3) {
      ref = ref * 0.9 + r * 0.1;
      if (x - from > best.len) best = { len: x - from, from };
    } else {
      from = base[x]! >= 0 ? x : -1;
      ref = r;
    }
  }
  return best;
}

let slope = slopeArg === undefined || slopeArg.includes('-') ? NaN : Number(slopeArg);
if (slopeArg?.includes('-')) {
  // Column ranges (in px) where the base is the front wall itself, say "400-900,1000-1250": fit a line
  // to them, dropping columns that stray (a crate, a post), then fit again.
  let pts: [number, number][] = [];
  for (const r of slopeArg.split(',')) {
    const [a, b] = r.split('-').map(Number);
    for (let x = a!; x <= b!; x++) if (base[x]! >= 0) pts.push([x, base[x]!]);
  }
  const fit = () => {
    const n = pts.length;
    const mx = pts.reduce((t, p) => t + p[0], 0) / n;
    const my = pts.reduce((t, p) => t + p[1], 0) / n;
    const k =
      pts.reduce((t, p) => t + (p[0] - mx) * (p[1] - my), 0) / pts.reduce((t, p) => t + (p[0] - mx) ** 2, 0);
    return { k, c: my - k * mx };
  };
  for (let round = 0; round < 3; round++) {
    const { k, c } = fit();
    pts = pts.filter(([x, y]) => Math.abs(y - (k * x + c)) < 8);
  }
  slope = fit().k;
  console.log(`${name}: fitted slope ${slope.toFixed(4)} on ${pts.length} columns`);
} else if (Number.isNaN(slope)) {
  let best = { slope: 0, len: 0, from: 0 };
  for (let s = -0.35; s <= 0.35; s += 0.0025) {
    const r = run(s);
    if (r.len > best.len) best = { slope: s, ...r };
  }
  slope = best.slope;
  console.log(
    `${name}: front wall base runs ${((best.len / w) * 100).toFixed(0)}% of the width from x=${(best.from / w).toFixed(2)}, slope ${slope.toFixed(4)}`,
  );
}

// Shear: y' = y - slope * (x - w/2), so the front wall's base comes out level and nothing upright tilts.
const lift = Math.ceil((Math.abs(slope) * w) / 2);
const H = h + lift * 2;
const out = Buffer.alloc(w * H * 4);
for (let x = 0; x < w; x++) {
  const dy = -slope * (x - w / 2) + lift;
  for (let y = 0; y < H; y++) {
    // Sample the original at y - dy, blending the two nearest rows.
    const sy = y - dy;
    const y0 = Math.floor(sy);
    const f = sy - y0;
    for (let c = 0; c < 4; c++) {
      const a = y0 >= 0 && y0 < h ? data[(y0 * w + x) * 4 + c]! : 0;
      const b = y0 + 1 >= 0 && y0 + 1 < h ? data[((y0 + 1) * w + x) * 4 + c]! : 0;
      out[(y * w + x) * 4 + c] = Math.round(a * (1 - f) + b * f);
    }
  }
}

// Door to the middle: pad the side that's short, so the picture's centre is the door.
let img = sharp(out, { raw: { width: w, height: H, channels: 4 } }).png();
let trimmed = await sharp(await img.toBuffer())
  .trim({ threshold: 1 })
  .toBuffer({ resolveWithObject: true });
if (doorArg !== undefined) {
  const door = Number(doorArg) * w + (trimmed.info.trimOffsetLeft ?? 0);
  const left = door;
  const right = trimmed.info.width - door;
  const pad = Math.round(Math.abs(left - right));
  img = sharp(trimmed.data).extend({
    left: left < right ? pad : 0,
    right: left < right ? 0 : pad,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  });
  trimmed = await img.png().toBuffer({ resolveWithObject: true });
}
await sharp(trimmed.data)
  .png()
  .toFile(join(ROOT, 'art-in', `${name}.png`));
console.log(`${name}: wrote art-in/${name}.png ${trimmed.info.width}x${trimmed.info.height}`);
