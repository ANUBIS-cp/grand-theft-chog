import { GANGS, displayName, getChog, type GangId } from '@chog-city/data';
import { and, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import webpush from 'web-push';
import { delegations, heistChogs, owners, pushSubs, type Db } from './db/index.ts';

// Raid alerts on your phone: when a rival breaks into your gang's vault, every phone that asked to be told
// gets a notification, and a tap opens the city at that robbery so you can jump in and guard. Keys come from
// VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY in /etc/chog-city/app.env; without them (local, tests) nothing is sent.

/** At most one alert per phone in this long, so a busy night doesn't buzz you nonstop. */
export const PUSH_GAP_MS = 10 * 60_000;

export interface PushMessage {
  title: string;
  body: string;
  /** Where a tap takes you. */
  url: string;
  /** Alerts with the same tag replace each other instead of piling up. */
  tag: string;
}
export interface PushSub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}
/** Sends one alert; `gone` means the phone has unsubscribed and the row can go. */
export type PushSender = (sub: PushSub, payload: string) => Promise<{ gone: boolean }>;

let sender: PushSender | null | undefined;
function defaultSender(): PushSender | null {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const key = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !key) return null;
  const host = (process.env.PUBLIC_HOST ?? 'grandtheftchog.duckdns.org').split(',')[0]!.trim();
  webpush.setVapidDetails(`https://${host}`, pub, key);
  return async (sub, payload) => {
    try {
      await webpush.sendNotification(sub, payload, { TTL: 300, urgency: 'high' });
      return { gone: false };
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      return { gone: code === 404 || code === 410 };
    }
  };
}
/** Tests swap the sender for one that records what would have gone out. */
export function setPushSender(s: PushSender | null) {
  sender = s;
}
const send = () => (sender === undefined ? (sender = defaultSender()) : sender);

export const pushPublicKey = () => process.env.VAPID_PUBLIC_KEY ?? null;

export async function savePushSub(db: Db, address: string, sub: PushSub): Promise<void> {
  const row = { endpoint: sub.endpoint, address: address.toLowerCase(), p256dh: sub.keys.p256dh, auth: sub.keys.auth };
  await db.insert(pushSubs).values(row).onConflictDoUpdate({ target: pushSubs.endpoint, set: row });
}

export async function dropPushSub(db: Db, address: string, endpoint: string): Promise<void> {
  await db.delete(pushSubs).where(and(eq(pushSubs.endpoint, endpoint), eq(pushSubs.address, address.toLowerCase())));
}

export async function hasPushSub(db: Db, address: string, endpoint: string): Promise<boolean> {
  const [row] = await db
    .select({ e: pushSubs.endpoint })
    .from(pushSubs)
    .where(and(eq(pushSubs.endpoint, endpoint), eq(pushSubs.address, address.toLowerCase())));
  return !!row;
}

async function deliver(db: Db, rows: (typeof pushSubs.$inferSelect)[], msg: PushMessage, now: number): Promise<number> {
  const out = send();
  if (!out || !rows.length) return 0;
  const payload = JSON.stringify(msg);
  let sent = 0;
  await Promise.all(
    rows.map(async (r) => {
      const { gone } = await out({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } }, payload);
      if (gone) await db.delete(pushSubs).where(eq(pushSubs.endpoint, r.endpoint));
      else {
        sent++;
        await db.update(pushSubs).set({ lastSentAt: new Date(now) }).where(eq(pushSubs.endpoint, r.endpoint));
      }
    }),
  );
  return sent;
}

/** Wallets that hold or play a Chog in this gang. */
function members(db: Db, gang: GangId) {
  const holders = db
    .select({ a: owners.owner })
    .from(owners)
    .innerJoin(heistChogs, eq(heistChogs.id, owners.tokenId))
    .where(eq(heistChogs.gang, gang));
  const players = db
    .select({ a: delegations.player })
    .from(delegations)
    .innerJoin(owners, eq(owners.owner, delegations.owner))
    .innerJoin(heistChogs, eq(heistChogs.id, owners.tokenId))
    .where(eq(heistChogs.gang, gang));
  return holders.union(players);
}

/**
 * A rival is inside a gang's vault: tell that gang's members (not the robber), each phone at most once every
 * PUSH_GAP_MS. Returns how many alerts went out.
 */
export async function notifyRaid(
  db: Db,
  { target, gang, chogId, robber, runId, now }: { target: GangId; gang: GangId; chogId: number; robber: string; runId: string; now: number },
): Promise<number> {
  if (!send()) return 0;
  const wallets = (await members(db, target)).map((r) => r.a.toLowerCase()).filter((a) => a !== robber.toLowerCase());
  if (!wallets.length) return 0;
  const rows = await db
    .select()
    .from(pushSubs)
    .where(
      and(
        inArray(pushSubs.address, wallets),
        or(isNull(pushSubs.lastSentAt), lt(pushSubs.lastSentAt, new Date(now - PUSH_GAP_MS))),
      ),
    );
  const chog = getChog(chogId);
  return deliver(
    db,
    rows,
    {
      title: `${GANGS[target].name}'s vault is being robbed`,
      body: `${chog ? displayName(chog) : 'A Chog'} of ${GANGS[gang].name} is inside right now. Tap to jump in and stop them.`,
      url: `/play?raid=${encodeURIComponent(runId)}`,
      tag: `raid-${target}`,
    },
    now,
  );
}

/** "Send me a test alert": every phone of this wallet, right away (the gap doesn't apply). */
export async function testPush(db: Db, address: string, now: number): Promise<number> {
  const rows = await db.select().from(pushSubs).where(eq(pushSubs.address, address.toLowerCase()));
  return deliver(
    db,
    rows,
    {
      title: 'Raid alerts are on',
      body: "This is what an alert looks like. When someone robs your gang's vault, you'll get one, and a tap takes you there.",
      url: '/play',
      tag: 'test',
    },
    now,
  );
}

/** How many phones have alerts on (for the owner's usage page). */
export async function pushCount(db: Db): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(pushSubs);
  return r?.n ?? 0;
}
