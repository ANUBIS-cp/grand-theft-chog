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

async function fetchFrom(gateway: string, metadataId: number, signal?: AbortSignal): Promise<Buffer> {
  const res = await fetch(`${gateway}${cid}${metadataId}.webp`, {
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(90_000)]) : AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const meta = await sharp(buf).metadata();
  if (meta.format !== 'webp' || meta.width !== 1000 || meta.height !== 1000)
    throw new Error('not a 1000x1000 webp');
  return buf;
}

// Filebase is fast for files it has cached and returns 504 or takes 30-40 s for the rest. Pinata works but
// rate-limits when hit hard. So: ask Filebase first, and only ask Pinata if Filebase fails or is slow (8 s).
async function fetchImage(metadataId: number): Promise<Buffer> {
  const ctl = new AbortController();
  const primary = fetchFrom(PRIMARY, metadataId, ctl.signal);
  const hedge = new Promise<Buffer>((resolve, reject) => {
    const start = () => fetchFrom(SECOND, metadataId, ctl.signal).then(resolve, reject);
    const timer = setTimeout(start, 8000);
    primary.catch(() => {
      clearTimeout(timer);
      start();
    });
  });
  try {
    return await Promise.any([primary, hedge]);
  } finally {
    ctl.abort();
  }
}

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const manifest: Record<number, string> = existsSync(join(out, 'manifest.json'))
  ? JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'))
  : {};

const queue = data.chogs.filter((c) => !manifest[c.id]);
console.log(`${queue.length} to do, ${data.chogs.length - queue.length} already done`);
let done = 0;
const tries = new Map<number, number>();
const failed: number[] = [];
async function worker() {
  for (let c = queue.shift(); c; c = queue.shift()) {
    let buf: Buffer;
    try {
      buf = await fetchImage(c.metadataId);
    } catch {
      const n = (tries.get(c.id) ?? 0) + 1;
      tries.set(c.id, n);
      if (n < 6) {
        queue.push(c); // try again later
        await new Promise((r) => setTimeout(r, 2000 * n));
      } else failed.push(c.id);
      continue;
    }
    writeFileSync(join(out, 'orig', `${c.id}.webp`), buf);
    for (const s of SIZES) {
      const img = sharp(buf).resize(s, s, { kernel: 'lanczos3' });
      writeFileSync(join(out, String(s), `${c.id}.webp`), await img.webp({ quality: 82 }).toBuffer());
    }
    manifest[c.id] = sha(buf);
    if (++done % 50 === 0) {
      writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest));
      console.log(`${done} done`);
    }
  }
}
// Mostly waiting on the network, so many workers; resizing itself is quick.
await Promise.all(Array.from({ length: 12 }, worker));
if (failed.length) console.log(`FAILED after retries (re-run to try again): tokens ${failed.join(', ')}`);
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
