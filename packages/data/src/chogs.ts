import data from './generated/chogs.json' with { type: 'json' };
import type { Chog } from './traits.ts';

export const COLLECTION = {
  contract: data.contract as `0x${string}`,
  chainId: data.chainId,
  supply: data.supply,
  offset: data.offset,
  baseURI: data.baseURI,
  imageBase: data.imageBase,
} as const;

export const CHOGS: readonly Chog[] = data.chogs as Chog[];

export function getChog(id: number): Chog | undefined {
  return Number.isInteger(id) && id >= 1 && id <= CHOGS.length ? CHOGS[id - 1] : undefined;
}

/** The name holders see on OpenSea, e.g. "Chog #683" or "Blaze". */
export function displayName(chog: Chog): string {
  return chog.title ?? `Chog #${chog.metadataId}`;
}

export function metadataIdFor(tokenId: number): number {
  return ((tokenId - 1 + COLLECTION.offset) % COLLECTION.supply) + 1;
}
