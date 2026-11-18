// Tonight's card: the same six for everyone on a game day. Five Chogs picked from the whole collection, in
// rising order, then the champion (the Chog that had robbed the most vaults when the day began).

export const CARD_SIZE = 6;
/** What a first win against each fight of the night pays the winner's gang vault. */
export const FIGHT_PAY = [50, 75, 100, 150, 200, 350] as const;
export const FIGHT_NAMES = ['Warm-up', 'Brawler', 'Tough', 'Dangerous', 'Main event', 'Champion'] as const;

/** The card's token IDs for a game day: `skip` (your own Chog) and the champion aren't picked twice. */
export function tonightIds(day: number, supply: number, champion: number, skip: number[] = []): number[] {
  let seed = (day * 2654435761) >>> 0;
  const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const ids: number[] = [];
  while (ids.length < CARD_SIZE - 1) {
    const id = 1 + Math.floor(next() * supply);
    if (!ids.includes(id) && !skip.includes(id) && id !== champion) ids.push(id);
  }
  return [...ids, champion];
}
