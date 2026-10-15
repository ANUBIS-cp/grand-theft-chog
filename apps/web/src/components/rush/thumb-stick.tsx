'use client';
import { useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { RING, readStick, type Dir } from './stick';

// The phone's stick, in its own strip under the vault so your thumb never covers a guard. Put your thumb down
// anywhere in the strip: the ring appears there and stays put. Move your thumb inside it the way you want to
// go; hold to keep moving, let go (or come back to the middle) to stop, like holding an arrow key. The way it
// reads is exactly where the knob sits, and that slice of the ring lights up.

const ROT: Record<Dir, number> = { 0: 0, 1: 90, 2: 180, 3: 270 };

export function ThumbStick({ onDir, className }: { onDir: (d: Dir | -1) => void; className?: string }) {
  const zone = useRef<HTMLDivElement>(null);
  const live = useRef<{ id: number; cx: number; cy: number; d: Dir | -1 } | null>(null);
  const [view, setView] = useState<{ cx: number; cy: number; kx: number; ky: number } | null>(null);
  const [dir, setDir] = useState<Dir | -1>(-1);

  const show = (fx: number, fy: number) => {
    const l = live.current!;
    const box = zone.current!.getBoundingClientRect();
    let kx = fx - l.cx;
    let ky = fy - l.cy;
    const r = Math.hypot(kx, ky);
    if (r > RING) {
      kx = (kx / r) * RING;
      ky = (ky / r) * RING;
    }
    setView({ cx: l.cx - box.left, cy: l.cy - box.top, kx, ky });
  };

  const end = (id: number) => {
    const l = live.current;
    if (!l || l.id !== id) return;
    live.current = null;
    setView(null);
    setDir(-1);
    onDir(-1);
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
        live.current = { id: e.pointerId, cx: e.clientX, cy: e.clientY, d: -1 };
        show(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        const l = live.current;
        if (!l || l.id !== e.pointerId) return;
        const was = l.d;
        const d = readStick(l, e.clientX, e.clientY);
        if (d !== was) {
          setDir(d);
          onDir(d);
        }
        show(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => end(e.pointerId)}
      onPointerCancel={(e) => end(e.pointerId)}
    >
      <div
        className="pointer-events-none absolute"
        style={view ? { left: view.cx, top: view.cy } : { left: '50%', top: '50%' }}
      >
        <div
          className={cn(
            'absolute -left-[64px] -top-[64px] h-[128px] w-[128px] rounded-full transition-opacity duration-150',
            view ? 'opacity-100' : 'opacity-60',
          )}
          style={{
            background: 'radial-gradient(circle, rgba(255,255,255,0.12), rgba(255,255,255,0.05) 70%)',
            boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,0.18), 0 10px 30px rgba(0,0,0,0.35)',
          }}
        >
          {/* The slice you're in, lit. */}
          {dir !== -1 && (
            <svg
              width="128"
              height="128"
              viewBox="0 0 128 128"
              className="absolute inset-0"
              style={{ rotate: `${ROT[dir]}deg` }}
            >
              <path d="M64 64 L19 19 A64 64 0 0 1 109 19 Z" fill="rgba(255,92,147,0.28)" />
            </svg>
          )}
          {([0, 1, 2, 3] as Dir[]).map((d) => (
            <svg
              key={d}
              width="128"
              height="128"
              viewBox="0 0 128 128"
              className="absolute inset-0"
              style={{ rotate: `${ROT[d]}deg`, opacity: dir === d ? 1 : 0.4 }}
            >
              <path
                d="M55 18 64 9l9 9"
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
          className="absolute -left-[26px] -top-[26px] h-[52px] w-[52px] rounded-full"
          style={{
            transform: view ? `translate(${view.kx}px, ${view.ky}px)` : undefined,
            background: 'linear-gradient(180deg,#ffffff,#d9d7e4)',
            boxShadow: 'inset 0 1px 0 #fff, 0 6px 16px rgba(0,0,0,0.45)',
          }}
        />
      </div>
    </div>
  );
}
