// Applies migrations in ./drizzle. Run on deploy: npm run db:migrate -w @chog-city/server
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { connect } from './index.ts';

const { db, sql } = connect();
await migrate(db, { migrationsFolder: new URL('../../drizzle', import.meta.url).pathname });
await sql.end();
console.log('migrations applied');
