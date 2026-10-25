// The Halloween pictures (docs/art-halloween.md, prepared by tools/images/halloween.ts into
// public/art/halloween/). Loaded once, the first time something asks for them; until they're in, whatever uses
// them draws its old look.

const NAMES = [
  'h-floor-stone',
  'h-floor-wood',
  'h-wall-top',
  'h-wall-front',
  'h-coffin',
  'h-pillar',
  'h-tomb',
  'h-cobweb',
  'h-candles',
  'phantom',
  'blood-moon',
  'pumpkin-cash',
  'pumpkin-gold',
] as const;
export type HalloweenArt = (typeof NAMES)[number];

/** Bump when the pictures change, so browsers fetch the new ones. */
const V = '1';
const images = new Map<HalloweenArt, HTMLImageElement>();
const waiting = new Set<() => void>();

export const hArt = (name: HalloweenArt): HTMLImageElement | null => {
  const img = images.get(name);
  return img && img.complete && img.naturalWidth ? img : null;
};

export const halloweenArtReady = () => NAMES.every((n) => hArt(n));

/** Starts loading (once); `onReady` is called when every picture is in (at once if they already are). */
export function loadHalloweenArt(onReady?: () => void) {
  if (typeof window === 'undefined') return;
  if (halloweenArtReady()) {
    onReady?.();
    return;
  }
  if (onReady) waiting.add(onReady);
  if (images.size) return;
  for (const n of NAMES) {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      if (!halloweenArtReady()) return;
      for (const w of waiting) w();
      waiting.clear();
    };
    img.src = `/art/halloween/${n}.webp?v=${V}`;
    images.set(n, img);
  }
}
