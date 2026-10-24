import { CITY, Ground, groundAt, standable } from './map.ts';

// Where a Pumpkin Rush pumpkin can sit: open street, away from doors (no camping a door for them). Shared by
// the live server (real pumpkins) and the browser (the Halloween preview's practice pumpkins).

const STREET = new Set<Ground>([Ground.Road, Ground.Walk, Ground.Cross, Ground.Plaza, Ground.Grass]);
let spots: { x: number; y: number }[] | null = null;

export function pumpkinSpots(): { x: number; y: number }[] {
  if (spots) return spots;
  const doors = CITY.places.map((p) => p.door);
  spots = [];
  for (let y = 1; y < CITY.h - 1; y++)
    for (let x = 1; x < CITY.w - 1; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      if (!STREET.has(groundAt(x, y)) || !standable(px, py)) continue;
      if (doors.some((d) => Math.hypot(d.x - px, d.y - py) < 3)) continue;
      spots.push({ x: px, y: py });
    }
  return spots;
}

/** Reaching a pumpkin: this close (tiles). */
export const PUMPKIN_GRAB = 0.9;
