import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Enables compact runtime images via `next start` / Docker standalone output.
  output: 'standalone',
  transpilePackages: ['@thelastheart/contracts'],
};

export default nextConfig;
