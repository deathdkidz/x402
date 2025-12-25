'use client';

import { createConfig, http, WagmiProvider, CreateConnectorFn } from 'wagmi';
import { base, baseSepolia, mainnet, sepolia, optimism, optimismSepolia } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';
import { injected, walletConnect, coinbaseWallet, safe } from 'wagmi/connectors';

// HyperEVM chain definition
const hyperEVM = {
  id: 999,
  name: 'HyperEVM',
  nativeCurrency: {
    name: 'HYPE',
    symbol: 'HYPE',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.hyperliquid.xyz/evm'],
      webSocket: ['wss://rpc.hyperliquid.xyz/evm'],
    },
  },
  blockExplorers: {
    default: {
      name: 'HyperEVM Explorer',
      url: 'https://explorer.hyperliquid.xyz',
    },
  },
  testnet: false,
} as const;

const hyperEVMTestnet = {
  id: 998,
  name: 'HyperEVM Testnet',
  nativeCurrency: {
    name: 'HYPE',
    symbol: 'HYPE',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.hyperliquid-testnet.xyz/evm'],
      webSocket: ['wss://rpc.hyperliquid-testnet.xyz/evm'],
    },
  },
  blockExplorers: {
    default: {
      name: 'HyperEVM Testnet Explorer',
      url: 'https://explorer.hyperliquid-testnet.xyz',
    },
  },
  testnet: true,
} as const;

// All supported chains
const chains = [
  base, 
  baseSepolia, 
  mainnet, 
  sepolia, 
  optimism, 
  optimismSepolia,
  hyperEVM,
  hyperEVMTestnet,
] as const;

// WalletConnect project ID - should be set in env
const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '';

// Connectors configuration
const connectors: CreateConnectorFn[] = [
  // Injected wallets (MetaMask, Brave, etc.)
  injected({
    shimDisconnect: true,
  }),
];

// Only add WalletConnect if project ID is available
if (walletConnectProjectId) {
  connectors.push(
    walletConnect({
      projectId: walletConnectProjectId,
      metadata: {
        name: 'NetPay',
        description: 'x402 Payment Protocol Dashboard',
        url: typeof window !== 'undefined' ? window.location.origin : 'https://netpay.io',
        icons: ['/logo.png'],
      },
      showQrModal: true,
    })
  );
}

// Coinbase Wallet
connectors.push(
  coinbaseWallet({
    appName: 'NetPay',
    appLogoUrl: '/logo.png',
  })
);

// Safe (Gnosis Safe)
connectors.push(
  safe({
    allowedDomains: [/gnosis-safe.io$/, /app.safe.global$/],
    debug: false,
  })
);

// Create wagmi config with connectors
const config = createConfig({
  chains,
  connectors,
  transports: {
    [base.id]: http(),
    [baseSepolia.id]: http(),
    [mainnet.id]: http(),
    [sepolia.id]: http(),
    [optimism.id]: http(),
    [optimismSepolia.id]: http(),
    [hyperEVM.id]: http('https://rpc.hyperliquid.xyz/evm'),
    [hyperEVMTestnet.id]: http('https://rpc.hyperliquid-testnet.xyz/evm'),
  },
  ssr: true, // Enable SSR support for Next.js
});

// Export config for use in other components
export { config };

// Export chain list for use in other components
export const supportedChains = chains;

export function Web3Provider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        // With SSR, we usually want to set some default staleTime
        // above 0 to avoid refetching immediately on the client
        staleTime: 60 * 1000,
        refetchOnWindowFocus: false,
      },
    },
  }));
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
