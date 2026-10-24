import type { DistrictId, GangId } from '@chog-city/data';
import type { ChogState, GameEvent, TurfChange } from '@chog-city/game';
import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgSequence,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export type Holders = Partial<Record<DistrictId, GangId>>;

const created = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

/** Every Chog's game state. The whole state is JSON; a few fields are copied out for sorting. */
export const chogStates = pgTable(
  'chog_states',
  {
    id: integer('id').primaryKey(),
    state: jsonb('state').$type<ChogState>().notNull(),
    gang: text('gang'),
    cash: integer('cash').notNull(),
    xp: integer('xp').notNull(),
    active: boolean('active').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('chog_states_cash').on(t.cash), index('chog_states_gang').on(t.gang)],
);

/** Append-only log of everything that happened. The source of truth for the feed, turf and records. */
export const events = pgTable(
  'events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    day: integer('day').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull(),
    type: text('type').notNull(),
    chogId: integer('chog_id').notNull(),
    target: integer('target'),
    data: jsonb('data').$type<GameEvent>().notNull(),
  },
  (t) => [
    index('events_day_type').on(t.day, t.type),
    index('events_chog').on(t.chogId),
    index('events_target').on(t.target),
  ],
);

/** One row per game day: its secret seed (published after the day), and who held turf that day. */
export const days = pgTable('days', {
  day: integer('day').primaryKey(),
  seed: text('seed').notNull(),
  commitment: text('commitment').notNull(),
  holders: jsonb('holders').$type<Holders>().notNull(),
  changes: jsonb('changes').$type<TurfChange[]>().notNull(),
  revealed: boolean('revealed').notNull().default(false),
  commitTx: text('commit_tx'),
  revealTx: text('reveal_tx'),
  createdAt: created(),
});

/** Crew IDs are "<day>-<n>" with n from this sequence: public and in order (they are part of the roll label). */
export const crewSeq = pgSequence('crew_seq');

export const crews = pgTable(
  'crews',
  {
    id: text('id').primaryKey(),
    day: integer('day').notNull(),
    offerKey: text('offer_key').notNull(),
    leaderId: integer('leader_id').notNull(),
    slots: jsonb('slots').$type<(number | null)[]>().notNull(),
    jailbreakTarget: integer('jailbreak_target'),
    status: text('status').$type<'open' | 'done' | 'cancelled' | 'expired'>().notNull(),
    createdAt: created(),
  },
  (t) => [index('crews_day_status').on(t.day, t.status)],
);

/** Current owner of each Chog, kept up to date from Transfer events. Addresses are lowercase. */
export const owners = pgTable(
  'owners',
  {
    tokenId: integer('token_id').primaryKey(),
    owner: text('owner').notNull(),
    block: bigint('block', { mode: 'number' }).notNull(),
  },
  (t) => [index('owners_owner').on(t.owner)],
);

/** "Let wallet X play my Chogs", signed by the owner. */
export const delegations = pgTable(
  'delegations',
  {
    owner: text('owner').notNull(),
    player: text('player').notNull(),
    signature: text('signature').notNull(),
    createdAt: created(),
  },
  (t) => [primaryKey({ columns: [t.owner, t.player] }), index('delegations_player').on(t.player)],
);

export const authNonces = pgTable('auth_nonces', {
  nonce: text('nonce').primaryKey(),
  createdAt: created(),
});

