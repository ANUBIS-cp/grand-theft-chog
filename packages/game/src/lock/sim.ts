import { GANG_IDS, type GangId } from '@chog-city/data';

// Stage 1 of a robbery: the lock on the vault door. Four kinds, one per gang, each a few seconds of timing or
// memory. A clean break-in is quiet (the guards start on patrol); a slow or sloppy one is loud (the alarm is
// already ringing inside). You can't fail it outright: when the clock runs out you force the door, loudly.
// Integer maths only and one input per step, so the server replays the taps and gets the same result.

export const LOCK_TPS = 30;
/** Steps before you force the door (15 s; the wires' order being shown doesn't count). */
export const LOCK_LIMIT = 15 * LOCK_TPS;
/** More mistakes than this and the break-in is loud. */
export const LOCK_SLIPS = 1;

export type LockKind = 'tumbler' | 'wires' | 'reels' | 'dial';

const KIND: Record<GangId, LockKind> = {
  royals: 'tumbler',
  gangstas: 'tumbler',
  robbers: 'tumbler',
  jailbirds: 'tumbler',
  skulls: 'tumbler',
  lazoor: 'wires',
  suits: 'wires',
  radioactive: 'wires',
  'mon-maxis': 'wires',
  'squid-game': 'reels',
  clowns: 'reels',
  'visor-gang': 'reels',
  mcga: 'reels',
  'btc-maxis': 'dial',
  wizards: 'dial',
  crybabies: 'dial',
  caps: 'tumbler',
  durags: 'wires',
  naked: 'reels',
  legends: 'dial',
};
export const lockFor = (gang: GangId): LockKind => KIND[gang] ?? 'tumbler';

/**
 * One step's input: 0 nothing, 1 tap (tumbler, reels), 2..6 cut wire 0..4, 7 turn left, 8 turn right
 * (held: sent every step the key is down).
 */
export type LockInput = number;
export const TAP = 1;
export const WIRE = (i: number) => 2 + i;
export const LEFT = 7;
export const RIGHT = 8;

/** Pins and reels move along 0..SPAN; the gold band (tumbler) or window (reels) is in the middle. */
export const SPAN = 1000;
export const BAND = 200;
export const PINS = 4;
export const WIRES = 5;
export const ORDER = 4;
export const REELS = 3;
export const FACES = 8;
export const DIAL = 40;
export const COMBO = 3;
/** Steps the dial has to rest on the right number to click. */
export const DIAL_REST = 9;
/** How long each wire flashes, and the gap after, when the order is shown. */
export const FLASH = 24;
export const FLASH_GAP = 9;

export interface LockState {
  kind: LockKind;
  gang: GangId;
  tick: number;
  /** Steps spent watching the wires' order (the clock stops for them). */
  watched: number;
  phase: 'play' | 'open' | 'forced';
  slips: number;
  /** Pins set, wires cut right, reels stopped right or numbers clicked. */
  done: number;
  /** Tumbler: each pin's height and speed (units a step, signed). */
  pins: { y: number; v: number }[];
  /** Wires: the order to cut, and when the order started being shown (it replays after a slip). */
  order: number[];
  showFrom: number;
  /** Reels: each reel's position (faces * SPAN wraps) and speed, and which face is the gang's symbol. */
  reels: { at: number; v: number; stopped: boolean }[];
  target: number;
  /** Dial: the number under the pointer (in quarter-numbers), the combination, and how long it's rested. */
  dial: number;
  combo: number[];
  rest: number;
  /** Steps the turn key has been held, for speeding up. */
  held: number;
  /** Something to flash on screen this step: a hit or a slip (for sound and shake). */
  last: 'hit' | 'slip' | null;
  seed: number;
}

