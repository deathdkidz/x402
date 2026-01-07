import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  serverExternalPackages: [
    'pino',
    'pino-pretty',
    'thread-stream',
  ],
  turbopack: {},
  webpack: (config) => {
    config.externals.push('pino-pretty', 'lokijs', 'encoding');
    return config;
  },
};

export default nextConfig;
