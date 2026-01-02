import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  serverExternalPackages: [
    'pino',
    'pino-pretty',
    'thread-stream',
    '@walletconnect/ethereum-provider',
    '@walletconnect/universal-provider',
  ],
  turbopack: {},
};

export default nextConfig;
