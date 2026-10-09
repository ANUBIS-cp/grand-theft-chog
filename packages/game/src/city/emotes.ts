/** The emotes a Chog can do in the city, in the order of their keys (1-8). Pictures are in /emotes/<kind>.webp. */
export const EMOTES = ['wave', 'laugh', 'angry', 'cash', 'cool', 'scream', 'cry', 'fire'] as const;
export type Emote = (typeof EMOTES)[number];
export const isEmote = (k: unknown): k is Emote =>
  typeof k === 'string' && (EMOTES as readonly string[]).includes(k);
