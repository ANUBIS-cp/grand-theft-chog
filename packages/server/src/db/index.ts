import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import postgres from 'postgres';
import * as schema from './schema.ts';

export * from './schema.ts';
export { schema };

/** Any Drizzle Postgres database with our schema (postgres-js in production, PGlite in tests). */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

let cached: { db: PostgresJsDatabase<typeof schema>; sql: postgres.Sql } | null = null;

export function connect(url = process.env.DATABASE_URL): {
  db: PostgresJsDatabase<typeof schema>;
  sql: postgres.Sql;
} {
  if (cached) return cached;
  if (!url) throw new Error('DATABASE_URL is not set');
  const sql = postgres(url, { max: 10, idle_timeout: 30, onnotice: () => {} });
  cached = { db: drizzle(sql, { schema }), sql };
  return cached;
}

/** Raw query rows from either driver: postgres-js returns an array, PGlite returns { rows }. */
export function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return ((result as { rows?: T[] }).rows ?? []) as T[];
}
