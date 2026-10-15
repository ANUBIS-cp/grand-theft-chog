// Prepares drawn city art for the game. Put the pictures in art-in/ at the repo root, named as in
// docs/art-prompts.md (e.g. gang-royals.png, tree.png), then run:
//   node tools/images/art.ts
// For each picture it removes the flat magenta background (or keeps a real transparent one), trims the empty
// edges, shrinks it and writes apps/web/public/art/city/<name>.webp plus a manifest the game reads.
import { readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import sharp from 'sharp';
import { keyMagenta } from './key.ts';

const ROOT = new URL('../../', import.meta.url).pathname;
// An optional folder argument processes just those pictures (so straightened ones in art-in aren't redone).
const IN = process.argv[2] ? join(process.cwd(), process.argv[2]) : join(ROOT, 'art-in');
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
  'caps',
  'durags',
  'naked',
  'legends',
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
  const png = await keyed.png().toBuffer();
  // A see-through picture keeps its framing (straighten.ts pads one side so the door is in the middle).
  await (hasAlpha ? sharp(png) : sharp(png).trim({ threshold: 1 }))
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
