'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import { config } from '@/app/config/wagmi';
import '@rainbow-me/rainbowkit/styles.css';
import { type ReactNode, useState, useEffect } from 'react';

interface WalletProviderProps {
  children: ReactNode;
  cookies?: string | null;
}

export function WalletProvider({ children }: WalletProviderProps) {
  // Track if we're mounted (client-side) to avoid SSR issues with WalletConnect/AppKit
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Create QueryClient in state to ensure it's created once per component instance
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  }));

  // During SSR, render children without wallet providers to avoid AppKit initialization errors
  if (!mounted) {
    return <>{children}</>;
  }

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

export default WalletProvider;
