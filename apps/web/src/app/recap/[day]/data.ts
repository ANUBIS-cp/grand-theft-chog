import { GANGS, displayName, getChog } from '@chog-city/data';
import { dayOf } from '@chog-city/game';
import { dayRecap, type DayRecap } from '@chog-city/server';
import { db } from '@/server/db';

export const money = (n: number) => `$${n.toLocaleString('en-US')}`;
export const chogName = (id: number) => (getChog(id) ? displayName(getChog(id)!) : `Chog ${id}`);
export const dayLabel = (start: number) =>
  new Date(start).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });

/** A finished day's recap, or null for a day that hasn't happened or isn't over. */
export async function recapFor(raw: string): Promise<DayRecap | null> {
  const day = Number(raw);
  if (!Number.isInteger(day) || day < 0 || day >= dayOf(Date.now())) return null;
  return dayRecap(await db(), day);
}

/** The day in a few plain lines (the page, the share picture and the Telegram post all use these). */
export function recapLines(r: DayRecap): string[] {
  if (!r.robberies && !r.breakouts.tried) return ['A quiet night. Nobody robbed anybody.'];
  const out = [
    `${r.robberies} ${r.robberies === 1 ? 'robbery' : 'robberies'}: ${r.home} got the bag home, ${r.caught} got caught.`,
  ];
  if (r.biggest)
    out.push(
      `Biggest haul: ${chogName(r.biggest.chog)} of ${GANGS[r.biggest.gang].name} took ${money(r.biggest.cash)} from ${GANGS[r.biggest.target].name}.`,
    );
  if (r.hardestHit)
    out.push(
      `${GANGS[r.hardestHit.gang].name} lost the most: ${money(r.hardestHit.lost)} in ${r.hardestHit.times} ${r.hardestHit.times === 1 ? 'robbery' : 'robberies'}.`,
    );
  if (r.catcher)
    out.push(
      `Best guard: ${chogName(r.catcher.chog)} caught ${r.catcher.catches} ${r.catcher.catches === 1 ? 'robber' : 'robbers'}.`,
    );
  if (r.breakouts.tried)
    out.push(`Jail: ${r.breakouts.freed} of ${r.breakouts.tried} break-outs got someone out.`);
  if (r.burned) out.push(`${r.burned.toLocaleString('en-US')} $CHOG burned.`);
  return out;
}
