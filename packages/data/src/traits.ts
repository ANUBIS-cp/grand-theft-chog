export const TRAIT_TYPES = [
  'Background',
  'Aura',
  'Base',
  'Skin',
  'Side',
  'Body',
  'Mouth',
  'Eyes',
  'Head',
  'Accessory',
  'Form',
  'Tier',
  'Naked',
] as const;
export type TraitType = (typeof TRAIT_TYPES)[number];

/** One trait value, e.g. ['Eyes', 'Purple laser']. */
export type TraitMatch = readonly [TraitType, string];
export type Traits = Partial<Record<TraitType, string>>;

export const TIERS = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'] as const;
export type Tier = (typeof TIERS)[number];

export interface Chog {
  /** On-chain token ID (1..1969). Everything in the game is keyed by this. */
  id: number;
  /** Metadata file number. OpenSea shows the Chog as "CHOG #<metadataId>". */
  metadataId: number;
  /** Only the 1:1s have one, e.g. "Blaze". */
  title?: string;
  traits: Traits;
}
