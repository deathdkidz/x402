'use client';

import { createConfig, http, WagmiProvider } from 'wagmi';
import { base, baseSepolia, mainnet, sepolia, optimism, optimismSepolia } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';

// Create wagmi config
const config = createConfig({
  chains: [base, baseSepolia, mainnet, sepolia, optimism, optimismSepolia],
  transports: {
    [base.id]: http(),
    [baseSepolia.id]: http(),
    [mainnet.id]: http(),
    [sepolia.id]: http(),
    [optimism.id]: http(),
    [optimismSepolia.id]: http(),
  },
});

export function Web3Provider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
