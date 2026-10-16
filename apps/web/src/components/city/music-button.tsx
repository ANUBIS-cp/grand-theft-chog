'use client';
import { MusicNotesSimple, SkipForward, SpeakerHigh } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import {
  musicState,
  nextSong,
  setMusicOff,
  SONGS,
  watchMusic,
  type MusicState,
  type Track,
} from '@/components/heist/music';
import { gameSoundsMuted, setGameMuted, watchGameMuted } from '@/components/heist/sound';
import { cn } from '@/lib/cn';

// A small round button by the minimap: little level bars that move with the music. Tap it for what's playing,
// the next song, and a switch each for the music and the game's sounds.

const SCENE: Record<Track, { name: string; tile: string }> = {
  city: { name: 'City at night', tile: 'linear-gradient(135deg,#7b5cff,#2bd9ff)' },
  vault: { name: 'In the vault', tile: 'linear-gradient(135deg,#ffd666,#ff8a3d)' },
  chase: { name: 'The run home', tile: 'linear-gradient(135deg,#ff4d6d,#3d7bff)' },
  halloween: { name: 'Halloween week', tile: 'linear-gradient(135deg,#ff8a1f,#7a2bff)' },
};

function Bars(props: { on: boolean; size: 'sm' | 'lg' }) {
  const h = props.size === 'sm' ? 'h-[14px]' : 'h-[18px]';
  return (
    <span className={cn('flex items-end gap-[2.5px]', h)} aria-hidden>
      {[0.9, 0.55, 1.15, 0.7].map((d, i) => (
        <span
          key={i}
          className="eq-bar h-full w-[3px] origin-bottom rounded-full bg-white"
          style={
            props.on
              ? { animation: `eq ${d}s ease-in-out ${i * -0.23}s infinite` }
              : { transform: 'scaleY(0.22)', opacity: 0.55 }
          }
        />
      ))}
    </span>
  );
}

function Switch(props: {
  on: boolean;
  label: string;
  icon: React.ReactNode;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={props.on}
      onClick={() => props.onChange(!props.on)}
      className="press flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left hover:bg-white/5"
    >
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-fill text-label-2">{props.icon}</span>
      <span className="flex-1 text-[14px] font-semibold text-white">{props.label}</span>
      <span
        className={cn(
          'relative h-[22px] w-[38px] rounded-full transition-colors duration-200',
          props.on ? 'bg-[#3ddc84]' : 'bg-fill',
        )}
      >
        <span
          className={cn(
            'absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.35)] transition-[left] duration-200',
            props.on ? 'left-[18px]' : 'left-[2px]',
          )}
        />
      </span>
    </button>
  );
}

export function MusicButton() {
  const [st, setSt] = useState<MusicState>(() => musicState());
  const [quiet, setQuiet] = useState(false);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSt(musicState());
    setQuiet(gameSoundsMuted());
    const a = watchMusic(setSt);
    const b = watchGameMuted(setQuiet);
    return () => {
      a();
      b();
    };
  }, []);

  // A tap anywhere else, or Escape, closes it.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', away, true);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);

  const playing = !st.off && st.started && !!st.song;
  const song = st.song ? SONGS[st.song] : null;
  const scene = SCENE[st.track ?? 'city'];

  return (
    <div ref={box} className="pointer-events-auto relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Music"
        aria-expanded={open}
        className={cn(
          'press glass grid h-10 w-10 place-items-center rounded-full max-sm:h-9 max-sm:w-9',
          open && 'ring-1 ring-white/30',
        )}
      >
        <Bars on={playing} size="sm" />
      </button>

      {open && (
        <div className="glass-strong absolute right-0 top-[calc(100%+8px)] w-[264px] origin-top-right animate-[glass-in_0.18s_ease-out] rounded-[20px] p-2">
          <div className="flex items-center gap-3 p-1.5">
            <span
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.25)]"
              style={{ background: scene.tile, opacity: st.off ? 0.45 : 1 }}
            >
              <Bars on={playing} size="lg" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-label-3">
                {st.off ? 'Music off' : scene.name}
              </span>
              <span className="block truncate text-[14px] font-bold leading-tight text-white">
                {song?.title ?? (st.started ? '—' : 'Tap anywhere to start')}
              </span>
              {song && <span className="block truncate text-[12px] text-label-2">{song.artist}</span>}
            </span>
            {st.track === 'city' && (
              <button
                onClick={() => nextSong()}
                aria-label="Next song"
                className="press grid h-9 w-9 shrink-0 place-items-center rounded-full bg-fill text-white hover:bg-white/20"
              >
                <SkipForward size={16} weight="fill" />
              </button>
            )}
          </div>
          <div className="mx-1.5 my-1 h-px bg-white/10" />
          <Switch
            on={!st.off}
            label="Music"
            icon={<MusicNotesSimple size={15} weight="bold" />}
            onChange={(on) => setMusicOff(!on)}
          />
          <Switch
            on={!quiet}
            label="Game sounds"
            icon={<SpeakerHigh size={15} weight="bold" />}
            onChange={(on) => setGameMuted(!on)}
          />
        </div>
      )}
    </div>
  );
}
