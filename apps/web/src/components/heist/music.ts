import { audioEngine, wakeSound } from './sound';

// The game's music: four licensed tracks (Pixabay Content License: free, no credit needed, fine in a game),
// in public/music, levelled to the same loudness:
//   city       Atmospheric Phonk Synthwave (Password Infinity), Evgeny Bardyuzha  - walking the city at night
//   vault      Spinning Head, Gvidon                                              - the lock and the vault
//   chase      Risk, StudioKolomna                                                - carrying the bag home
//   halloween  The Paranormal Is Real, Leonell Cassio                             - the city in Halloween week
// Two players take turns so a change of scene fades one track out as the next comes in. Phones only let a page
// start music from a tap, so both are started (silently) by the first tap and kept running from then on. The
// sound button mutes the music with everything else; it pauses while the tab is hidden.

export type Track = 'city' | 'vault' | 'chase' | 'halloween';

const VOLUME = 0.32;
const FADE = 1.4;

interface Deck {
  el: HTMLAudioElement;
  gain: GainNode | null;
  track: Track | null;
}

let decks: Deck[] | null = null;
let master: GainNode | null = null;
let live = 0;
let wanted: Track | null = null;
let muted = false;
let unlocked = false;

function setup() {
  if (decks || typeof window === 'undefined') return;
  decks = [0, 1].map(() => {
    const el = new Audio();
    el.loop = true;
    el.preload = 'auto';
    el.setAttribute('playsinline', '');
    return { el, gain: null, track: null };
  });
  // The first tap anywhere: start both players silently, so the phone lets them play from then on.
  const unlock = () => {
    if (unlocked) return;
    unlocked = true;
    wakeSound();
    route();
    for (const d of decks!) {
      if (!d.el.src) d.el.src = '/music/city.mp3';
      d.el.muted = true;
      void d.el.play().then(
        () => {
          if (d.track === null) d.el.pause();
          d.el.muted = false;
        },
        () => {
          d.el.muted = false;
          unlocked = false;
        },
      );
    }
    apply();
  };
  for (const ev of ['touchend', 'click', 'keydown'])
    window.addEventListener(ev, unlock, { capture: true, passive: true });
  // Local testing only: what each player is doing.
  if (location.hostname === 'localhost')
    (window as unknown as { __music: () => unknown }).__music = () => ({
      wanted,
      unlocked,
      live,
      decks: decks!.map((d) => ({
        track: d.track,
        paused: d.el.paused,
        t: Math.round(d.el.currentTime),
        gain: d.gain?.gain.value,
      })),
    });
  document.addEventListener('visibilitychange', () => {
    for (const d of decks!) if (document.hidden) d.el.pause();
    if (!document.hidden) apply();
  });
}

/** Through the audio engine, so the volume can fade (a phone ignores an audio element's own volume). */
function route() {
  const ac = audioEngine();
  if (!ac || !decks || master) return;
  master = ac.createGain();
  master.gain.value = muted ? 0 : VOLUME;
  master.connect(ac.destination);
  for (const d of decks) {
    try {
      const src = ac.createMediaElementSource(d.el);
      d.gain = ac.createGain();
      d.gain.gain.value = 0;
      src.connect(d.gain).connect(master);
    } catch {
      /* already routed */
    }
  }
}

function apply() {
  if (!decks) return;
  route();
  const ac = audioEngine();
  const now = ac?.currentTime ?? 0;
  const cur = decks[live]!;
  if (cur.track !== wanted) {
    // The other player takes the new track and fades in; this one fades out.
    const next = decks[1 - live]!;
    if (wanted) {
      if (next.track !== wanted) {
        next.el.src = `/music/${wanted}.mp3`;
        next.track = wanted;
      }
      if (unlocked && !document.hidden) void next.el.play().catch(() => {});
      next.gain?.gain.cancelScheduledValues(now);
      next.gain?.gain.setTargetAtTime(1, now, FADE / 3);
    }
    cur.gain?.gain.cancelScheduledValues(now);
    cur.gain?.gain.setTargetAtTime(0, now, FADE / 4);
    const old = cur;
    setTimeout(
      () => {
        if (old !== decks![live]) {
          old.el.pause();
          old.track = old === decks![live] ? old.track : null;
        }
      },
      FADE * 1000 + 300,
    );
    live = 1 - live;
  } else if (wanted && unlocked && !document.hidden) {
    // Already the right track: make sure it's playing and up (its fade may have been set before the engine
    // existed, the first time round).
    if (cur.el.paused) void cur.el.play().catch(() => {});
    if (cur.gain && cur.gain.gain.value < 0.99) cur.gain.gain.setTargetAtTime(1, now, FADE / 3);
  }
}

/** What should be playing now (null for silence). Safe to call every render. */
export function playMusic(track: Track | null) {
  setup();
  if (track === wanted) return;
  wanted = track;
  apply();
}

/** The sound button: music goes quiet with everything else. */
export function setMusicMuted(m: boolean) {
  muted = m;
  if (master) master.gain.value = m ? 0 : VOLUME;
}
