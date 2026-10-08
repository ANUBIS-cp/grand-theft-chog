// Fetches every Chog image from IPFS once, checks it, and writes resized copies keyed by TOKEN ID:
//   <out>/orig/<id>.webp and <out>/<size>/<id>.webp for size in 96, 256, 640.
// WebP only: AVIF took ~10x the CPU on the e2-medium for a small size gain.
// Usage: node build.ts <chogs.json> <out-dir>   (re-runnable: skips finished tokens)
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const [chogsPath, out] = process.argv.slice(2);
if (!chogsPath || !out) throw new Error('usage: build.ts <chogs.json> <out-dir>');
const data = JSON.parse(readFileSync(chogsPath, 'utf8')) as {
  imageBase: string;
  chogs: { id: number; metadataId: number }[];
};
const cid = data.imageBase.replace('ipfs://', '');
// Checked from the server on 8 Oct: Filebase is fast; Pinata works but is slow; ipfs.io and dweb.link return 429.
const PRIMARY = 'https://ipfs.filebase.io/ipfs/';
const SECOND = 'https://gateway.pinata.cloud/ipfs/';
const SIZES = [96, 256, 640];
for (const d of ['orig', ...SIZES.map(String)]) mkdirSync(join(out, d), { recursive: true });

async function fetchFrom(gateway: string, metadataId: number): Promise<Buffer> {
  const res = await fetch(`${gateway}${cid}${metadataId}.webp`, { signal: AbortSignal.timeout(40_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function fetchImage(metadataId: number): Promise<Buffer> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const gw = attempt % 4 === 3 ? SECOND : PRIMARY;
    try {
      const buf = await fetchFrom(gw, metadataId);
      const meta = await sharp(buf).metadata();
      if (meta.format !== 'webp' || meta.width !== 1000 || meta.height !== 1000)
        throw new Error('not a 1000x1000 webp');
      return buf;
    } catch {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  throw new Error(`could not fetch metadata image ${metadataId}`);
}

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const manifest: Record<number, string> = existsSync(join(out, 'manifest.json'))
  ? JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'))
  : {};

const queue = data.chogs.filter((c) => !manifest[c.id]);
console.log(`${queue.length} to do, ${data.chogs.length - queue.length} already done`);
let done = 0;
async function worker() {
  for (let c = queue.shift(); c; c = queue.shift()) {
    const buf = await fetchImage(c.metadataId);
    writeFileSync(join(out, 'orig', `${c.id}.webp`), buf);
    for (const s of SIZES) {
      const img = sharp(buf).resize(s, s, { kernel: 'lanczos3' });
      writeFileSync(join(out, String(s), `${c.id}.webp`), await img.webp({ quality: 82 }).toBuffer());
    }
    manifest[c.id] = sha(buf);
    if (++done % 100 === 0) {
      writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest));
      console.log(`${done} done`);
    }
  }
}
await Promise.all(Array.from({ length: 3 }, worker));
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest));

// Cross-check a sample against a second gateway: the bytes must be identical.
const sample = data.chogs.filter((_, i) => i % 50 === 0);
let agree = 0;
for (const c of sample) {
  try {
    const other = await fetchFrom(SECOND, c.metadataId);
    if (sha(other) === manifest[c.id]) agree++;
    else console.log(`DIFFERENT bytes for token ${c.id}`);
  } catch {
    console.log(`second gateway failed for token ${c.id}`);
  }
}
console.log(
  `images: ${Object.keys(manifest).length}; second-gateway check ${agree}/${sample.length} identical`,
);
