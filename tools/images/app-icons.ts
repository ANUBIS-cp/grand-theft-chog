// The installable app's icons (raid alerts on your phone): the Royals building on the night sky, the same
// picture as the site icon, made from the full-size art. Run: npx tsx tools/images/app-icons.ts
import { join } from 'node:path';
import sharp from 'sharp';

const ROOT = new URL('../../', import.meta.url).pathname;
const OUT = join(ROOT, 'apps/web/public/icons');
const ART = join(ROOT, 'apps/web/public/art/city/gang-royals.webp');
const SKY = '#1a1530';

async function icon(size: number, fill: number, name: string) {
  const art = await sharp(ART).resize({ width: Math.round(size * fill), height: Math.round(size * fill), fit: 'inside' }).toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: SKY } })
    .composite([{ input: art, gravity: 'center' }])
    .png()
    .toFile(join(OUT, name));
}
await icon(192, 0.9, 'icon-192.png');
// iPhones use this one for the home screen (Next serves it as apple-touch-icon).
await icon(180, 0.9, '../../src/app/apple-icon.png');
await icon(512, 0.9, 'icon-512.png');
// Android crops "maskable" icons to a circle or squircle: keep the building inside the middle 70%.
await icon(512, 0.66, 'icon-maskable-512.png');
// The small badge in Android's status bar: one colour, the building's shape.
const shape = await sharp(ART).resize({ width: 84, height: 84, fit: 'inside' }).ensureAlpha().extractChannel('alpha').toBuffer();
const white = await sharp({ create: { width: 84, height: 84, channels: 3, background: '#ffffff' } }).joinChannel(shape).png().toBuffer();
await sharp({ create: { width: 96, height: 96, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: white, gravity: 'center' }])
  .png()
  .toFile(join(OUT, 'badge-96.png'));
console.log('icons written');
