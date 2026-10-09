// Prepares drawn city art for the game. Put the pictures in art-in/ at the repo root, named as in
// docs/art-prompts.md (e.g. gang-royals.png, tree.png), then run:
//   node tools/images/art.ts
// For each picture it removes the flat magenta background (or keeps a real transparent one), trims the empty
// edges, shrinks it and writes apps/web/public/art/city/<name>.webp plus a manifest the game reads.
import { readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import sharp from 'sharp';

const ROOT = new URL('../../', import.meta.url).pathname;
const IN = join(ROOT, 'art-in');
const OUT = join(ROOT, 'apps/web/public/art/city');

const GANGS = [
  'mcga',
  'lazoor',
  'gangstas',
  'robbers',
  'suits',
  'royals',
  'wizards',
  'squid-game',
  'jailbirds',
  'clowns',
  'btc-maxis',
  'mon-maxis',
  'crybabies',
  'visor-gang',
  'skulls',
  'radioactive',
];
/** Longest side in px after preparing: buildings are drawn up to about 10 tiles wide. */
const SIZE: Record<string, number> = {
  ...Object.fromEntries(GANGS.map((g) => [`gang-${g}`, 1200])),
  jail: 1200,
  practice: 1200,
  fountain: 640,
  tree: 384,
  lamp: 384,
  bench: 320,
  hydrant: 192,
  stall: 448,
  'car-0': 512,
  'car-1': 512,
  'car-2': 512,
  'car-3': 512,
};

/**
 * Turns the flat magenta background transparent. Pictures come back as JPEGs with a slightly uneven magenta
 * (some dusky, some a gradient), and a few subjects are pink themselves, so instead of keying one colour
 * everywhere it grows the background in from the edges, stops at the dark outline, then softens the edge
 * and takes the magenta tint out of it. Magenta gaps the subject closes in (between bench slats, under a
 * canopy) go too.
 */
function keyMagenta(data: Buffer, w: number, h: number) {
  const n = w * h;
  const at = (i: number) => [data[i * 4]!, data[i * 4 + 1]!, data[i * 4 + 2]!] as const;
  // The background colour: the middle value of the border pixels.
  const border: number[][] = [];
  for (let x = 0; x < w; x += 3) border.push([...at(x)], [...at((h - 1) * w + x)]);
  for (let y = 0; y < h; y += 3) border.push([...at(y * w)], [...at(y * w + w - 1)]);
  const mid = (c: number) => border.map((b) => b[c]!).sort((a, b) => a - b)[border.length >> 1]!;
  const bg = [mid(0), mid(1), mid(2)] as const;
  const dist = (i: number, c: readonly number[]) => {
    const [r, g, b] = at(i);
    return Math.hypot(r - c[0]!, g - c[1]!, b - c[2]!);
  };
  const magenta = (i: number) => {
    const [r, g, b] = at(i);
    return Math.min(r, b) - g;
  };
  const mBg = Math.max(40, Math.min(bg[0], bg[2]) - bg[1]);
  const isBg = new Uint8Array(n);
  // Grow in from the edges: each step may change only a little, and never stray far from the background.
  const stack: number[] = [];
  const seed = (i: number) => {
    if (!isBg[i] && dist(i, bg) < 90) {
      isBg[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    seed(x);
    seed((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    seed(y * w);
    seed(y * w + w - 1);
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    const here = at(i);
    for (const j of [i - 1, i + 1, i - w, i + w]) {
      if (j < 0 || j >= n || isBg[j] || (j === i - 1 && x === 0) || (j === i + 1 && x === w - 1)) continue;
      if (dist(j, here) < 22 && dist(j, bg) < 90) {
        isBg[j] = 1;
        stack.push(j);
      }
    }
  }
  // Closed-in gaps: patches that are plainly the background colour.
  const seen = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (isBg[i] || seen[i] || dist(i, bg) > 45 || magenta(i) < mBg * 0.75) continue;
    const patch = [i];
    seen[i] = 1;
    for (let k = 0; k < patch.length; k++) {
      const p = patch[k]!;
      const x = p % w;
      for (const j of [p - 1, p + 1, p - w, p + w]) {
        if (j < 0 || j >= n || seen[j] || isBg[j] || (j === p - 1 && x === 0) || (j === p + 1 && x === w - 1))
          continue;
        if (dist(j, bg) <= 45 && magenta(j) >= mBg * 0.75) {
          seen[j] = 1;
          patch.push(j);
        }
      }
    }
    if (patch.length >= 40) for (const p of patch) isBg[p] = 1;
  }
  // How far each pixel is from the background, up to 3.
  const near = new Uint8Array(n).fill(9);
  for (let i = 0; i < n; i++) if (isBg[i]) near[i] = 0;
  for (let d = 1; d <= 3; d++)
    for (let i = 0; i < n; i++) {
      if (near[i]! <= d) continue;
      const x = i % w;
      if (
        (x > 0 && near[i - 1] === d - 1) ||
        (x < w - 1 && near[i + 1] === d - 1) ||
        (i >= w && near[i - w] === d - 1) ||
        (i < n - w && near[i + w] === d - 1)
      )
        near[i] = d;
    }
  for (let i = 0; i < n; i++) {
    if (isBg[i]) {
      data[i * 4 + 3] = 0;
      continue;
    }
    if (near[i]! > 3) continue;
    // An edge pixel is part subject, part magenta: guess how much from its magenta tint, then unmix it.
    const a = Math.max(0, Math.min(1, 1 - magenta(i) / mBg));
    if (a < 0.08) {
      data[i * 4 + 3] = 0;
      continue;
    }
    for (let c = 0; c < 3; c++) {
      const v = (data[i * 4 + c]! - (1 - a) * bg[c]!) / a;
      data[i * 4 + c] = Math.max(0, Math.min(255, Math.round(v)));
    }
    data[i * 4 + 3] = Math.round(255 * a);
  }
}

mkdirSync(OUT, { recursive: true });
const names: string[] = [];
let files: string[] = [];
try {
  files = readdirSync(IN).filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
} catch {
  console.log(`No ${IN} folder yet: make it and put the pictures in.`);
}
for (const f of files) {
  const name = basename(f, extname(f)).toLowerCase();
  const size = SIZE[name];
  if (!size) {
    console.log(`skip ${f}: not a name the game knows (see docs/art-prompts.md)`);
    continue;
  }
  const img = sharp(join(IN, f)).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  // A picture that already has see-through pixels keeps its own background.
  let hasAlpha = false;
  for (let i = 3; i < data.length; i += 4 * 97) if (data[i]! < 250) hasAlpha = true;
  if (!hasAlpha) keyMagenta(data, info.width, info.height);
  const keyed = sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } });
  const trimmed = await keyed.png().toBuffer();
  await sharp(trimmed)
    .trim({ threshold: 1 })
    .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 88, alphaQuality: 100, effort: 5 })
    .toFile(join(OUT, `${name}.webp`));
  const meta = await sharp(join(OUT, `${name}.webp`)).metadata();
  console.log(`${name}: ${meta.width}x${meta.height}${hasAlpha ? '' : ' (magenta removed)'}`);
  names.push(name);
}
const have = readdirSync(OUT)
  .filter((f) => f.endsWith('.webp'))
  .map((f) => f.slice(0, -5))
  .filter((n) => SIZE[n]);
writeFileSync(
  join(OUT, 'manifest.json'),
  JSON.stringify({ names: [...new Set([...have, ...names])].sort(), v: Date.now().toString(36) }, null, 2) +
    '\n',
);
console.log(`manifest: ${have.length} pictures`);
