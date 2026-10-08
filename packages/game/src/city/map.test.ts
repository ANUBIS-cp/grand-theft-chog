import { GANG_IDS } from '@chog-city/data';
import { describe, expect, it } from 'vitest';
import { CITY, Ground, doorAt, groundAt, placeOf, route, slide, standable } from './map.ts';
import { newWalker, rng, stepWalker } from './walkers.ts';

describe('city map', () => {
  it('has a building for every gang, the jail and the practice vault', () => {
    for (const g of GANG_IDS) expect(placeOf(g)?.gang).toBe(g);
    expect(placeOf('jail')?.kind).toBe('jail');
    expect(placeOf('training')?.kind).toBe('training');
  });

  it('lets you stand at every door and walk there from the plaza', () => {
    expect(standable(CITY.spawn.x, CITY.spawn.y)).toBe(true);
    for (const p of CITY.places) {
      expect(standable(p.door.x, p.door.y), p.id).toBe(true);
      expect(doorAt(p.door.x, p.door.y)?.id).toBe(p.id);
      expect(route(CITY.spawn.x, CITY.spawn.y, p.door.x, p.door.y), p.id).not.toBeNull();
    }
  });

  it('keeps you out of buildings and the jail yard', () => {
    const p = placeOf('mcga')!;
    expect(groundAt(p.x + 2, p.y + 2)).toBe(Ground.Block);
    // Walking straight up from the door stops at the wall.
    let at = { x: p.door.x, y: p.door.y };
    for (let i = 0; i < 50; i++) at = slide(at.x, at.y, 0, -0.1);
    expect(at.y).toBeGreaterThan(p.y + p.h);
    const jail = placeOf('jail')!;
    expect(standable(jail.x + 3.5, jail.y + jail.h + 1.5)).toBe(false);
  });

  it('keeps strollers on walkable ground', () => {
    const rand = rng(7);
    const ws = Array.from({ length: 20 }, () => newWalker(rand));
    for (let t = 0; t < 600; t++)
      for (const w of ws) {
        stepWalker(w, 0.1, rand);
        expect(standable(w.x, w.y)).toBe(true);
      }
  });
});
