'use client';
import { Ghost, Lock, Siren, Sparkle, Stop, VideoCamera } from '@phosphor-icons/react';
import { useState } from 'react';
import { cn } from '@/lib/cn';

// Filming the game (?film=1): the buttons, map and cards are gone so the city fills the frame. Press H to
// bring them back for a shot that needs them, B to hide this bar. The owner gets this small bar at the top, to call up
// the moments a video needs without waiting for them: a police chase home carrying the cash typed in, a lock
// and the vault, the "Got away!" banner, Halloween. All practice: nothing real is robbed or paid.

export function Director(props: {
  chasing: boolean;
  haunted: boolean;
  onChase: (cash: number) => void;
  onStop: () => void;
  onLock: () => void;
  onBanner: (cash: number) => void;
  onHaunt: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [cash, setCash] = useState('1240');
  const item =
    'press flex items-center gap-1.5 rounded-full bg-fill px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-white/20';
  return (
    <div className="pointer-events-auto absolute left-1/2 top-3 z-40 -translate-x-1/2">
      <div className="glass-strong flex w-max max-w-[calc(100vw-24px)] flex-wrap items-center justify-center gap-1.5 rounded-[22px] p-1.5 text-white shadow-[0_8px_30px_rgba(0,0,0,0.45)]">
        <button
          onClick={() => setOpen((o) => !o)}
          aria-label="Demo controls"
          className="press grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#ff4d6d] text-white"
        >
          <VideoCamera size={16} weight="fill" />
        </button>
        {open && (
          <>
            {props.chasing ? (
              <button onClick={props.onStop} className={item}>
                <Stop size={14} weight="fill" /> Stop chase
              </button>
            ) : (
              <button onClick={() => props.onChase(Number(cash) || 0)} className={item}>
                <Siren size={14} weight="fill" /> Police chase
              </button>
            )}
            <button onClick={props.onLock} className={item}>
              <Lock size={14} weight="fill" /> Lock + vault
            </button>
            <span className="flex shrink-0 items-center rounded-full bg-fill pl-3">
              <span className="text-[13px] font-semibold text-label-2">$</span>
              <input
                value={cash}
                onChange={(e) => setCash(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                onKeyDown={(e) => e.stopPropagation()}
                inputMode="numeric"
                aria-label="Cash in the banner"
                className="w-[52px] bg-transparent py-1.5 text-[13px] font-semibold text-white outline-none"
              />
              <button
                onClick={() => props.onBanner(Number(cash) || 0)}
                className="press flex items-center gap-1.5 whitespace-nowrap rounded-full bg-[#ffd666] px-3 py-1.5 text-[13px] font-bold text-black"
              >
                <Sparkle size={14} weight="fill" /> Got away
              </button>
            </span>
            <button
              onClick={props.onHaunt}
              className={cn(item, props.haunted && 'bg-[#ff8a1f] text-black hover:bg-[#ffa04a]')}
            >
              <Ghost size={14} weight="fill" /> Halloween
            </button>
            <span className="whitespace-nowrap px-2 text-[12px] text-label-3">H buttons · B this bar</span>
          </>
        )}
      </div>
    </div>
  );
}
