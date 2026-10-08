'use client';
import { useEffect, useRef } from 'react';
import type { FeedItem } from './api';

/** Calls `onItems` with every new event in the city, as it happens (server-sent events). */
export function useLive(onItems: (items: FeedItem[], crewId: string | null) => void): void {
  const cb = useRef(onItems);
  cb.current = onItems;
  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const es = new EventSource('/api/live');
    es.onmessage = (m) => {
      try {
        const d = JSON.parse(m.data) as { e: FeedItem[]; c: string | null; more?: boolean };
        cb.current(d.e ?? [], d.c ?? null);
      } catch {
        /* ignore malformed */
      }
    };
    return () => es.close();
  }, []);
}
