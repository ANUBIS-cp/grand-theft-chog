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

/** A pass into a raid room on the live server: robber, defender or watcher, and the run's setup. */
export interface RaidPass {
  role: 'rob' | 'defend';
  run: string;
  chog: number;
  name: string;
  /** The robber's pass carries the run's setup, so the live server needs no database. */
  setup?: {
    map: string;
    tier: number;
    breakout: boolean;
    powers: string[];
    guards: number[];
    target: string;
    /** The break-in was loud: the alarm is ringing from the start. */
    loud?: boolean;
  };
  exp: number;
}

export const RAID_PASS_MS = 3 * 60_000;

export function makeRaidPass(p: Omit<RaidPass, 'exp'>, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ ...p, exp: now + RAID_PASS_MS })).toString('base64url');
  return `${body}.${sign('raid:' + body)}`;
}

export function readRaidPass(pass: string, now = Date.now()): RaidPass | null {
  const [body, mac] = pass.split('.');
  if (!body || !mac) return null;
  const want = Buffer.from(sign('raid:' + body));
  const got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString()) as RaidPass;
    return p.exp > now ? p : null;
  } catch {
    return null;
  }
}

/** Signs a message from the live server to the web app (a finished raid). */
export const signInternal = (body: string) => sign('internal:' + body);
export function checkInternal(body: string, mac: string | null): boolean {
  if (!mac) return false;
  const want = Buffer.from(signInternal(body));
  const got = Buffer.from(mac);
  return want.length === got.length && timingSafeEqual(want, got);
}

/**
 * A pass for the getaway: you're out of the vault with the bag and have to carry it home through the city.
 * The live server runs the chase from this alone and reports the result back, signed.
 */
export interface GetawayPass {
  run: string;
  chog: number;
  name: string;
  /** The robbed gang (where you come out) and your own gang (where you take the bag). */
  from: string;
  home: string;
  bag: number;
  tier: number;
  exp: number;
}

export const GETAWAY_PASS_MS = 5 * 60_000;

export function makeGetawayPass(p: Omit<GetawayPass, 'exp'>, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ ...p, exp: now + GETAWAY_PASS_MS })).toString('base64url');
  return `${body}.${sign('getaway:' + body)}`;
}

export function readGetawayPass(pass: string, now = Date.now()): GetawayPass | null {
  const [body, mac] = pass.split('.');
  if (!body || !mac) return null;
  const want = Buffer.from(sign('getaway:' + body));
  const got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString()) as GetawayPass;
    return p.exp > now ? p : null;
  } catch {
    return null;
  }
}
