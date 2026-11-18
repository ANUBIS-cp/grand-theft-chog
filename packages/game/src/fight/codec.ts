import { startFight, stepFight, type FightInput, type FighterSetup, type FightState } from './sim.ts';

// A fight as the server sees it: every step's controls, short enough to send, replayed to check the result.
// The stick is rounded to 16 directions and two strengths before the browser uses it, so the replay sees
// exactly what the player saw. Runs of the same input are counted, so a whole fight is about a kilobyte.

const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
/** Unit vectors (x100) for 16 directions, worked out once: no sin/cos at play time. */
const DIRS: readonly [number, number][] = [
  [100, 0], [92, 38], [71, 71], [38, 92], [0, 100], [-38, 92], [-71, 71], [-92, 38],
  [-100, 0], [-92, -38], [-71, -71], [-38, -92], [0, -100], [38, -92], [71, -71], [92, -38],
];

function stickCode(mx: number, my: number): number {
  const m = Math.sqrt(mx * mx + my * my);
  if (m < 20) return 0;
  let best = 0;
  let dot = -Infinity;
  DIRS.forEach(([x, y], i) => {
    const d = x * mx + y * my;
    if (d > dot) {
      dot = d;
      best = i;
    }
  });
  return 1 + best * 2 + (m > 70 ? 1 : 0);
}

const buttonBits = (i: FightInput) => (i.hit ? 1 : 0) | (i.dash ? 2 : 0) | (i.p1 ? 4 : 0) | (i.p2 ? 8 : 0);

function fromCode(stick: number, bits: number): FightInput {
  const out: FightInput = { mx: 0, my: 0 };
  if (stick > 0) {
    const [x, y] = DIRS[(stick - 1) >> 1]!;
    const full = (stick - 1) % 2 === 1;
    out.mx = full ? x : Math.round(x / 2);
    out.my = full ? y : Math.round(y / 2);
  }
  if (bits & 1) out.hit = true;
  if (bits & 2) out.dash = true;
  if (bits & 4) out.p1 = true;
  if (bits & 8) out.p2 = true;
  return out;
}

/** The input as the fight will use it: the stick rounded, the buttons as pressed. */
export function roundFightInput(i: FightInput): FightInput {
  return fromCode(stickCode(i.mx, i.my), buttonBits(i));
}

/** Two characters per distinct input and one for how many steps it was held (up to 64). */
export function encodeFightInputs(inputs: readonly FightInput[]): string {
  let out = '';
  let i = 0;
  while (i < inputs.length) {
    const v = stickCode(inputs[i]!.mx, inputs[i]!.my) * 16 + buttonBits(inputs[i]!);
    let n = 1;
    while (n < 64 && i + n < inputs.length) {
      const w = inputs[i + n]!;
      if (stickCode(w.mx, w.my) * 16 + buttonBits(w) !== v) break;
      n++;
    }
    out += ABC[v >> 6]! + ABC[v & 63]! + ABC[n - 1]!;
    i += n;
  }
  return out;
}

export function decodeFightInputs(text: string): FightInput[] | null {
  if (text.length % 3 !== 0) return null;
  const out: FightInput[] = [];
  for (let i = 0; i < text.length; i += 3) {
    const [a, b, c] = [ABC.indexOf(text[i]!), ABC.indexOf(text[i + 1]!), ABC.indexOf(text[i + 2]!)];
    if (a < 0 || b < 0 || c < 0) return null;
    const v = a * 64 + b;
    const stick = v >> 4;
    if (stick > 32) return null;
    const input = fromCode(stick, v & 15);
    for (let n = 0; n <= c; n++) out.push(input);
  }
  return out;
}

/** Plays a recorded fight from the start; the other side is always the computer. */
export function replayFight(me: FighterSetup, them: FighterSetup, seed: number, inputs: readonly FightInput[]): FightState {
  const s = startFight(me, them, seed);
  const idle = { mx: 0, my: 0 };
  for (const i of inputs) {
    if (s.phase === 'over') break;
    stepFight(s, [i, idle]);
  }
  return s;
}
