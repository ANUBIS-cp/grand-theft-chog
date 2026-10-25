// Prepares the Halloween art (docs/art-halloween.md) for the game. Put the pictures in art-in/halloween/, then:
//   node tools/images/halloween.ts
// It also prepares the vault's own drawn pieces in art-in/vault/ (the gold glove) into public/art/vault/.
// Textures (floors, walls) are sized and toned down a little so game pieces stand out on them; things (on
// magenta) get their background cut off, are trimmed and sized. Output: apps/web/public/art/halloween/*.webp.
import { mkdirSync, readdirSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import sharp from 'sharp';
import { keyMagenta } from './key.ts';

const ROOT = new URL('../../', import.meta.url).pathname;
const SETS = [
  { IN: join(ROOT, 'art-in/halloween'), OUT: join(ROOT, 'apps/web/public/art/halloween') },
  { IN: join(ROOT, 'art-in/vault'), OUT: join(ROOT, 'apps/web/public/art/vault') },
];

/** Textures: the size each repeat is stored at, and how much darker / greyer it's made. */
const TEXTURES: Record<string, { w: number; h: number; brightness: number; saturation: number }> = {
  'h-floor-stone': { w: 512, h: 512, brightness: 0.5, saturation: 0.55 },
  'h-floor-wood': { w: 512, h: 512, brightness: 0.78, saturation: 0.85 },
  'h-wall-top': { w: 512, h: 344, brightness: 1.12, saturation: 0.8 },
  'h-wall-front': { w: 512, h: 512, brightness: 0.9, saturation: 0.9 },
};
/** Things: the longest side after trimming. */
const THINGS: Record<string, number> = {
  'h-coffin': 384,
  'h-pillar': 320,
  'h-tomb': 256,
  'h-cobweb': 256,
  'h-candles': 256,
  phantom: 448,
  'blood-moon': 768,
  'pumpkin-cash': 384,
  'pumpkin-gold': 384,
  'power-glove': 256,
};

for (const { IN, OUT } of SETS) {
  mkdirSync(OUT, { recursive: true });
  let files: string[] = [];
  try {
    files = readdirSync(IN).filter((x) => /\.(png|jpe?g|webp)$/i.test(x));
  } catch {
    continue;
  }
  for (const f of files) {
    const name = basename(f, extname(f)).toLowerCase();
    const tex = TEXTURES[name];
    if (tex) {
      await sharp(join(IN, f))
        .resize(tex.w, tex.h, { fit: 'cover' })
        .modulate({ brightness: tex.brightness, saturation: tex.saturation })
        .webp({ quality: 86, effort: 5 })
        .toFile(join(OUT, `${name}.webp`));
      console.log(`${name}: texture ${tex.w}x${tex.h}`);
      continue;
    }
    const size = THINGS[name];
    if (!size) {
      console.log(`skip ${f}`);
      continue;
    }
    const { data, info } = await sharp(join(IN, f)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    keyMagenta(data, info.width, info.height);
    // Any strongly magenta pixel left (a corner the outline closed off) goes too: no subject here is pink.
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;
      if (Math.min(r, b) - g > 90 && r > 150 && b > 90) data[i + 3] = 0;
    }
    const png = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
      .png()
      .toBuffer();
    await sharp(png)
      .trim({ threshold: 1 })
      .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 88, alphaQuality: 100, effort: 5 })
      .toFile(join(OUT, `${name}.webp`));
    const meta = await sharp(join(OUT, `${name}.webp`)).metadata();
    console.log(`${name}: ${meta.width}x${meta.height}`);
  }
}
