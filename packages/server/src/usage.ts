import { dayOf, dayStart } from '@chog-city/game';
import { sql } from 'drizzle-orm';
import { visits, type Db } from './db/index.ts';

// Usage numbers for the owner's page and the hackathon's "usage data": who comes, who comes back, what they
// do. Everything is counted from the game's own tables; nothing is sent anywhere.

/** Notes a visit to the city (once per person per day; later visits that day do nothing). */
export async function noteVisit(
  db: Db,
  v: { who: string; holder: boolean; chogId: number | null; now: number },
): Promise<void> {
  await db
    .insert(visits)
    .values({ day: dayOf(v.now), who: v.who, holder: v.holder, chogId: v.chogId, at: new Date(v.now) })
    .onConflictDoNothing();
}

export interface UsageDay {
  day: number;
  /** When the day starts (ms). */
  start: number;
  holders: number;
  guests: number;
  chogs: number;
  robberies: number;
  escaped: number;
  busted: number;
  getawaysHome: number;
  getawaysCaught: number;
  breakouts: number;
}

export interface Usage {
  holdersEver: number;
  guestsEver: number;
  chogsEver: number;
  /** Of the people who came on a day, how many came again the next day / within the next 7 days. */
  backNextDay: { of: number; back: number };
  backInAWeek: { of: number; back: number };
  robberiesEver: number;
  chogsInGangs: number;
  gangs: { gang: string; members: number }[];
  burns: { kind: string; n: number; chog: number }[];
  days: UsageDay[];
}

const n = (v: unknown) => Number(v ?? 0);
const rows = <T>(r: unknown) => ((r as { rows?: T[] }).rows ?? (r as T[])) as T[];

export async function usage(db: Db, now = Date.now(), last = 14): Promise<Usage> {
  const today = dayOf(now);
  const from = today - last + 1;
  const ever = rows<{ holders: number; guests: number; chogs: number }>(
    await db.execute(sql`
      select count(distinct who) filter (where holder) as holders,
             count(distinct who) filter (where not holder) as guests,
             count(distinct chog_id) as chogs
      from visits`),
  )[0];
  const back = (gap: number) => sql`
    select count(*) as of, count(*) filter (where exists (
      select 1 from visits w where w.who = v.who and w.day > v.day and w.day <= v.day + ${gap})) as back
    from visits v where v.day < ${today - gap}`; // only days whose next `gap` days are over
  const next = rows<{ of: number; back: number }>(await db.execute(back(1)))[0];
  const week = rows<{ of: number; back: number }>(await db.execute(back(7)))[0];
  const perDay = rows<Record<string, number>>(
    await db.execute(sql`
      select day,
             count(*) filter (where holder) as holders,
             count(*) filter (where not holder) as guests,
             count(distinct chog_id) as chogs
      from visits where day >= ${from} group by day`),
  );
  const runs = rows<Record<string, number>>(
    await db.execute(sql`
      select floor((extract(epoch from started_at) * 1000 - ${dayStart(0)}) / 86400000)::int as day,
             count(*) filter (where prisoner is null) as robberies,
             count(*) filter (where prisoner is null and result = 'escaped') as escaped,
             count(*) filter (where prisoner is null and result = 'busted') as busted,
             count(*) filter (where getaway = 'home') as home,
             count(*) filter (where getaway = 'caught') as caught,
             count(*) filter (where prisoner is not null) as breakouts
      from heist_runs where started_at >= ${new Date(dayStart(from)).toISOString()}::timestamptz group by 1`),
  );
  const totals = rows<{ runs: number; ganged: number }>(
    await db.execute(sql`
      select (select count(*) from heist_runs where prisoner is null) as runs,
             (select count(*) from heist_chogs where gang is not null) as ganged`),
  )[0];
  const gangs = rows<{ gang: string; members: number }>(
    await db.execute(sql`
      select gang, count(*)::int as members from heist_chogs where gang is not null
      group by gang order by members desc, gang`),
  );
  const burns = rows<{ kind: string; n: number; chog: number }>(
    await db.execute(sql`
      select kind, count(*)::int as n, coalesce(sum(amount), 0)::int as chog from chog_burns group by kind`),
  );
  const days: UsageDay[] = [];
  for (let d = today; d >= from; d--) {
    const v = perDay.find((r) => n(r.day) === d);
    const r = runs.find((x) => n(x.day) === d);
    days.push({
      day: d,
      start: dayStart(d),
      holders: n(v?.holders),
      guests: n(v?.guests),
      chogs: n(v?.chogs),
      robberies: n(r?.robberies),
      escaped: n(r?.escaped),
      busted: n(r?.busted),
      getawaysHome: n(r?.home),
      getawaysCaught: n(r?.caught),
      breakouts: n(r?.breakouts),
    });
  }
  return {
    holdersEver: n(ever?.holders),
    guestsEver: n(ever?.guests),
    chogsEver: n(ever?.chogs),
    backNextDay: { of: n(next?.of), back: n(next?.back) },
    backInAWeek: { of: n(week?.of), back: n(week?.back) },
    robberiesEver: n(totals?.runs),
    chogsInGangs: n(totals?.ganged),
    gangs: gangs.map((g) => ({ gang: g.gang, members: n(g.members) })),
    burns: burns.map((b) => ({ kind: b.kind, n: n(b.n), chog: n(b.chog) })),
    days,
  };
}
