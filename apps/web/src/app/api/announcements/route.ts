import { GANGS, displayName, getChog } from '@chog-city/data';
import { BLOOD_MOON_BONUS, dayStart, isJudging, nextBloodMoon } from '@chog-city/game';
import { pumpkinTally, wantedToday } from '@chog-city/server';
import { heistChogs, mostWanted } from '@chog-city/server/db';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { json } from '@/server/http';

export const dynamic = 'force-dynamic';

const money = (n: number) => `$${n.toLocaleString('en-US')}`;
const name = (id: number) => (getChog(id) ? displayName(getChog(id)!) : `Chog ${id}`);
const MIN = 60_000;

/**
 * What the city wants to tell the Telegram group right now, each with an id so it's posted once: the Blood Moon
 * coming up, rising, and setting (with what the pumpkins paid), and today's Most Wanted (and when they're caught).
 * Each is only in the list for a short window, so a bot that was down doesn't post old news.
 */
export async function GET() {
  const now = Date.now();
  const d = await db();
  const base = `https://${(process.env.PUBLIC_HOST ?? 'grandtheftchog.duckdns.org').split(',')[0]!.trim()}`;
  const out: { id: string; text: string }[] = [];

  // The Blood Moon: the one coming, the one up, or the one that just set. Not during judging, when it rises every
  // 20 minutes: that would be some 200 posts a day.
  const moon = nextBloodMoon(now) ?? null;
  const last = nextBloodMoon(now - 40 * MIN);
  const quiet = (m: { from: number } | null) => (m && isJudging(m.from) ? null : m);
  if (quiet(moon) && moon && now >= moon.from - 15 * MIN && now < moon.from)
    out.push({
      id: `moon-soon-${moon.from}`,
      text: `🌕 The Blood Moon rises in ${Math.ceil((moon.from - now) / MIN)} minutes.\n\nFor one hour every vault is haunted, hauls pay ${BLOOD_MOON_BONUS}% more, and pumpkins full of cash pop up all over the city. First Chog to one keeps it.\n\n${base}`,
    });
  if (quiet(moon) && moon && now >= moon.from && now < moon.from + 10 * MIN)
    out.push({
      id: `moon-up-${moon.from}`,
      text: `🩸 The Blood Moon is up. One hour: haunted vaults, +${BLOOD_MOON_BONUS}% hauls, and the pumpkins are out.\n\n${base}`,
    });
  if (quiet(last) && last && now >= last.to && now < last.to + 30 * MIN) {
    const t = await pumpkinTally(d, last.from, last.to);
    if (t.count) {
      const lines = [
        `🎃 ${t.count} pumpkin${t.count === 1 ? '' : 's'} grabbed, ${money(t.total)} in all${t.gold ? ` (${t.gold} gold)` : ''}.`,
        t.gangs[0] && `Top gang: ${GANGS[t.gangs[0].gang].name}, ${money(t.gangs[0].cash)}.`,
        t.best && `Best hunter: ${name(t.best.chog)}, ${t.best.n} pumpkin${t.best.n === 1 ? '' : 's'}.`,
      ].filter(Boolean);
      out.push({
        id: `moon-over-${last.from}`,
        text: `The Blood Moon has set.\n\n${lines.join('\n')}\n\nSame time tomorrow, 18:00 UTC.`,
      });
    }
  }

  // Most Wanted: announced in the day's first three hours; caught, within half an hour.
  const w = await wantedToday(d, now);
  if (w) {
    const [row] = await d.select().from(mostWanted).where(eq(mostWanted.day, w.day));
    if (w.claimedBy === null && now < dayStart(w.day) + 3 * 60 * MIN)
      out.push({
        id: `wanted-${w.day}`,
        text: `🎯 Today's Most Wanted: ${name(w.chog)} of ${GANGS[w.gang].name}.\n\nThey stole ${money(w.stole)} yesterday. ${money(w.bounty)} to any rival who tags them in the city.\n\n${base}`,
      });
    if (w.claimedBy !== null && row?.claimedAt && now - row.claimedAt.getTime() < 30 * MIN) {
      const [by] = await d
        .select({ gang: heistChogs.gang })
        .from(heistChogs)
        .where(eq(heistChogs.id, w.claimedBy));
      out.push({
        id: `wanted-caught-${w.day}`,
        text: `🎯 Caught! ${name(w.claimedBy)}${by?.gang ? ` of ${GANGS[by.gang].name}` : ''} tagged Most Wanted ${name(w.chog)} of ${GANGS[w.gang].name} and took the ${money(w.bounty)} bounty.`,
      });
    }
  }
  return json({ ok: true, announcements: out });
}
