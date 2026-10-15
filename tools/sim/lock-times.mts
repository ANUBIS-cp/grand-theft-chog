// How long a perfect player takes on each kind of break-in lock, to check a person has room in 12 s.
//   npx tsx tools/sim/lock-times.mts
import { GANG_IDS } from '@chog-city/data';
import {
  DIAL,
  LEFT,
  LOCK_TPS,
  RIGHT,
  SPAN,
  TAP,
  WIRE,
  dialNumber,
  faceOf,
  isTargetFace,
  lockFor,
  showing,
  startLock,
  stepLock,
} from '@chog-city/game/lock';

const by: Record<string, number[]> = {};
for (const gang of GANG_IDS)
  for (let seed = 1; seed <= 40; seed++) {
    const s = startLock(gang, seed * 104729);
    while (s.phase === 'play') {
      let i = 0;
      if (s.kind === 'tumbler') {
        const t = structuredClone(s);
        stepLock(t, 0);
        if (Math.abs(t.pins[s.done]!.y - SPAN / 2) <= 60) i = TAP;
      } else if (s.kind === 'wires') {
        if (showing(s) === null && s.tick % 6 === 0) i = WIRE(s.order[s.done]!);
      } else if (s.kind === 'reels') {
        const t = structuredClone(s);
        stepLock(t, 0);
        if (isTargetFace(s, faceOf(t.reels[s.done]!.at)) && t.reels[s.done]!.at % SPAN < 400) i = TAP;
      } else {
        const d = (s.combo[s.done]! - dialNumber(s.dial) + DIAL) % DIAL;
        if (d) i = d <= DIAL / 2 ? RIGHT : LEFT;
      }
      stepLock(s, i);
    }
    (by[lockFor(gang)] ??= []).push(s.tick / LOCK_TPS);
  }
for (const [k, v] of Object.entries(by)) {
  v.sort((a, b) => a - b);
  console.log(
    k.padEnd(8),
    'median',
    v[v.length >> 1]!.toFixed(1),
    's  worst',
    v[v.length - 1]!.toFixed(1),
    's',
  );
}
