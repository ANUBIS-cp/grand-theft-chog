// A getaway's route, kept so the replay can show the run home: where the robber and each officer stood, five
// times a second. Positions are tenths of a tile. The live server records it (apps/live/src/getaway.ts) and
// sends it with the result; the replay page plays it back in the city.

/** How often a frame is kept (ms). */
export const TRACK_MS = 200;
/** A getaway is at most a couple of minutes; anything longer is cut (and refused by the web app). */
export const TRACK_MAX_FRAMES = 1200;

export interface GetawayTrack {
  /** Whose picture each officer wore, in the order they appear in every frame. */
  cops: number[];
  /** Each frame: robber x, y, then x, y for every officer, in tenths of a tile. */
  frames: number[][];
  /** How it ended. */
  outcome: 'home' | 'caught';
  /** Who did it, on a catch: police, the robbed gang (by), or the clock. */
  who: 'police' | 'gang' | 'time' | null;
  by: number | null;
  /** The cash in the bag. */
  bag?: number;
}

/** One frame from where everyone is now. */
export function trackFrame(me: { x: number; y: number }, cops: { x: number; y: number }[]): number[] {
  const out = [Math.round(me.x * 10), Math.round(me.y * 10)];
  for (const k of cops) out.push(Math.round(k.x * 10), Math.round(k.y * 10));
  return out;
}

/** Is this a track a live server could have sent (sizes and numbers in range)? */
export function validTrack(t: unknown, w = 400, h = 400): t is GetawayTrack {
  if (!t || typeof t !== 'object') return false;
  const v = t as GetawayTrack;
  if (!Array.isArray(v.cops) || v.cops.length > 12 || !v.cops.every((c) => Number.isInteger(c))) return false;
  if (!Array.isArray(v.frames) || v.frames.length > TRACK_MAX_FRAMES) return false;
  const n = 2 + v.cops.length * 2;
  for (const f of v.frames) {
    if (!Array.isArray(f) || f.length !== n) return false;
    for (let i = 0; i < n; i++) {
      const x = f[i];
      if (!Number.isInteger(x) || x! < 0 || x! > (i % 2 ? h : w) * 10) return false;
    }
  }
  return v.outcome === 'home' || v.outcome === 'caught';
}

/** Where everyone is `ms` into the run, between the two nearest frames. */
export function trackAt(
  t: GetawayTrack,
  ms: number,
): { me: { x: number; y: number }; cops: { x: number; y: number }[] } {
  const last = t.frames.length - 1;
  const k = Math.max(0, Math.min(last, ms / TRACK_MS));
  const i = Math.min(last, Math.floor(k));
  const j = Math.min(last, i + 1);
  const f = k - i;
  const a = t.frames[i] ?? [0, 0];
  const b = t.frames[j] ?? a;
  const at = (n: number) => ((a[n] ?? 0) + ((b[n] ?? 0) - (a[n] ?? 0)) * f) / 10;
  return {
    me: { x: at(0), y: at(1) },
    cops: t.cops.map((_, c) => ({ x: at(2 + c * 2), y: at(3 + c * 2) })),
  };
}

/** How long the recorded run lasts (ms). */
export const trackLength = (t: GetawayTrack) => Math.max(0, t.frames.length - 1) * TRACK_MS;
