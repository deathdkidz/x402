'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import { config } from '@/app/config/wagmi';
import '@rainbow-me/rainbowkit/styles.css';
import { type ReactNode, useState } from 'react';

interface WalletProviderProps {
  children: ReactNode;
  cookies?: string | null;
}

export function WalletProvider({ children }: WalletProviderProps) {
  // Create QueryClient in state to ensure it's created once per component instance
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  }));

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider 
          theme={darkTheme({
            accentColor: '#f59e0b', // amber-500
            accentColorForeground: 'black',
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
