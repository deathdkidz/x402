'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useDisconnect } from 'wagmi';
import { useEffect } from 'react';

interface WalletConnectProps {
  onConnected?: (address: string) => void;
  onError?: (error: Error) => void;
}

export function WalletConnect({ onConnected }: WalletConnectProps) {
  const { address, isConnected } = useAccount();

  // Notify parent when connected
  useEffect(() => {
    if (isConnected && address && onConnected) {
      onConnected(address);
    }
  }, [isConnected, address, onConnected]);

  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openChainModal,
        openConnectModal,
        mounted,
      }) => {
        const ready = mounted;
        const connected = ready && account && chain;

        return (
          <div
            {...(!ready && {
              'aria-hidden': true,
              style: {
                opacity: 0,
                pointerEvents: 'none',
                userSelect: 'none',
              },
            })}
          >
            {(() => {
              if (!connected) {
                return (
                  <button
                    onClick={openConnectModal}
                    className="px-6 py-3 font-medium rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black shadow-lg hover:shadow-xl transition-all duration-200 flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    <span>Connect Wallet</span>
                  </button>
                );
              }

              if (chain.unsupported) {
                return (
                  <button
                    onClick={openChainModal}
                    className="px-6 py-3 font-medium rounded-lg bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white shadow-lg transition-all duration-200 flex items-center gap-2"
                  >
                    Wrong Network
                  </button>
                );
              }

              return (
                <div className="flex items-center gap-2">
                  <button
                    onClick={openChainModal}
                    className="flex items-center gap-2 px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg hover:bg-neutral-700 transition-colors text-sm"
                    title="Switch network"
                  >
                    {chain.hasIcon && chain.iconUrl && (
                      <img
                        src={chain.iconUrl}
                        alt={chain.name ?? 'Chain icon'}
                        className="w-4 h-4 rounded-full"
                      />
                    )}
                    <span className="text-neutral-300 hidden sm:inline">{chain.name}</span>
                  </button>

                  <button
                    onClick={openAccountModal}
                    className="flex items-center gap-2 px-4 py-2 bg-green-500/10 border border-green-500/30 rounded-lg hover:bg-green-500/20 transition-colors"
                  >
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    <span className="text-sm font-mono text-green-400">
                      {account.displayName}
                    </span>
                  </button>
                </div>
              );
            })()}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}

// Export hook for using wallet connection state
export function useWalletConnection() {
  const { address, isConnected, status } = useAccount();
  const { disconnect } = useDisconnect();

  return {
    address,
    isConnected,
    isConnecting: status === 'connecting' || status === 'reconnecting',
    status,
    disconnect,
  };
}
