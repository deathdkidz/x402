'use client';

import { createConfig, http } from 'wagmi';
import { 
  connectorsForWallets 
} from '@rainbow-me/rainbowkit';
import {
  coinbaseWallet,
  metaMaskWallet,
  walletConnectWallet,
  rainbowWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { mainnet, sepolia, base, baseSepolia, optimism, optimismSepolia } from 'wagmi/chains';

// Get WalletConnect Project ID from https://cloud.walletconnect.com/
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '';

if (!projectId) {
  console.warn(
    'NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not set!\n' +
    'Get your free project ID from: https://cloud.walletconnect.com/\n' +
    'Then add it to your .env.local file as: NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_actual_id'
  );
}

const connectors = connectorsForWallets(
  [
    {
      groupName: 'Recommended',
      wallets: [
        coinbaseWallet,  // Coinbase Wallet first (best for Base)
        metaMaskWallet,
        walletConnectWallet,
        rainbowWallet,
      ],
    },
  ],
  {
    appName: 'NetPay',
    projectId,
  }
);

export const config = createConfig({
  connectors,
  chains: [
    base,        // Base Mainnet (Chain ID 8453)
    baseSepolia, // Base Sepolia (Chain ID 84532)
    optimism,    // Optimism Mainnet (Chain ID 10)
    optimismSepolia, // Optimism Sepolia (Chain ID 11155420)
    mainnet,     // Ethereum Mainnet (Chain ID 1)
    sepolia,     // Ethereum Sepolia (Chain ID 11155111)
  ],
  transports: {
    [base.id]: http(),
    [baseSepolia.id]: http(),
    [optimism.id]: http(),
    [optimismSepolia.id]: http(),
    [mainnet.id]: http(),
    [sepolia.id]: http(),
  },
  ssr: true,
});
