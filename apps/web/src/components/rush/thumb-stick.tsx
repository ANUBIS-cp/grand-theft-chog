'use client';
import { useRef, useState } from 'react';
import { cn } from '@/lib/cn';

// The phone's stick, in its own strip under the vault so your thumb never covers a guard. Put your thumb down
// anywhere in the strip and the stick appears under it; slide it the way you want to go and hold. Your Chog
// moves while you hold and stops when you let go, like holding an arrow key. Turns are taken at the next
// opening, so you can slide early. It only ever reads four ways, and it sticks to the way you're going until
// you clearly mean another, so a thumb's natural curve doesn't send you down the wrong corridor.

type Dir = 0 | 1 | 2 | 3;

const DEAD = 10;
const MAX = 42;
/** How much the other axis must win by before the stick changes axis. */
const STICK = 1.35;

const ROT: Record<Dir, number> = { 0: 0, 1: 90, 2: 180, 3: 270 };

export function ThumbStick({ onDir, className }: { onDir: (d: Dir | -1) => void; className?: string }) {
  const zone = useRef<HTMLDivElement>(null);
  const live = useRef<{ id: number; ax: number; ay: number; d: Dir | -1 } | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);
  const [dir, setDir] = useState<Dir | -1>(-1);

  const pick = (dx: number, dy: number, was: Dir | -1): Dir | -1 => {
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (Math.max(ax, ay) < DEAD) return -1;
    const horizontal = was === 1 || was === 3;
    const vertical = was === 0 || was === 2;
    let useX = ax > ay;
    if (horizontal) useX = ay < ax * STICK;
    else if (vertical) useX = ax > ay * STICK;
    return useX ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0;
  };

  const set = (d: Dir | -1) => {
    const l = live.current;
    if (!l || l.d === d) return;
    l.d = d;
    setDir(d);
    onDir(d);
    if (d !== -1) navigator.vibrate?.(5);
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
        live.current = { id: e.pointerId, ax: e.clientX, ay: e.clientY, d: -1 };
        setPos({ x: e.clientX - box.left, y: e.clientY - box.top, dx: 0, dy: 0 });
      }}
      onPointerMove={(e) => {
        const l = live.current;
        if (!l || l.id !== e.pointerId) return;
        let dx = e.clientX - l.ax;
        let dy = e.clientY - l.ay;
        const len = Math.hypot(dx, dy);
        // Past the rim the stick's base follows your thumb, so turning back is always a short slide.
        if (len > MAX) {
          l.ax += (dx / len) * (len - MAX);
          l.ay += (dy / len) * (len - MAX);
          dx = e.clientX - l.ax;
          dy = e.clientY - l.ay;
        }
        set(pick(dx, dy, l.d));
        const box = zone.current!.getBoundingClientRect();
        setPos({ x: l.ax - box.left, y: l.ay - box.top, dx, dy });
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
      {/* At rest the stick waits in the middle of the strip; touched, it jumps under your thumb. */}
      <div
        className="pointer-events-none absolute"
        style={pos ? { left: pos.x, top: pos.y } : { left: '50%', top: '50%' }}
      >
        <div
          className={cn(
            'absolute -left-[56px] -top-[56px] h-[112px] w-[112px] rounded-full transition-opacity duration-200',
            pos ? 'opacity-100' : 'opacity-70',
          )}
          style={{
            background: 'radial-gradient(circle, rgba(255,255,255,0.10), rgba(255,255,255,0.04) 70%)',
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.14), 0 10px 30px rgba(0,0,0,0.35)',
            backdropFilter: 'blur(12px)',
          }}
        >
          {([0, 1, 2, 3] as Dir[]).map((d) => (
            <svg
              key={d}
              width="112"
              height="112"
              viewBox="0 0 112 112"
              className="absolute inset-0 transition-opacity duration-150"
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
            transform: pos ? `translate(${pos.dx}px, ${pos.dy}px)` : undefined,
            background: 'linear-gradient(180deg,#ffffff,#d9d7e4)',
            boxShadow: 'inset 0 1px 0 #fff, 0 6px 16px rgba(0,0,0,0.45)',
          }}
        />
      </div>
    </div>
  );
}
