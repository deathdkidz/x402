'use client';

import { WagmiProvider, createConfig, http } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { 
  RainbowKitProvider, 
  darkTheme,
  connectorsForWallets 
} from '@rainbow-me/rainbowkit';
import {
  metaMaskWallet,
  coinbaseWallet,
  walletConnectWallet,
  rainbowWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { baseSepolia, sepolia, base, mainnet, optimism, optimismSepolia } from 'wagmi/chains';
import { defineChain } from 'viem';
import '@rainbow-me/rainbowkit/styles.css';

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

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '';

if (!projectId) {
  console.warn(
    'NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not set!\n' +
    'WalletConnect will not work without a valid project ID.\n' +
    'Get your free project ID from: https://cloud.walletconnect.com/'
  );
}

// App metadata for mobile wallet deep linking
const appName = 'X-402 Protocol Demo';
const appUrl = typeof window !== 'undefined' ? window.location.origin : 'https://demo.netpay.id';

const connectors = connectorsForWallets(
  [
    {
      groupName: 'Recommended',
      wallets: [
        coinbaseWallet,
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

const config = createConfig({
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

const queryClient = new QueryClient();

export default function Web3Provider({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: '#06b6d4',
            accentColorForeground: 'white',
            borderRadius: 'medium',
            fontStack: 'system',
          })}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
