import { audioEngine, wakeSound } from './sound';

// The game's music: four licensed tracks (Pixabay Content License: free, no credit needed, fine in a game),
// in public/music, levelled to the same loudness:
//   city       walking the city at night, a playlist (shuffled, a new song as each one ends):
//                Atmospheric Phonk Synthwave (Password Infinity), Evgeny Bardyuzha
//                Charming Phonk, FreeMusicLab
//                No Sleep, kontraa
//                Kugelsicher, TremoxBeatz
//                The Blackest Bouquet, Leonell Cassio
//   vault      Spinning Head, Gvidon                                              - the lock and the vault
//   chase      Risk, StudioKolomna                                                - carrying the bag home
//   halloween  The Paranormal Is Real, Leonell Cassio                             - the city in Halloween week
// Two players take turns so a change of scene fades one track out as the next comes in. Phones only let a page
// start music from a tap, so both are started (silently) by the first tap and kept running from then on. The
// music button switches it off (kept for the next visit) or skips to the next city song; it pauses while the tab
// is hidden.

export type Track = 'city' | 'vault' | 'chase' | 'halloween';

// Mixed under the game: quieter overall, a dip in the middle where the game's own sounds sit (coins, locks,
// hits), the bass and the top left alone so it still has punch, and it ducks for a moment under each sound.
const VOLUME = 0.19;
const FADE = 1.4;

const CITY = ['city', 'city-2', 'city-3', 'city-4', 'city-5'];
// A shuffled order, played through before it repeats; it never plays the same song twice in a row.
let cityOrder: string[] = [];
let lastCity = '';
function nextCity(): string {
  if (!cityOrder.length) {
    const last = lastCity;
    cityOrder = [...CITY];
    for (let i = cityOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cityOrder[i], cityOrder[j]] = [cityOrder[j]!, cityOrder[i]!];
    }
    if (cityOrder[0] === last) cityOrder.push(cityOrder.shift()!);
  }
  lastCity = cityOrder.shift()!;
  return lastCity;
}
const fileFor = (t: Track) => `/music/${t === 'city' ? nextCity() : t}.mp3`;

/** Each song's name and artist, for the music button. */
export const SONGS: Record<string, { title: string; artist: string }> = {
  city: { title: 'Password Infinity', artist: 'Evgeny Bardyuzha' },
  'city-2': { title: 'Charming Phonk', artist: 'FreeMusicLab' },
  'city-3': { title: 'No Sleep', artist: 'kontraa' },
  'city-4': { title: 'Kugelsicher', artist: 'TremoxBeatz' },
  'city-5': { title: 'The Blackest Bouquet', artist: 'Leonell Cassio' },
  vault: { title: 'Spinning Head', artist: 'Gvidon' },
  chase: { title: 'Risk', artist: 'StudioKolomna' },
  halloween: { title: 'The Paranormal Is Real', artist: 'Leonell Cassio' },
};

export interface MusicState {
  /** Switched off with the music button. */
  off: boolean;
  /** The scene's track, and the song playing in it ("city-3"), or null before anything plays. */
  track: Track | null;
  song: string | null;
  /** Whether a tap has let the music start yet. */
  started: boolean;
}

const listeners = new Set<(s: MusicState) => void>();

interface Deck {
  el: HTMLAudioElement;
  gain: GainNode | null;
  track: Track | null;
}

let decks: Deck[] | null = null;
let master: GainNode | null = null;
let duck: GainNode | null = null;
let lastDuck = 0;
let live = 0;
let wanted: Track | null = null;
let off = (() => {
  try {
    return typeof window !== 'undefined' && localStorage.getItem('cw-music-off') === '1';
  } catch {
    return false;
  }
})();
let unlocked = false;
let skip = false;

const songOf = (d: Deck | undefined) =>
  d?.el.src ? decodeURIComponent(d.el.src.split('/').pop() ?? '').replace(/\.mp3$/, '') : null;

/** What the music is doing now. */
export function musicState(): MusicState {
  const cur = decks?.[live];
  return { off, track: wanted, song: cur?.track ? songOf(cur) : null, started: unlocked };
}

const emit = () => {
  const st = musicState();
  for (const l of listeners) l(st);
};

