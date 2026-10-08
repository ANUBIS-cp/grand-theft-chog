import type { NextConfig } from 'next';
import { fileURLToPath } from 'node:url';

const config: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  transpilePackages: ['@chog-city/data', '@chog-city/game', '@chog-city/server'],
  serverExternalPackages: ['postgres', '@electric-sql/pglite', 'sharp'],
  poweredByHeader: false,
  agentRules: false,
  reactStrictMode: true,
  // Images live on the server; in local development, fetch them from there.
  async rewrites() {
    return process.env.NODE_ENV === 'development'
      ? [{ source: '/img/:path*', destination: 'https://chogcity.35-212-31-75.sslip.io/img/:path*' }]
      : [];
  },
};

export default config;
