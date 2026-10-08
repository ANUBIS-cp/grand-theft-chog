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
