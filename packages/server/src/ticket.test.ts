import { describe, expect, it } from 'vitest';
import { TICKET_MS, makeTicket, readTicket } from './ticket.ts';

describe('live-city tickets', () => {
  const t = { chog: 134, name: 'Chog #1595', gang: 'lazoor', jail: null };

  it('reads back what it signed', () => {
    expect(readTicket(makeTicket(t, 1000), 1000)).toMatchObject(t);
  });

  it('refuses an edited ticket', () => {
    const [body, mac] = makeTicket(t, 1000).split('.');
    const forged = Buffer.from(JSON.stringify({ ...t, chog: 1, exp: 99_999 })).toString('base64url');
    expect(readTicket(`${forged}.${mac}`, 1000)).toBeNull();
    expect(readTicket(`${body}.x${mac!.slice(1)}`, 1000)).toBeNull();
    expect(readTicket('nonsense', 1000)).toBeNull();
  });

  it('runs out', () => {
    expect(readTicket(makeTicket(t, 1000), 1000 + TICKET_MS + 1)).toBeNull();
  });
});
