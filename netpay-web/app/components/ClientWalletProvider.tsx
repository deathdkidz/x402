'use client';

import { type ReactNode, useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import the actual wallet provider to avoid SSR issues with WalletConnect/AppKit
const WalletProviderInner = dynamic(
  () => import('./WalletProviderInner').then((mod) => mod.WalletProviderInner),
  { 
    ssr: false,
    loading: () => null 
  }
);

interface ClientWalletProviderProps {
  children: ReactNode;
}

export function ClientWalletProvider({ children }: ClientWalletProviderProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // During SSR, just render children without wallet context
  if (!mounted) {
    return <>{children}</>;
  }

  return <WalletProviderInner>{children}</WalletProviderInner>;
}

export default ClientWalletProvider;
