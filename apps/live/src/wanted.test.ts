import { placeOf } from '@chog-city/game/city';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pollWanted, stepWanted, type Hunter } from './hunts.ts';

// Most Wanted on the live server: when they can be caught, and that a hunter is told why when they can't.
const W = { day: 1, chog: 326, name: 'Chog #1787', gang: 'crybabies', bounty: 2250, claimed: false };
const door = placeOf('crybabies')!.door;
const hunter = (over: Partial<Hunter>): Hunter => ({
  id: 1,
  chog: 1,
  name: 'x',
  gang: 'mcga',
  x: 0,
  y: 0,
  jail: null,
  joined: 0,
  ...over,
});

async function setup() {
  const fetchMock = vi.fn(async (url: string) =>
    String(url).endsWith('/api/city/wanted')
      ? new Response(JSON.stringify({ wanted: { ...W } }))
      : new Response(JSON.stringify({ ok: true, bounty: 2250, jailedUntil: 99 })),
  );
  vi.stubGlobal('fetch', fetchMock);
  await pollWanted(() => {});
  return fetchMock;
}
afterEach(() => vi.unstubAllGlobals());

describe('catching the Most Wanted', () => {
  it('at their own gang’s door they are safe, and the hunter is told so', async () => {
    const fetchMock = await setup();
    const prey = hunter({ id: 2, chog: 326, gang: 'crybabies', x: door.x, y: door.y + 1.5 });
    const me = hunter({ x: door.x + 0.3, y: door.y + 1.5 });
    const sent: unknown[] = [];
    const told: unknown[] = [];
    stepWanted(1e6, [prey, me], (m) => sent.push(m), () => {}, (_, m) => told.push(m));
    expect(sent).toContainEqual({ t: 'wanted-safe', why: 'home' });
    expect(told).toEqual([{ t: 'wanted-no', why: 'home' }]);
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('wanted-tag'))).toBe(false);
  });
  it('out in the street, a rival who reaches them catches them', async () => {
    const fetchMock = await setup();
    const x = door.x + 12;
    const prey = hunter({ id: 2, chog: 326, gang: 'crybabies', x, y: door.y + 6 });
    const me = hunter({ id: 3, chog: 7, x: x + 0.3, y: door.y + 6 });
    const sent: unknown[] = [];
    stepWanted(2e6, [prey, me], (m) => sent.push(m), () => {}, () => {});
    expect(sent).toContainEqual({ t: 'wanted-safe', why: null });
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('wanted-tag'))).toBe(true);
  });
});
