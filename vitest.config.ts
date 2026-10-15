import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.ts', 'tools/*/src/**/*.test.ts'],
    // The database tests start a fresh in-memory Postgres; on a cold first run that can pass 5 s.
    testTimeout: 20_000,
  },
});
