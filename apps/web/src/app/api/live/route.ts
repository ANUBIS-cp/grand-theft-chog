import { subscribe } from '@/server/live';

export const dynamic = 'force-dynamic';

/** Server-sent events: every move in the city, as it happens. */
export async function GET(req: Request) {
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let ping: ReturnType<typeof setInterval> | null = null;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (s: string) => {
        try {
          controller.enqueue(encoder.encode(s));
        } catch {
          /* closed */
        }
      };
      send('retry: 3000\n\n');
      unsubscribe = await subscribe((payload) => send(`data: ${payload}\n\n`));
      ping = setInterval(() => send(': ping\n\n'), 25_000);
      req.signal.addEventListener('abort', () => {
        unsubscribe?.();
        if (ping) clearInterval(ping);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel() {
      unsubscribe?.();
      if (ping) clearInterval(ping);
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
