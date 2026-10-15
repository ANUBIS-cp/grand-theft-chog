'use client';
import { useRef, useState, type CSSProperties, type PointerEvent } from 'react';

// Pull a sheet down by its top to close it, like an iOS sheet: it follows your finger, and closes if you pull
// far enough or flick it; otherwise it springs back. Bind the handlers to the sheet's top strip (the grabber
// and title), which should have `touch-none` so the page doesn't scroll instead.

export function useDragClose(onClose?: () => void) {
  const [dy, setDy] = useState(0);
  const st = useRef<{ id: number; y: number; t: number } | null>(null);
  const end = (e: PointerEvent, cancel: boolean) => {
    const s = st.current;
    st.current = null;
    if (!s || s.id !== e.pointerId) return;
    const d = e.clientY - s.y;
    const v = d / Math.max(1, performance.now() - s.t);
    setDy(0);
    if (!cancel && onClose && (d > 90 || (d > 30 && v > 0.6))) onClose();
  };
  const bind = {
    onPointerDown(e: PointerEvent) {
      if (!onClose || e.pointerType !== 'touch') return;
      st.current = { id: e.pointerId, y: e.clientY, t: performance.now() };
    },
    onPointerMove(e: PointerEvent) {
      const s = st.current;
      if (!s || s.id !== e.pointerId) return;
      const d = Math.max(0, e.clientY - s.y);
      if (d > 4)
        try {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
          /* gone */
        }
      // A little resistance, so it feels attached.
      setDy(d < 200 ? d : 200 + (d - 200) * 0.4);
    },
    onPointerUp: (e: PointerEvent) => end(e, false),
    onPointerCancel: (e: PointerEvent) => end(e, true),
  };
  const style: CSSProperties = dy
    ? { transform: `translateY(${dy}px)`, transition: 'none' }
    : { transition: 'transform 320ms cubic-bezier(.2,.9,.3,1)' };
  return { bind, style, dragging: dy > 0 };
}
