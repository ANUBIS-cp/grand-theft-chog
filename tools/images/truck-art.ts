// Prepares the winter cash truck's pictures: node tools/images/truck-art.ts
// Takes the magenta background off the Gemini pictures in art-in/season2/, trims them to the picture and
// writes apps/web/public/art/truck/{truck,bag}.webp (the truck seen from above, front pointing up; the
// money bag in the city's three-quarter view).
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { keyMagenta } from './key.ts';

const ROOT = new URL('../../', import.meta.url).pathname;
const OUT = join(ROOT, 'apps/web/public/art/truck');
mkdirSync(OUT, { recursive: true });

async function cut(file: string, name: string, size: { width?: number; height?: number }) {
  const { data, info } = await sharp(join(ROOT, 'art-in/season2', file))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  keyMagenta(data, info.width, info.height);
  const out = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .trim({ threshold: 1 })
    .resize({ ...size, fit: 'inside' })
    .webp({ quality: 88, alphaQuality: 95 })
    .toFile(join(OUT, `${name}.webp`));
  console.log(name, out.width, 'x', out.height);
}

await cut('truck-topdown.jpeg', 'truck', { height: 360 });
if (process.argv.includes('--bag')) await cut('truck-bag.jpeg', 'bag', { width: 160 });
