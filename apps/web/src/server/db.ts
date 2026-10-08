import { connect, schema, type Db } from '@chog-city/server/db';
import { seedStates, setOwners } from '@chog-city/server';

// Production: DATABASE_URL is a Postgres URL. Local development can set DATABASE_URL=pglite:<dir> to get a
// throwaway in-process Postgres with the migrations applied and DEV_OWNER owning DEV_CHOGS. It only exists
// in this process: nothing touches the real database or the chain.

// Next compiles pages and route handlers as separate bundles, so a module variable would give each its own
// database. Keep the one copy on globalThis.
const g = globalThis as unknown as { __chogCityDevDb?: Promise<Db> };

async function makeDevDb(dir: string): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { readFileSync, readdirSync } = await import('node:fs');
  const { join } = await import('node:path');
  const pg = new PGlite(dir || undefined);
  const db = drizzle(pg, { schema }) as unknown as Db;
  const migrations = join(process.cwd(), '../../packages/server/drizzle');
  const applied = await pg.query<{ n: number }>(
    "select count(*)::int as n from information_schema.tables where table_name = 'events'",
  );
  if (!applied.rows[0]?.n)
    for (const f of readdirSync(migrations)
      .filter((x) => x.endsWith('.sql'))
      .sort())
      for (const stmt of readFileSync(join(migrations, f), 'utf8').split('--> statement-breakpoint'))
        if (stmt.trim()) await pg.exec(stmt);
  await seedStates(db, Date.now());
  const owner = process.env.DEV_OWNER;
  if (owner) {
    const ids = (process.env.DEV_CHOGS ?? '561,683,1061').split(',').map(Number);
    await setOwners(
      db,
      ids.map((tokenId) => ({ tokenId, owner, block: 1 })),
    );
    // Some other owners so robbing and crews have targets.
    await setOwners(
      db,
      [12, 40, 900, 1200, 1500, 1864].map((tokenId) => ({
        tokenId,
        owner: '0x000000000000000000000000000000000000dead',
        block: 1,
      })),
    );
  }
  return db;
}

/** The database for route handlers: Postgres in production, an in-process copy in local development. */
export async function db(): Promise<Db> {
  const url = process.env.DATABASE_URL ?? '';
  if (url.startsWith('pglite:')) {
    if (process.env.NODE_ENV === 'production') throw new Error('pglite is for local development only');
    g.__chogCityDevDb ??= makeDevDb(url.slice('pglite:'.length));
    return g.__chogCityDevDb;
  }
  return connect().db as unknown as Db;
}

export const isDevDb = () => (process.env.DATABASE_URL ?? '').startsWith('pglite:');
