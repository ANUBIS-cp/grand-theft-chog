'use client';
import { useRef, useState } from 'react';
import { cn } from '@/lib/cn';

// The phone's stick, in its own strip under the vault so your thumb never covers a guard. Put your thumb down
// anywhere in the strip and slide the way you want to go; hold to keep moving, let go to stop, like holding an
// arrow key.
//
// It reads the way your thumb last MOVED, not where it is from where it first landed. (Measured from the first
// touch, a thumb held out to the right and then pulled down only makes a slant that still reads "right", which
// is what sent people the wrong way.) A short, clear move of about 12 px turns you; the drift of a long slide
// doesn't, because the sideways part of the drift is forgiven as you slide.

import { readStick, type Dir } from './stick';

const ROT: Record<Dir, number> = { 0: 0, 1: 90, 2: 180, 3: 270 };
const UNIT: Record<Dir, [number, number]> = { 0: [0, -1], 1: [1, 0], 2: [0, 1], 3: [-1, 0] };

export function ThumbStick({ onDir, className }: { onDir: (d: Dir | -1) => void; className?: string }) {
  const zone = useRef<HTMLDivElement>(null);
  const live = useRef<{ id: number; px: number; py: number; d: Dir | -1 } | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [dir, setDir] = useState<Dir | -1>(-1);

  const set = (d: Dir | -1) => {
    const l = live.current;
    if (!l) return;
    l.d = d;
    setDir(d);
    onDir(d);
    if (d !== -1) navigator.vibrate?.(5);
  };

  const move = (fx: number, fy: number) => {
    const l = live.current!;
    const was = l.d;
    const d = readStick(l, fx, fy);
    if (d !== was) set(d);
  };

  return (
    <div
      ref={zone}
      className={cn('relative touch-none select-none', className)}
      onPointerDown={(e) => {
        if (live.current) return;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* no live pointer */
        }
        const box = e.currentTarget.getBoundingClientRect();
        live.current = { id: e.pointerId, px: e.clientX, py: e.clientY, d: -1 };
        setPos({ x: e.clientX - box.left, y: e.clientY - box.top });
      }}
      onPointerMove={(e) => {
        const l = live.current;
        if (!l || l.id !== e.pointerId) return;
        // Every point the finger passed through, not just the last one this frame.
        const pts = e.nativeEvent.getCoalescedEvents?.() ?? [];
        for (const p of pts.length ? pts : [e.nativeEvent]) move(p.clientX, p.clientY);
        const box = zone.current!.getBoundingClientRect();
        setPos({ x: e.clientX - box.left, y: e.clientY - box.top });
      }}
      onPointerUp={(e) => {
        const l = live.current;
        if (!l || l.id !== e.pointerId) return;
        set(-1);
        live.current = null;
        setPos(null);
      }}
      onPointerCancel={(e) => {
        const l = live.current;
        if (!l || l.id !== e.pointerId) return;
        set(-1);
        live.current = null;
        setPos(null);
      }}
    >
      {/* At rest the stick waits in the middle of the strip. Touched, the knob sits under your thumb and the ring
          slides behind it, so the knob is always pushed out the way you're going. */}
      <div
        className="pointer-events-none absolute"
        style={pos ? { left: pos.x, top: pos.y } : { left: '50%', top: '50%' }}
      >
        <div
          className={cn(
            'absolute -left-[56px] -top-[56px] h-[112px] w-[112px] rounded-full transition-[transform,opacity] duration-150 ease-out',
            pos ? 'opacity-100' : 'opacity-70',
          )}
          style={{
            transform:
              pos && dir !== -1 ? `translate(${-UNIT[dir][0] * 30}px, ${-UNIT[dir][1] * 30}px)` : undefined,
            background: 'radial-gradient(circle, rgba(255,255,255,0.12), rgba(255,255,255,0.05) 70%)',
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.16), 0 10px 30px rgba(0,0,0,0.35)',
          }}
        >
          {([0, 1, 2, 3] as Dir[]).map((d) => (
            <svg
              key={d}
              width="112"
              height="112"
              viewBox="0 0 112 112"
              className="absolute inset-0"
              style={{ rotate: `${ROT[d]}deg`, opacity: dir === d ? 1 : 0.35 }}
            >
              <path
                d="M47 20 56 11l9 9"
                fill="none"
                stroke={dir === d ? '#ff5c93' : '#ffffff'}
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ))}
        </div>
        <div
          className="absolute -left-[24px] -top-[24px] h-12 w-12 rounded-full"
          style={{
            background: 'linear-gradient(180deg,#ffffff,#d9d7e4)',
            boxShadow: 'inset 0 1px 0 #fff, 0 6px 16px rgba(0,0,0,0.45)',
          }}
        />
      </div>
    </div>
  );
}
