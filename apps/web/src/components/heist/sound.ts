// Small synthesised sounds (no files to load).
//
// One audio engine for the whole game, shared by every screen. (Each vault and lock used to make its own and
// never close it; phones only allow a few, so after a few robberies the new ones stayed silent.)
//
// Phones only let a page start sound from inside a tap. Chrome on iPhone is Apple's web engine underneath, and
// it is strict: the engine has to be MADE inside a tap too; one made on page load can stay silent for good.
// So it's made by the first tap, key or click anywhere (the finger lifting, which iPhone counts as the tap),
// and woken again by any later tap if the phone put it to sleep (another app, the lock screen, a call), with a
// silent blip played inside the tap, which is what finally switches it on. Every sound is made on that one
// warm engine, so it starts at once (a fresh engine per screen started cold, which was the delay).
// `soundOn()` says whether the engine is on, for a "tap for sound" button.

import { duckMusic } from './music';

let shared: AudioContext | null = null;
let noiseBuf: AudioBuffer | null = null;
const watchers = new Set<(on: boolean) => void>();

const tell = () => {
  const on = soundOn();
  for (const w of watchers) w(on);
};

/** Makes the engine (if needed) and wakes it. Only works from inside a tap, key or click. */
function wake() {
  if (typeof window === 'undefined') return;
  if (!shared) {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    try {
      shared = new Ctx();
    } catch {
      return;
    }
    shared.onstatechange = tell;
  }
  const ac = shared;
  if (ac.state !== 'running') void ac.resume().then(tell, () => {});
  try {
    const b = ac.createBuffer(1, 1, ac.sampleRate);
    const src = ac.createBufferSource();
    src.buffer = b;
    src.connect(ac.destination);
    src.start(0);
  } catch {
    /* not ready */
  }
  tell();
}

let listening = false;
/** Listen for the first tap anywhere (and every later one), so sound comes on as soon as you touch the game. */
export function prepareSound() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  for (const ev of ['touchend', 'click', 'keydown'])
    window.addEventListener(
      ev,
      () => {
        if (!shared || shared.state !== 'running') wake();
      },
      { capture: true, passive: true },
    );
}

/** The one audio engine, once a tap has made it (null before). For the music (music.ts). */
export function audioEngine(): AudioContext | null {
  return shared;
}

/** Makes or wakes the engine; only works from inside a tap, key or click. */
export const wakeSound = () => wake();

/** Whether sound is actually on right now. */
export function soundOn() {
  return !!shared && shared.state === 'running';
}

/** Calls back whenever sound goes on or off. Returns a function to stop. */
export function watchSound(cb: (on: boolean) => void) {
  watchers.add(cb);
  return () => watchers.delete(cb);
}

// The game's sounds on or off for every screen at once (the music has its own switch, in music.ts), kept for
// the next visit.
let gameMuted = (() => {
  try {
    return typeof window !== 'undefined' && localStorage.getItem('heist-muted') === '1';
  } catch {
    return false;
  }
})();
const muteWatchers = new Set<(m: boolean) => void>();

/** Whether the game's sounds are off. */
export const gameSoundsMuted = () => gameMuted;

/** Switch the game's sounds off or on, everywhere. */
export function setGameMuted(m: boolean) {
  gameMuted = m;
  try {
    localStorage.setItem('heist-muted', m ? '1' : '0');
  } catch {
    /* no storage */
  }
  for (const w of muteWatchers) w(m);
}

/** Calls back when the game's sounds are switched off or on. Returns a function to stop. */
export function watchGameMuted(cb: (m: boolean) => void) {
  muteWatchers.add(cb);
  return () => muteWatchers.delete(cb);
}

/** For a button: switch sound on from this tap. */
export function soundTap() {
  wake();
}

export class Sound {
  private masterOf: AudioContext | null = null;
  private masterNode: GainNode | null = null;
  private siren: { osc: OscillatorNode; lfo: OscillatorNode; gain: GainNode } | null = null;
  private police: { osc: OscillatorNode; lfo: OscillatorNode; gain: GainNode } | null = null;
  /** Small, frequent sounds (footsteps, dial ticks) don't make the music dip. */
  private quiet = false;
  private hushed(fn: () => void) {
    this.quiet = true;
    try {
      fn();
    } finally {
      this.quiet = false;
    }
  }
  step(style: string) {
    this.hushed(() => this.stepSound(style));
  }
  flick() {
    this.hushed(() => this.flickSound());
  }
  dialTick() {
    this.hushed(() => this.dialTickSound());
  }
  private get mutedNow() {
    return this.muted || gameMuted;
  }
  muted = false;

  constructor() {
    prepareSound();
  }

  /** The shared engine, once a tap has made it. */
  private get ac() {
    return shared;
  }

  /** This screen's volume knob on the shared engine (made the first time it's needed). */
  private get master() {
    if (!shared) return null;
    if (this.masterOf !== shared) {
      this.masterOf = shared;
      this.masterNode = shared.createGain();
      this.masterNode.connect(shared.destination);
    }
    // Follows the switch for the whole game too (a siren already wailing goes quiet with it).
    const vol = this.mutedNow ? 0 : 0.5;
    if (this.masterNode!.gain.value !== vol) this.masterNode!.gain.value = vol;
    return this.masterNode;
  }

