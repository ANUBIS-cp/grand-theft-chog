import type { NextConfig } from 'next';
import { fileURLToPath } from 'node:url';

const config: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  transpilePackages: ['@chog-city/data', '@chog-city/game', '@chog-city/server'],
  serverExternalPackages: ['postgres'],
  poweredByHeader: false,
  reactStrictMode: true,
};

export default config;
