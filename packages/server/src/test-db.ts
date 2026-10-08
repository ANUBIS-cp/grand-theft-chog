import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { schema, type Db } from './db/index.ts';

/** A fresh in-process Postgres with our migrations applied. */
export async function testDb(): Promise<{ db: Db; pg: PGlite }> {
  const pg = new PGlite();
  const dir = new URL('../drizzle/', import.meta.url);
  for (const f of readdirSync(dir)
    .filter((x) => x.endsWith('.sql'))
    .sort())
    for (const stmt of readFileSync(new URL(f, dir), 'utf8').split('--> statement-breakpoint'))
      if (stmt.trim()) await pg.exec(stmt);
  return { db: drizzle(pg, { schema }) as unknown as Db, pg };
}
