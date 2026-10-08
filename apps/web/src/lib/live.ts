'use client';
import { useEffect, useRef } from 'react';

/** Calls `onChange` whenever something happens in the city (server-sent events), so the page can refresh. */
export function useLive(onChange: () => void): void {
  const cb = useRef(onChange);
  cb.current = onChange;
  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const es = new EventSource('/api/live');
    es.onmessage = () => cb.current();
    return () => es.close();
  }, []);
}