  /** Called from taps and keys: makes or wakes the shared engine. */
  unlock() {
    if (!shared || shared.state !== 'running') wake();
  }

  /**
   * Whether to make a sound. Not gated on the engine saying it's "running": iPhone can report it asleep while
   * it plays, and a gate on that silenced everything. If it's really asleep, nudge it awake as well.
   */
  private get live() {
    if (!shared || shared.state === 'closed' || !this.master) return false;
    if (shared.state !== 'running') void shared.resume().catch(() => {});
    return true;
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.masterNode) this.masterNode.gain.value = this.mutedNow ? 0 : 0.5;
  }

  private tone(freq: number, at: number, dur: number, type: OscillatorType, vol: number, slideTo?: number) {
    const ac = this.ac;
    if (!ac || !this.master || !this.live) return;
    if (!this.quiet && !this.mutedNow) duckMusic();
    const t0 = ac.currentTime + at;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  private noise(at: number, dur: number, vol: number, from: number, to: number) {
    const ac = this.ac;
    if (!ac || !this.master || !this.live) return;
    if (!this.quiet && !this.mutedNow) duckMusic();
    const t0 = ac.currentTime + at;
    // One second of noise made once and reused (making a fresh buffer each time costs a frame on a phone).
    if (!noiseBuf || noiseBuf.sampleRate !== ac.sampleRate) {
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(from, t0);
    f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0, Math.random() * 0.5, dur + 0.02);
  }

  coin() {
    this.tone(988, 0, 0.07, 'square', 0.06);
    this.tone(1319, 0.06, 0.12, 'square', 0.06);
  }

  cash() {
    this.tone(784, 0, 0.08, 'triangle', 0.12);
    this.tone(1047, 0.06, 0.08, 'triangle', 0.12);
    this.tone(1319, 0.12, 0.16, 'triangle', 0.12);
  }

  bag() {
    this.tone(140, 0, 0.18, 'sine', 0.25, 70);
    this.tone(1175, 0.05, 0.1, 'square', 0.05);
    this.tone(1568, 0.12, 0.2, 'square', 0.05);
  }

  click() {
    this.tone(2200, 0, 0.025, 'square', 0.03);
  }

  safe() {
    this.noise(0, 0.25, 0.25, 400, 3000);
    [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.05 + i * 0.07, 0.25, 'triangle', 0.12));
  }

  /** The safe tripped the silent alarm: a two-note warning. */
  lockdown() {
    this.tone(880, 0, 0.14, 'square', 0.07);
    this.tone(660, 0.16, 0.14, 'square', 0.07);
    this.tone(880, 0.32, 0.14, 'square', 0.07);
  }

  /** One second gone on the countdown. */
  tick(urgent: boolean) {
    this.tone(urgent ? 1400 : 1000, 0, 0.05, 'square', urgent ? 0.06 : 0.035);
  }

  /** The combo went up: a rising chord, higher for bigger combos. */
  combo(mult: number) {
    const base = 523 * 2 ** ((mult - 2) / 4);
    [1, 1.26, 1.5, 2].forEach((k, i) => this.tone(base * k, i * 0.05, 0.12, 'square', 0.05));
  }

  /** A loudspeaker blast: the guards run. */
  flip() {
    this.noise(0, 0.35, 0.25, 200, 2500);
    [262, 392, 523, 784].forEach((f, i) => this.tone(f, i * 0.06, 0.2, 'sawtooth', 0.05));
  }

  /** A dial hit and a dial miss. */
  hit(n: number) {
    this.tone(880 + n * 220, 0, 0.09, 'triangle', 0.12);
    this.tone(1320 + n * 220, 0.06, 0.12, 'triangle', 0.1);
  }
  miss() {
    this.tone(200, 0, 0.25, 'sawtooth', 0.12, 90);
  }

  /** Tagged by a guard. */
  tag() {
    this.thud();
    this.tone(523, 0.05, 0.12, 'square', 0.06, 262);
  }

  suspect() {
    this.tone(660, 0, 0.09, 'sine', 0.08, 880);
  }

  power() {
    this.noise(0, 0.3, 0.2, 300, 4000);
    this.tone(330, 0, 0.25, 'sine', 0.08, 990);
  }

  zap() {
    this.tone(1800, 0, 0.3, 'sawtooth', 0.08, 120);
    this.noise(0, 0.15, 0.15, 3000, 800);
  }

  thud() {
    this.tone(110, 0, 0.2, 'sine', 0.3, 50);
    this.noise(0, 0.12, 0.2, 800, 200);
  }

  alarmOn() {
    const ac = this.ac;
    if (!ac || !this.master || this.siren) return;
    // The siren is a held sound, so it may start before audio wakes: it simply comes in when it does.
    const osc = ac.createOscillator();
    const lfo = ac.createOscillator();
    const lfoGain = ac.createGain();
    const gain = ac.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = 740;
    lfo.frequency.value = 2.2;
    lfoGain.gain.value = 220;
    lfo.connect(lfoGain).connect(osc.frequency);
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1800;
    gain.gain.value = 0.05;
    osc.connect(f).connect(gain).connect(this.master);
    osc.start();
    lfo.start();
    this.siren = { osc, lfo, gain };
  }

  alarmOff() {
    if (!this.siren || !this.ac) return;
    const { osc, lfo, gain } = this.siren;
    gain.gain.exponentialRampToValueAtTime(0.0001, this.ac.currentTime + 0.2);
    osc.stop(this.ac.currentTime + 0.25);
    lfo.stop(this.ac.currentTime + 0.25);
    this.siren = null;
  }

  /**
   * Police on a getaway: an American police siren, held, as loud as the nearest car is close (`level` 0..1). A
   * slow wail (the pitch sweeping up and down every few seconds) from a distance, a fast yelp when it's right on
   * you. (A two-note hi-lo is an ambulance.) Starts silent; call `policeLevel` every frame, `policeOff` at the end.
   */
  policeLevel(level: number) {
    const ac = this.ac;
    if (!ac || !this.master) return;
    if (!this.police) {
      const osc = ac.createOscillator();
      const lfo = ac.createOscillator();
      const lfoGain = ac.createGain();
      const gain = ac.createGain();
      const f = ac.createBiquadFilter();
      osc.type = 'square';
      osc.frequency.value = 1000;
      lfo.type = 'sine';
      lfo.frequency.value = 0.32;
      lfoGain.gain.value = 430;
      lfo.connect(lfoGain).connect(osc.frequency);
      // Square through a low-pass: the hard edge of an electronic siren without the fizz.
      f.type = 'lowpass';
      f.frequency.value = 2300;
      f.Q.value = 0.7;
      gain.gain.value = 0.0001;
      osc.connect(f).connect(gain).connect(this.master);
      osc.start();
      lfo.start();
      this.police = { osc, lfo, gain };
    }
    const close = level > 0.7;
    const t = ac.currentTime;
    this.police.lfo.frequency.setTargetAtTime(close ? 3.3 : 0.32, t, 0.25);
    this.police.gain.gain.setTargetAtTime(Math.max(0.0001, Math.min(1, level) * 0.045), t, 0.15);
  }

  policeOff() {
    if (!this.police || !this.ac) return;
    const { osc, lfo, gain } = this.police;
    gain.gain.setTargetAtTime(0.0001, this.ac.currentTime, 0.1);
    osc.stop(this.ac.currentTime + 0.6);
    lfo.stop(this.ac.currentTime + 0.6);
    this.police = null;
  }

  /** Break-in locks: a pin sets, a wire is cut, a reel stops, the dial clicks, and the door gives. */
  pin() {
    this.tone(1760, 0, 0.05, 'square', 0.05);
    this.tone(2637, 0.04, 0.09, 'triangle', 0.05);
  }
  snip() {
    this.noise(0, 0.07, 0.25, 5000, 2500);
    this.tone(1200, 0, 0.04, 'square', 0.03);
  }
  clunk() {
    this.tone(180, 0, 0.12, 'square', 0.08, 90);
    this.noise(0, 0.06, 0.15, 900, 300);
  }
  private dialTickSound() {
    this.noise(0, 0.02, 0.12, 3500, 3000);
  }
  slip() {
    this.tone(150, 0, 0.18, 'sawtooth', 0.07, 110);
  }
  unlocked() {
    [784, 1175, 1568].forEach((f, i) => this.tone(f, i * 0.07, 0.16, 'triangle', 0.07));
  }

  /** A footstep in the city: soft and short; heavier for stompers, a springy tick for bouncers, none floating. */
  private stepSound(style: string) {
    if (style === 'float') return;
    const v = 0.7 + Math.random() * 0.3;
    if (style === 'stomp') {
      this.tone(90, 0, 0.09, 'sine', 0.14 * v, 60);
      this.noise(0, 0.05, 0.05 * v, 500, 200);
    } else if (style === 'bounce') {
      this.tone(420, 0, 0.07, 'sine', 0.05 * v, 640);
    } else if (style === 'glide') {
      this.noise(0, 0.05, 0.025 * v, 2500, 1500);
    } else {
      this.noise(0, 0.04, 0.05 * v, 1400 + Math.random() * 400, 500);
      this.tone(140, 0, 0.04, 'sine', 0.05 * v, 90);
    }
  }

  /** The card spinning round: a quick paper flick. */
  private flickSound() {
    this.noise(0, 0.09, 0.07, 1200, 5000);
  }

  busted() {
    this.alarmOff();
    this.thud();
    [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.15 + i * 0.16, 0.22, 'square', 0.07));
  }

  escaped() {
    this.alarmOff();
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => this.tone(f, i * 0.08, 0.18, 'square', 0.06));
  }
}
