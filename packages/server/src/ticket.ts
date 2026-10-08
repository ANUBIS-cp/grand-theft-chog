import { createHmac, timingSafeEqual } from 'node:crypto';

// A short-lived pass from the web app to the live server: who you are walking as. The web app checks the
// wallet and the Chog; the live server only checks the signature, so it never needs the database.

export interface Ticket {
  /** Token ID, or null for a guest. */
  chog: number | null;
  name: string;
  gang: string | null;
  /** In jail until (ms), if jailed: you walk round the jail yard until then. */
  jail: number | null;
  exp: number;
}

export const TICKET_MS = 60_000;

function secret(): string {
  const s = process.env.CITY_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === 'production') throw new Error('CITY_SECRET is not set');
  return 'dev-only-city-secret';
}

const sign = (body: string) => createHmac('sha256', secret()).update(body).digest('base64url');

export function makeTicket(t: Omit<Ticket, 'exp'>, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ ...t, exp: now + TICKET_MS })).toString('base64url');
  return `${body}.${sign(body)}`;
}

export function readTicket(ticket: string, now = Date.now()): Ticket | null {
  const [body, mac] = ticket.split('.');
  if (!body || !mac) return null;
  const want = Buffer.from(sign(body));
  const got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const t = JSON.parse(Buffer.from(body, 'base64url').toString()) as Ticket;
    return t.exp > now ? t : null;
  } catch {
    return null;
  }
}