/** Login sessions. Only a hash of the cookie value is stored. */
export const sessions = pgTable(
  'sessions',
  {
    idHash: text('id_hash').primaryKey(),
    address: text('address').notNull(),
    createdAt: created(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('sessions_address').on(t.address)],
);

/** Where each chain watcher got to. */
export const chainCursors = pgTable('chain_cursors', {
  name: text('name').primaryKey(),
  block: bigint('block', { mode: 'number' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

// ---------- The gang war (heists) ----------

/** Each gang's vault and the cash in it. Robbing moves cash from one vault to another. */
export const gangVaults = pgTable('gang_vaults', {
  gang: text('gang').$type<GangId>().primaryKey(),
  cash: integer('cash').notNull(),
  /** Extra defence a member paid for out of the vault, and until when it holds. */
  guardLevel: integer('guard_level').notNull().default(0),
  guardUntil: timestamp('guard_until', { withTimezone: true }),
  guardBy: integer('guard_by'),
  /** The last hour boundary upkeep and refill were run up to. */
  tickedAt: timestamp('ticked_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** A Chog's heist record. It belongs to the token: it moves with the Chog when it's sold. */
export const heistChogs = pgTable(
  'heist_chogs',
  {
    id: integer('id').primaryKey(),
    gang: text('gang').$type<GangId>(),
    jailedUntil: timestamp('jailed_until', { withTimezone: true }),
    stolen: integer('stolen').notNull().default(0),
    escapes: integer('escapes').notNull().default(0),
    busts: integer('busts').notNull().default(0),
    /** Robbers it caught while guarding its gang's vault. */
    catches: integer('catches').notNull().default(0),
    best: integer('best').notNull().default(0),
    lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  },
  (t) => [index('heist_chogs_gang').on(t.gang)],
);

/** One heist: created when it starts, finished when the server has replayed the inputs. */
export const heistRuns = pgTable(
  'heist_runs',
  {
    id: text('id').primaryKey(),
    chogId: integer('chog_id').notNull(),
    player: text('player').notNull(),
    gang: text('gang').$type<GangId>().notNull(),
    target: text('target').$type<GangId>().notNull(),
    day: integer('day').notNull(),
    vault: text('vault').notNull(),
    tier: integer('tier').notNull(),
    revenge: boolean('revenge').notNull().default(false),
    powers: jsonb('powers').$type<string[]>().notNull(),
    guards: jsonb('guards').$type<number[]>().notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    result: text('result').$type<'escaped' | 'busted'>(),
    carried: integer('carried'),
    score: integer('score'),
    /** Cash that moved: to the robber's gang on an escape, to the vault's gang (a fine) on a bust. */
    moved: integer('moved'),
    caughtBy: integer('caught_by'),
    /** Set on a break-out: the jailed gang-mate this run tried to free. */
    prisoner: integer('prisoner'),
    inputs: text('inputs'),
    /** The break-in's taps (stage 1); null until it's done, empty for a break-out (no lock). */
    lock: text('lock'),
    /** The break-in was loud, so the chase starts with the alarm ringing. */
    loud: boolean('loud').notNull().default(false),
    /** Stage 3: 'running' while the bag is being carried home, then 'home' or 'caught'. */
    getaway: text('getaway').$type<'running' | 'home' | 'caught'>(),
    /** When a getaway nobody reported on is banked anyway (a live server failure shouldn't cost you). */
    bagUntil: timestamp('bag_until', { withTimezone: true }),
    /** The run home, for the replay (JSON, see packages/game/src/city/track.ts). */
    getawayTrack: text('getaway_track'),
  },
  (t) => [
    index('heist_runs_chog_day').on(t.chogId, t.day),
    index('heist_runs_finished').on(t.finishedAt),
    index('heist_runs_target').on(t.target, t.finishedAt),
  ],
);

// ---------- $CHOG ----------

/**
 * $CHOG a player burned from their own wallet, one row per burn transaction, so a burn counts once. Bail frees
 * `chogId`; a Wanted poster goes on `chogId` (with one of the ready-made lines); a banner flies for `gang`.
 */
export const chogBurns = pgTable(
  'chog_burns',
  {
    tx: text('tx').primaryKey(),
    address: text('address').notNull(),
    kind: text('kind').$type<'bail' | 'poster' | 'banner'>().notNull(),
    chogId: integer('chog_id'),
    gang: text('gang').$type<GangId>(),
    line: integer('line'),
    /** Whole $CHOG burned. */
    amount: integer('amount').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    /** Posters and banners: when they come down. */
    until: timestamp('until', { withTimezone: true }),
  },
  (t) => [index('chog_burns_kind_until').on(t.kind, t.until)],
);

// ---------- usage ----------

/**
 * Who came to the city each day, once per day: a holder by wallet, a guest by a random id kept in a cookie
 * (nothing else about them). For the usage page: daily players, and how many come back.
 */
export const visits = pgTable(
  'visits',
  {
    /** Game day (see dayOf). */
    day: integer('day').notNull(),
    /** A wallet (lower case) or 'g:' + a guest's random id. */
    who: text('who').notNull(),
    holder: boolean('holder').notNull(),
    /** The Chog they walked in as (holders). */
    chogId: integer('chog_id'),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.day, t.who] })],
);

// ---------- sign-in by a send to yourself ----------

/**
 * Proving you hold a wallet without connecting it: the game names a small amount, you send exactly that much
 * MON from the wallet to itself, and the game spots it on Monad. One row per try, tied to the browser by a cookie.
 */
export const walletProofs = pgTable('wallet_proofs', {
  id: text('id').primaryKey(),
  address: text('address').notNull(),
  /** The amount to send, in wei (a decimal string). */
  amountWei: text('amount_wei').notNull(),
  /** The wallet's transaction count when the try started; it goes up when they send something. */
  nonce: integer('nonce').notNull(),
  /** The last block looked through. */
  lastBlock: bigint('last_block', { mode: 'number' }).notNull(),
  /** When the wallet was first seen sending something (ms), to tell a slow block from a wrong transfer. */
  sentAt: timestamp('sent_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  /** The self-transfer that proved it, once found. */
  tx: text('tx'),
  doneAt: timestamp('done_at', { withTimezone: true }),
});
