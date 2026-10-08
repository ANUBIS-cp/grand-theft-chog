// Builds src/generated/chogs.json from the verified metadata snapshot (one file per metadata ID).
// Usage: node packages/data/scripts/build-chogs.ts <metadata-cache-dir>
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SUPPLY = 1969;
const OFFSET = 1461; // from the reveal: metadataId = ((tokenId - 1 + OFFSET) % SUPPLY) + 1
const dir = process.argv[2];
if (!dir) throw new Error('usage: build-chogs.ts <metadata-cache-dir>');

const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
if (files.length !== SUPPLY) throw new Error(`expected ${SUPPLY} files, found ${files.length}`);

let baseURI = '';
let imageBase = '';
const chogs = [];
for (let id = 1; id <= SUPPLY; id++) {
  const metadataId = ((id - 1 + OFFSET) % SUPPLY) + 1;
  const rec = JSON.parse(readFileSync(join(dir, `${metadataId}.json`), 'utf8'));
  const d = rec.data;
  if (rec.id !== metadataId) throw new Error(`file ${metadataId} has id ${rec.id}`);
  if (!d.name.startsWith(`CHOG #${metadataId}`)) throw new Error(`unexpected name ${d.name}`);
  // A few Chogs (the 1:1s) carry a title after the number, e.g. "CHOG #53 — Blaze".
  const title = d.name
    .slice(`CHOG #${metadataId}`.length)
    .replace(/^\s*[—-]\s*/, '')
    .trim();
  const uriBase = rec.uri.slice(0, rec.uri.lastIndexOf('/') + 1);
  const imgBase = d.image.slice(0, d.image.lastIndexOf('/') + 1);
  if (d.image !== `${imgBase}${metadataId}.webp`) throw new Error(`unexpected image ${d.image}`);
  baseURI ||= uriBase;
  imageBase ||= imgBase;
  if (uriBase !== baseURI || imgBase !== imageBase) throw new Error(`mixed base URIs at ${metadataId}`);
  const traits: Record<string, string> = {};
  for (const a of d.attributes) traits[a.trait_type] = String(a.value);
  chogs.push(title ? { id, metadataId, title, traits } : { id, metadataId, traits });
}

const out = {
  contract: '0xc96d31F8626c6D03Fae5dCD3d61e3FB9F4a73763',
  chainId: 143,
  supply: SUPPLY,
  offset: OFFSET,
  baseURI,
  imageBase,
  chogs,
};
const target = new URL('../src/generated/chogs.json', import.meta.url);
writeFileSync(target, JSON.stringify(out));
console.log(`wrote ${chogs.length} Chogs`);
