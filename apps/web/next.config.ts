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
  devIndicators: false,
  // Stickers never change under the same name (their links carry a version), so phones keep them instead of
  // asking again every time the picker opens.
  async headers() {
    return [
      {
        source: '/art/stickers/:file*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ];
  },
  // Images live on the server; in local development, fetch them from there.
  async rewrites() {
    return process.env.NODE_ENV === 'development'
      ? [{ source: '/img/:path*', destination: 'https://chogcity.35-212-31-75.sslip.io/img/:path*' }]
      : [];
  },
};

export default config;
