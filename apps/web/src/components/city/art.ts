import { GANG_IDS } from '@chog-city/data';

// Drawn art for the city, made outside the code (see docs/art-prompts.md) and prepared by
// tools/images/art.ts into /art/city/<name>.webp. Anything that isn't there yet is drawn in code instead,
// so the city always works and gets better as each picture lands.

export const ART_NAMES = [
  ...GANG_IDS.map((g) => `gang-${g}`),
  'jail',
  'practice',
  'tree',
  'lamp',
  'bench',
  'hydrant',
  'fountain',
  'stall',
  'car-0',
  'car-1',
  'car-2',
  'car-3',
] as const;
export type ArtName = (typeof ART_NAMES)[number];

/** Loads whatever the manifest lists; `get` returns a picture once it has loaded. */
export class CityArt {
  private images = new Map<string, HTMLImageElement>();

  constructor(private onLoad: () => void) {
    void fetch('/art/city/manifest.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : { names: [] }))
      .then((m: { names: string[]; v?: string }) => {
        for (const name of m.names) {
          const img = new Image();
          img.decoding = 'async';
          img.onload = () => this.onLoad();
          img.src = `/art/city/${name}.webp${m.v ? `?v=${m.v}` : ''}`;
          this.images.set(name, img);
        }
      })
      .catch(() => {});
  }

  get(name: string): HTMLImageElement | undefined {
    const img = this.images.get(name);
    return img && img.complete && img.naturalWidth ? img : undefined;
  }
}
