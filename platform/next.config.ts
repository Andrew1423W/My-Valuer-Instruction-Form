import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['postgres'],
  experimental: { serverActions: { bodySizeLimit: '15mb' } },
};

export default nextConfig;
