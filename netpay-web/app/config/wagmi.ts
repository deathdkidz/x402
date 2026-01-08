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
import { defineChain } from 'viem';

// Define HyperEVM chains (not in wagmi/chains by default)
const hyperEvm = defineChain({
  id: 999,
  name: 'HyperEVM',
  nativeCurrency: { name: 'HYPE', symbol: 'HYPE', decimals: 18 },
  blockExplorers: {
    default: {
      name: 'HyperEVMScan',
      url: 'https://hyperevmscan.io',
    },
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.hyperliquid.xyz/evm'],
    },
  },
  testnet: false,
});

const hyperliquidEvmTestnet = defineChain({
  id: 998,
  name: 'HyperEVM Testnet',
  nativeCurrency: { name: 'HYPE', symbol: 'HYPE', decimals: 18 },
  blockExplorers: {
    default: {
      name: 'Purrsec Explorer',
      url: 'https://testnet.purrsec.com',
    },
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.hyperliquid-testnet.xyz/evm'],
    },
  },
  testnet: true,
});

// Get WalletConnect Project ID from https://cloud.walletconnect.com/
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '';

if (!projectId) {
  console.warn(
    'NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not set!\n' +
    'Get your free project ID from: https://cloud.walletconnect.com/\n' +
    'Then add it to your .env.local file as: NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_actual_id'
  );
}

// App metadata for mobile wallet deep linking
const appName = 'NetPay';
const appUrl = typeof window !== 'undefined' ? window.location.origin : 'https://netpay.id';

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
    appName,
    appUrl,
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
    hyperEvm,    // HyperEVM Mainnet (Chain ID 999)
    hyperliquidEvmTestnet, // HyperEVM Testnet (Chain ID 998)
  ],
  transports: {
    [base.id]: http(),
    [baseSepolia.id]: http(),
    [optimism.id]: http(),
    [optimismSepolia.id]: http(),
    [mainnet.id]: http(),
    [sepolia.id]: http(),
    [hyperEvm.id]: http('https://rpc.hyperliquid.xyz/evm'),
    [hyperliquidEvmTestnet.id]: http('https://rpc.hyperliquid-testnet.xyz/evm'),
  },
  ssr: true,
});
