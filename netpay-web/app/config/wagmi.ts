// Ensure this module is client-only to avoid initializing WalletConnect/AppKit on the server
'use client';

import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { mainnet, sepolia, base, baseSepolia, optimism, optimismSepolia } from 'wagmi/chains';

// Get WalletConnect Project ID from https://cloud.walletconnect.com/
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

if (!projectId) {
  // Don't throw at import-time to avoid server build/runtime issues.
  // Warn so developers know to set the env var for WalletConnect features.
  // WalletConnect functionality will be disabled until a valid projectId is provided.
  // Keep this module client-only; it should only run in the browser.
  // eslint-disable-next-line no-console
  console.warn(
    'NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not set. WalletConnect features will be disabled.'
  );
}

const projectIdStr: string = projectId ?? '';

export const config = getDefaultConfig({
  appName: 'NetPay',
  projectId: projectIdStr,
  chains: [
    base,        // Base Mainnet (Chain ID 8453)
    baseSepolia, // Base Sepolia (Chain ID 84532)
    optimism,    // Optimism Mainnet (Chain ID 10)
    optimismSepolia, // Optimism Sepolia (Chain ID 11155420)
    mainnet,     // Ethereum Mainnet (Chain ID 1)
    sepolia,     // Ethereum Sepolia (Chain ID 11155111)
  ],
  // Disable SSR to avoid pulling WalletConnect/AppKit into server bundles
  // (WalletConnect is client-only functionality and should run in the browser).
  ssr: false,
});
