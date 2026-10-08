'use client';
import { useEffect, useRef } from 'react';

/** What the server announces: a robbery starting ({ alarm }) or finishing ({ war }). */
export interface LiveEvent {
  alarm?: string;
  war?: string;
  target?: string;
  gang?: string;
  chog?: number;
}

/** Calls `onChange` whenever something happens in the city (server-sent events), so the page can refresh. */
export function useLive(onChange: (e: LiveEvent | null) => void): void {
  const cb = useRef(onChange);
  cb.current = onChange;
  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const es = new EventSource('/api/live');
    es.onmessage = (m) => {
      let e: LiveEvent | null = null;
      try {
        e = JSON.parse(m.data) as LiveEvent;
      } catch {}
      cb.current(e);
    };
    return () => es.close();
  }, []);
}