/** Calls back whenever the song, the scene or the switch changes. Returns a function to stop. */
export function watchMusic(cb: (s: MusicState) => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function setup() {
  if (decks || typeof window === 'undefined') return;
  decks = [0, 1].map(() => {
    const el = new Audio();
    el.loop = true;
    el.preload = 'auto';
    el.setAttribute('playsinline', '');
    const d: Deck = { el, gain: null, track: null };
    // The city's playlist: the next song as this one ends (the other tracks loop).
    el.addEventListener('ended', () => {
      if (d.track !== 'city' || d !== decks![live]) return;
      el.src = fileFor('city');
      if (!off) void el.play().catch(() => {});
      emit();
    });
    return d;
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
          // Only the scene's song keeps going, and not with the music off (it would play on at no volume).
          if (d.track === null || off) d.el.pause();
          d.el.muted = false;
        },
        () => {
          d.el.muted = false;
          unlocked = false;
        },
      );
    }
    apply();
    emit();
  };
  for (const ev of ['touchend', 'click', 'keydown'])
    window.addEventListener(ev, unlock, { capture: true, passive: true });
  // Local testing only: what each player is doing.
  if (location.hostname === 'localhost') {
    // ...and a jump to a few seconds before the song's end, to hear the next one come in.
    (window as unknown as { __musicEnd: () => void }).__musicEnd = () => {
      const el = decks![live]!.el;
      el.currentTime = Math.max(0, el.duration - 3);
    };
    (window as unknown as { __music: () => unknown }).__music = () => ({
      wanted,
      unlocked,
      live,
      decks: decks!.map((d) => ({
        track: d.track,
        paused: d.el.paused,
        src: d.el.src.split('/').pop(),
        t: Math.round(d.el.currentTime),
        gain: d.gain?.gain.value,
      })),
    });
  }
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
  master.gain.value = off ? 0 : VOLUME;
  duck = ac.createGain();
  const low = ac.createBiquadFilter();
  low.type = 'lowshelf';
  low.frequency.value = 140;
  low.gain.value = 3;
  const mid = ac.createBiquadFilter();
  mid.type = 'peaking';
  mid.frequency.value = 1800;
  mid.Q.value = 0.8;
  mid.gain.value = -6;
  const high = ac.createBiquadFilter();
  high.type = 'highshelf';
  high.frequency.value = 9000;
  high.gain.value = 1.5;
  master.connect(duck).connect(low).connect(mid).connect(high).connect(ac.destination);
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
  const playing = unlocked && !document.hidden && !off;
  if (cur.track !== wanted || (skip && wanted)) {
    // The other player takes the new track and fades in; this one fades out.
    const next = decks[1 - live]!;
    if (wanted) {
      if (next.track !== wanted || skip) {
        next.el.src = fileFor(wanted);
        next.el.loop = wanted !== 'city';
        next.track = wanted;
      }
      if (playing) void next.el.play().catch(() => {});
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
  } else if (wanted && playing) {
    // Already the right track: make sure it's playing and up (its fade may have been set before the engine
    // existed, the first time round).
    if (cur.el.paused) void cur.el.play().catch(() => {});
    if (cur.gain && cur.gain.gain.value < 0.99) cur.gain.gain.setTargetAtTime(1, now, FADE / 3);
  }
  skip = false;
  emit();
}

/** What should be playing now (null for silence). Safe to call every render. */
export function playMusic(track: Track | null) {
  setup();
  if (track === wanted) return;
  wanted = track;
  apply();
}

/** The next city song now, faded across (the vault, the run home and Halloween have one track each). */
export function nextSong() {
  if (wanted !== 'city') return;
  if (off) setMusicOff(false);
  skip = true;
  apply();
}

/** A game sound just played: the music dips under it for a moment, then comes back. */
export function duckMusic() {
  const ac = audioEngine();
  if (!ac || !duck) return;
  const t = ac.currentTime;
  // Several sounds in a row hold the dip rather than pumping it.
  if (t - lastDuck < 0.05) return;
  lastDuck = t;
  duck.gain.cancelScheduledValues(t);
  duck.gain.setTargetAtTime(0.45, t, 0.015);
  duck.gain.setTargetAtTime(1, t + 0.12, 0.25);
}

/** The music switch: off pauses it (and is kept for the next visit), on picks up where it was. */
export function setMusicOff(o: boolean) {
  off = o;
  try {
    localStorage.setItem('cw-music-off', o ? '1' : '0');
  } catch {
    /* no storage */
  }
  if (master) master.gain.value = o ? 0 : VOLUME;
  if (o) for (const d of decks ?? []) d.el.pause();
  apply();
}