function rand(s: LockState) {
  // mulberry32
  let t = (s.seed = (s.seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const int = (s: LockState, n: number) => Math.floor(rand(s) * n);

export function startLock(gang: GangId, seed: number): LockState {
  const s: LockState = {
    kind: lockFor(gang),
    gang,
    tick: 0,
    watched: 0,
    phase: 'play',
    slips: 0,
    done: 0,
    pins: [],
    order: [],
    // A beat before the wires' order starts flashing.
    showFrom: 15,
    reels: [],
    target: 0,
    dial: 0,
    combo: [],
    rest: 0,
    held: 0,
    last: null,
    seed: seed | 0,
  };
  // Each pin is a little faster than the one before.
  for (let i = 0; i < PINS; i++)
    s.pins.push({ y: int(s, SPAN), v: (9 + i * 3 + int(s, 3)) * (int(s, 2) ? 1 : -1) });
  const wires = [0, 1, 2, 3, 4];
  for (let i = 0; i < ORDER; i++) s.order.push(wires.splice(int(s, wires.length), 1)[0]!);
  s.target = GANG_IDS.indexOf(gang) % FACES;
  for (let i = 0; i < REELS; i++)
    s.reels.push({ at: int(s, FACES * SPAN), v: 38 + i * 10 + int(s, 8), stopped: false });
  // Three numbers, each far enough from the one before that you have to turn for it.
  let n = 0;
  for (let i = 0; i < COMBO; i++) {
    n = (n + 8 + int(s, DIAL - 16)) % DIAL;
    s.combo.push(n);
  }
  return s;
}

/** Where pin `i` is (it bounces between 0 and SPAN). */
const bounce = (p: { y: number; v: number }) => {
  p.y += p.v;
  if (p.y < 0) {
    p.y = -p.y;
    p.v = -p.v;
  } else if (p.y > SPAN) {
    p.y = 2 * SPAN - p.y;
    p.v = -p.v;
  }
};
const inBand = (y: number) => Math.abs(y - SPAN / 2) <= BAND / 2;
/** Each reel carries the gang's building twice, on opposite sides. */
export const isTargetFace = (s: LockState, f: number) => f % (FACES / 2) === s.target % (FACES / 2);
/** The face showing in a reel's window. */
export const faceOf = (at: number) => Math.floor((at + SPAN / 2) / SPAN) % FACES;
/** The number under the dial's pointer (the dial moves in quarter-numbers). */
export const dialNumber = (q: number) => Math.round(q / 4) % DIAL;
/** Wires: whether the order is being shown right now, and which wire is lit. */
export function showing(s: LockState): number | null {
  const k = s.tick - s.showFrom;
  if (k < 0) return null;
  const i = Math.floor(k / (FLASH + FLASH_GAP));
  if (i >= s.order.length) return null;
  return k % (FLASH + FLASH_GAP) < FLASH ? s.order[i]! : -1;
}
const total = (k: LockKind) =>
  k === 'tumbler' ? PINS : k === 'wires' ? ORDER : k === 'reels' ? REELS : COMBO;

export function stepLock(s: LockState, input: LockInput) {
  if (s.phase !== 'play') return;
  s.tick++;
  s.last = null;
  const hit = () => {
    s.done++;
    s.last = 'hit';
    if (s.done >= total(s.kind)) s.phase = 'open';
  };
  const slip = () => {
    s.slips++;
    s.last = 'slip';
  };
  switch (s.kind) {
    case 'tumbler': {
      for (let i = s.done; i < PINS; i++) bounce(s.pins[i]!);
      if (input === TAP) {
        const p = s.pins[s.done]!;
        if (inBand(p.y)) {
          p.y = SPAN / 2;
          hit();
        } else slip();
      }
      break;
    }
    case 'wires': {
      if (showing(s) !== null) s.watched++;
      // Taps while the order is still being shown don't count.
      if (input >= WIRE(0) && input <= WIRE(WIRES - 1) && showing(s) === null) {
        if (input - 2 === s.order[s.done]) hit();
        else {
          slip();
          // A wrong cut: start the order again, shown from the top.
          s.done = 0;
          s.showFrom = s.tick + 10;
        }
      }
      break;
    }
    case 'reels': {
      for (const r of s.reels) if (!r.stopped) r.at = (r.at + r.v) % (FACES * SPAN);
      if (input === TAP) {
        const r = s.reels[s.done]!;
        const f = faceOf(r.at);
        if (isTargetFace(s, f)) {
          r.stopped = true;
          r.at = f * SPAN;
          hit();
        } else slip();
      }
      break;
    }
    case 'dial': {
      if (input === LEFT || input === RIGHT) {
        s.held++;
        // Slow at first so you can land on a number, faster when held.
        const q = s.held > 18 ? 2 : 1;
        s.dial = (s.dial + (input === RIGHT ? q : -q) + DIAL * 4) % (DIAL * 4);
        s.rest = 0;
      } else {
        s.held = 0;
        if (dialNumber(s.dial) === s.combo[s.done]) {
          if (++s.rest >= DIAL_REST) {
            s.rest = 0;
            hit();
          }
        } else s.rest = 0;
      }
      break;
    }
  }
  if (s.phase === 'play' && lockClock(s) >= LOCK_LIMIT) s.phase = 'forced';
}

/** Steps on the clock so far. */
export const lockClock = (s: LockState) => s.tick - s.watched;

/** How the break-in went: quiet only when the door opened in time with at most LOCK_SLIPS slips. */
export const lockQuiet = (s: LockState) => s.phase === 'open' && s.slips <= LOCK_SLIPS;

const ABC = 'ABCDEFGHIJ';
export const encodeLock = (inputs: readonly LockInput[]) => inputs.map((i) => ABC[i] ?? 'A').join('');
export function decodeLock(text: string): LockInput[] | null {
  if (text.length > LOCK_LIMIT * 4 + 5) return null;
  const out: LockInput[] = [];
  for (const ch of text) {
    const v = ABC.indexOf(ch);
    if (v < 0) return null;
    out.push(v);
  }
  return out;
}

/** Replays a break-in from its inputs: quiet or loud. Inputs that run out count as standing still. */
export function replayLock(gang: GangId, seed: number, inputs: readonly LockInput[]) {
  const s = startLock(gang, seed);
  for (let k = 0; s.phase === 'play' && k <= LOCK_LIMIT * 4; k++) stepLock(s, inputs[k] ?? 0);
  return { state: s, quiet: lockQuiet(s) };
}

/** A perfect break-in (for tests, bots and smoke checks): taps exactly when they land. */
export function perfectLock(gang: GangId, seed: number): LockInput[] {
  const s = startLock(gang, seed);
  const inputs: LockInput[] = [];
  while (s.phase === 'play') {
    let i: LockInput = 0;
    const next = structuredClone(s);
    stepLock(next, 0);
    if (s.kind === 'tumbler') {
      if (Math.abs(next.pins[s.done]!.y - SPAN / 2) <= 60) i = TAP;
    } else if (s.kind === 'wires') {
      if (showing(s) === null && s.tick % 6 === 0) i = WIRE(s.order[s.done]!);
    } else if (s.kind === 'reels') {
      const r = next.reels[s.done]!;
      if (isTargetFace(s, faceOf(r.at)) && r.at % SPAN < 400) i = TAP;
    } else {
      const d = (s.combo[s.done]! - dialNumber(s.dial) + DIAL) % DIAL;
      if (d) i = d <= DIAL / 2 ? RIGHT : LEFT;
    }
    inputs.push(i);
    stepLock(s, i);
  }
  return inputs;
}
