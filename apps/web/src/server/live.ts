import { connect } from '@chog-city/server/db';

type Listener = (payload: string) => void;
const listeners = new Set<Listener>();
let started: Promise<void> | null = null;

/** One LISTEN connection for the whole process; every open live-feed stream gets each message. */
function start(): Promise<void> {
  started ??= connect()
    .sql.listen('city', (payload) => {
      for (const l of listeners) l(payload);
    })
    .then(() => undefined)
    .catch((e) => {
      started = null;
      throw e;
    });
  return started;
}

export async function subscribe(l: Listener): Promise<() => void> {
  await start();
  listeners.add(l);
  return () => listeners.delete(l);
}

export function listenerCount(): number {
  return listeners.size;
}
