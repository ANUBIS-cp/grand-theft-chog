// Straightens a building picture that came back drawn from a corner, so it sits square on the city's
// straight street grid: it finds the front wall's bottom edge, shears the picture so that edge is level
// (upright lines stay upright), and moves the door to the middle. Writes a see-through PNG into art-in/,
// ready for tools/images/art.ts.
//   node tools/images/straighten.ts <picture> <name> [doorX 0..1 in the original] [slope] [left|right] ["L:x0-x1:y0-y1;B:..."]
// Without a slope it measures one, and prints what it found so it can be checked or given by hand.
import { join } from 'node:path';
import sharp from 'sharp';
import { keyMagenta } from './key.ts';

const ROOT = new URL('../../', import.meta.url).pathname;
const [file, name, doorArg, slopeArg, keepArg, markArg] = process.argv.slice(2);
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

// Saved for measuring the next step: the sheared picture at full size.
await sharp(out, { raw: { width: w, height: H, channels: 4 } })
  .png()
  .toFile(join(ROOT, 'art-redo', `sheared-${name}.png`));

// Seen dead-on: keep the half of the front that has no side wall showing and mirror it about the door,
// then lay the rooftop landmark back over it unmirrored, so its letters and shape stay right.
let W2 = w;
let face = out;
if (keepArg === 'left' || keepArg === 'right') {
  const axis = Math.round(Number(doorArg) * w);
  const half = keepArg === 'right' ? w - axis : axis;
  W2 = half * 2;
  face = Buffer.alloc(W2 * H * 4);
  // Parts kept as drawn (not mirrored): "L:x0-x1:y0-y1" is a landmark, lifted out along its outline so
  // the roof around it stays mirrored; "B:x0-x1:y0-y1" is a plain box, for a door that isn't symmetric.
  // For each spot, which column of the sheared picture it's taken from as drawn (-1: mirror it).
  const own = new Int32Array(w * H).fill(-1);
  // Where a landmark stood: painted over with roof before mirroring, so it never shows twice.
  const gone = new Uint8Array(w * H);
  for (const part of (markArg ?? '').split(';').filter(Boolean)) {
    const [kind, xs, ys] = part.split(':');
    const [x0, x1] = xs!.split('-').map(Number) as [number, number];
    const [y0, y1] = ys!.split('-').map(Number) as [number, number];
    if (kind === 'BC') {
      // A box standing clear of the roof (a tower against the sky), moved whole to sit over the door.
      const shift = Math.round(axis - (x0 + x1) / 2);
      for (let y = y0; y <= Math.min(y1, H - 1); y++)
        for (let x = x0; x <= x1; x++) {
          if (!out[(y * w + x) * 4 + 3]) continue;
          gone[y * w + x] = 1;
          if (x + shift >= 0 && x + shift < w) own[y * w + x + shift] = x;
        }
      continue;
    }
    if (kind === 'B' || kind === 'X') {
      // "X" clears a box (a carpet that would come out in a V once mirrored).
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) own[y * w + x] = kind === 'B' ? x : -2;
      continue;
    }
    // Grow the roof in from the box's edges, stopping at dark outlines; whatever it can't reach is the landmark.
    const roof = new Uint8Array(w * H);
    const px = (i: number) => [out[i * 4]!, out[i * 4 + 1]!, out[i * 4 + 2]!, out[i * 4 + 3]!] as const;
    const dark = (i: number) => {
      const [r, g, b, al] = px(i);
      return al > 0 && r + g + b < 200;
    };
    const stack: number[] = [];
    const seed = (i: number) => {
      if (!roof[i] && !dark(i)) {
        roof[i] = 1;
        stack.push(i);
      }
    };
    for (let x = x0; x <= x1; x++) {
      seed(y0 * w + x);
      seed(y1 * w + x);
    }
    for (let y = y0; y <= y1; y++) {
      seed(y * w + x0);
      seed(y * w + x1);
    }
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w;
      const y = Math.floor(i / w);
      const here = px(i);
      for (const [nx, ny] of [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ] as const) {
        if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue;
        const j = ny * w + nx;
        if (roof[j] || dark(j)) continue;
        const c = px(j);
        if (Math.hypot(c[0] - here[0], c[1] - here[1], c[2] - here[2]) + Math.abs(c[3] - here[3]) < 40) {
          roof[j] = 1;
          stack.push(j);
        }
      }
    }
    // The landmark is the biggest piece left; stray bits of outline at the box's edge are roof.
    const piece = new Int32Array(w * H).fill(-1);
    let best = -1;
    let bestSize = 0;
    const sizes: number[] = [];
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = y * w + x;
        if (roof[i] || piece[i] >= 0 || !out[i * 4 + 3]) continue;
        const id = sizes.length;
        const todo = [i];
        piece[i] = id;
        for (let k = 0; k < todo.length; k++) {
          const p = todo[k]!;
          const px0 = p % w;
          const py0 = Math.floor(p / w);
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const nx = px0 + dx;
              const ny = py0 + dy;
              if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue;
              const j = ny * w + nx;
              if (roof[j] || piece[j] >= 0 || !out[j * 4 + 3]) continue;
              piece[j] = id;
              todo.push(j);
            }
        }
        sizes.push(todo.length);
        if (todo.length > bestSize) {
          bestSize = todo.length;
          best = id;
        }
      }
    // Thin lines touching it (bits of the roof's outline) aren't the landmark: open the mask (shrink, then
    // grow back) so only solid parts survive.
    const R = 6;
    const inBox = (x: number, y: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
    const isP = (x: number, y: number) => inBox(x, y) && piece[y * w + x] === best;
    const core = new Uint8Array(w * H);
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        let all = isP(x, y);
        for (let d = 1; all && d <= R; d++)
          all = isP(x - d, y) && isP(x + d, y) && isP(x, y - d) && isP(x, y + d);
        if (all) core[y * w + x] = 1;
      }
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        if (!isP(x, y)) continue;
        let near = false;
        for (let dy = -R; !near && dy <= R; dy++)
          for (let dx = -R; !near && dx <= R; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (inBox(nx, ny) && core[ny * w + nx]) near = true;
          }
        if (!near) piece[y * w + x] = -1;
      }
    // "LC" moves the landmark to sit over the door.
    let lo = w;
    let hi = 0;
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++)
        if (piece[y * w + x] === best) {
          lo = Math.min(lo, x);
          hi = Math.max(hi, x);
        }
    const shift = kind === 'LC' ? Math.round(axis - (lo + hi) / 2) : 0;
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++)
        if (piece[y * w + x] === best) {
          for (let d = -3; d <= 3; d++) if (x + d >= 0 && x + d < w) gone[y * w + x + d] = 1;
          if (x + shift >= 0 && x + shift < w) own[y * w + x + shift] = x;
        }
  }
  // Paint the roof back under each landmark, row by row, blending what's either side of it.
  const clean = Buffer.from(out);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < w; x++) {
      if (!gone[y * w + x]) continue;
      let e = x;
      while (e < w && gone[y * w + e]) e++;
      const l = x - 1;
      const r = e;
      for (let k = x; k < e; k++) {
        const t = (k - l) / (r - l);
        // Blend only between two solid sides; a row that runs out into the sky is left clear (no smeared lines).
        const li = l >= 0 ? l : r;
        const ri = r < w ? r : li;
        const solid = out[(y * w + li) * 4 + 3]! > 200 && out[(y * w + ri) * 4 + 3]! > 200;
        for (let c = 0; c < 4; c++) {
          const a = li >= 0 && li < w ? out[(y * w + li) * 4 + c]! : 0;
          const b = ri >= 0 && ri < w ? out[(y * w + ri) * 4 + c]! : 0;
          clean[(y * w + k) * 4 + c] = solid ? Math.round(a * (1 - t) + b * t) : 0;
        }
      }
      x = e;
    }
  for (let x = 0; x < W2; x++) {
    const at = axis - half + x;
    const mirrored = keepArg === 'right' ? (at < axis ? 2 * axis - at : at) : at > axis ? 2 * axis - at : at;
    for (let y = 0; y < H; y++) {
      const mine = at >= 0 && at < w ? own[y * w + at]! : -1;
      if (mine === -2) continue;
      if (mine >= 0) out.copy(face, (y * W2 + x) * 4, (y * w + mine) * 4, (y * w + mine) * 4 + 4);
      else clean.copy(face, (y * W2 + x) * 4, (y * w + mirrored) * 4, (y * w + mirrored) * 4 + 4);
    }
  }
}

// Door to the middle: pad the side that's short, so the picture's centre is the door.
let img = sharp(face, { raw: { width: W2, height: H, channels: 4 } }).png();
let trimmed = await sharp(await img.toBuffer())
  .trim({ threshold: 1 })
  .toBuffer({ resolveWithObject: true });
if (doorArg !== undefined && W2 === w) {
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
