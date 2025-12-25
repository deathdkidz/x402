'use client';

import { useState, useCallback, useEffect } from 'react';
import { useConnect, useAccount, useDisconnect, Connector } from 'wagmi';
import { supportedChains } from './Web3Provider';

interface WalletOption {
  id: string;
  name: string;
  icon: string;
  connector: Connector;
}

interface WalletConnectProps {
  onConnected?: (address: string) => void;
  onError?: (error: Error) => void;
  buttonClassName?: string;
  modalClassName?: string;
}

export function WalletConnect({
  onConnected,
  onError,
  buttonClassName = '',
  modalClassName = '',
}: WalletConnectProps) {
  const { connectors, connect, isPending, error } = useConnect();
  const { address, isConnected, isConnecting } = useAccount();
  const { disconnect } = useDisconnect();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedConnector, setSelectedConnector] = useState<string | null>(null);

  // Notify parent when connected
  useEffect(() => {
    if (isConnected && address && onConnected) {
      onConnected(address);
    }
  }, [isConnected, address, onConnected]);

  // Handle errors
  useEffect(() => {
    if (error && onError) {
      onError(error);
    }
  }, [error, onError]);

  // Get wallet icon based on connector name
  const getWalletIcon = (connector: Connector): string => {
    const name = connector.name.toLowerCase();
    if (name.includes('metamask')) return '🦊';
    if (name.includes('coinbase')) return '🔵';
    if (name.includes('walletconnect')) return '🔗';
    if (name.includes('safe')) return '🔐';
    if (name.includes('injected')) return '💉';
    return '👛';
  };

  // Format connector name for display
  const formatConnectorName = (connector: Connector): string => {
    if (connector.name === 'Injected') {
      // Try to detect the actual wallet
      if (typeof window !== 'undefined') {
        if (window.ethereum?.isMetaMask) return 'MetaMask';
        if ((window.ethereum as any)?.isBraveWallet) return 'Brave Wallet';
        if ((window.ethereum as any)?.isRabby) return 'Rabby';
      }
      return 'Browser Wallet';
    }
    return connector.name;
  };

  // Get available wallets
  const wallets: WalletOption[] = connectors
    .filter(connector => connector.id !== 'injected' || typeof window !== 'undefined' && window.ethereum)
    .map(connector => ({
      id: connector.id,
      name: formatConnectorName(connector),
      icon: getWalletIcon(connector),
      connector,
    }));

  const handleConnect = useCallback(async (connector: Connector) => {
    setSelectedConnector(connector.id);
    try {
      await connect({ connector });
      setIsModalOpen(false);
    } catch (err) {
      console.error('Connection failed:', err);
    }
    setSelectedConnector(null);
  }, [connect]);

  const handleDisconnect = useCallback(async () => {
    await disconnect();
  }, [disconnect]);

  // Truncate address for display
  const truncateAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 px-4 py-2 bg-green-500/10 border border-green-500/30 rounded-lg">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span className="text-sm font-mono text-green-400">
            {truncateAddress(address)}
          </span>
        </div>
        <button
          onClick={handleDisconnect}
          className="px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-700/50 rounded-lg transition-colors"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Connect Button */}
      <button
        onClick={() => setIsModalOpen(true)}
        disabled={isConnecting || isPending}
        className={`
          px-6 py-3 font-medium rounded-lg transition-all duration-200
          ${isConnecting || isPending 
            ? 'bg-gray-600 text-gray-300 cursor-not-allowed' 
            : 'bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white shadow-lg hover:shadow-xl'
          }
          ${buttonClassName}
        `}
      >
        {isConnecting || isPending ? (
          <span className="flex items-center gap-2">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Connecting...
          </span>
        ) : (
          'Connect Wallet'
        )}
      </button>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setIsModalOpen(false)}
          />
          
          {/* Modal Content */}
          <div className={`
            relative z-10 w-full max-w-md mx-4 p-6
            bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl
            ${modalClassName}
          `}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">Connect Wallet</h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="text-sm text-gray-400 mb-6">
              Select a wallet to connect to NetPay
            </p>

            {/* Wallet Options */}
            <div className="space-y-3">
              {wallets.map((wallet) => (
                <button
                  key={wallet.id}
                  onClick={() => handleConnect(wallet.connector)}
                  disabled={isPending && selectedConnector === wallet.id}
                  className={`
                    w-full flex items-center gap-4 p-4
                    bg-gray-800/50 hover:bg-gray-800 border border-gray-700 hover:border-gray-600
                    rounded-xl transition-all duration-200
                    ${isPending && selectedConnector === wallet.id ? 'opacity-50 cursor-not-allowed' : ''}
                  `}
                >
                  <span className="text-3xl">{wallet.icon}</span>
                  <span className="flex-1 text-left">
                    <span className="block text-white font-medium">{wallet.name}</span>
                    {isPending && selectedConnector === wallet.id && (
                      <span className="block text-sm text-blue-400">Connecting...</span>
                    )}
                  </span>
                  {isPending && selectedConnector === wallet.id ? (
                    <svg className="animate-spin h-5 w-5 text-blue-400" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  )}
                </button>
              ))}
            </div>

            {/* Error Display */}
            {error && (
              <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-sm text-red-400">
                  {error.message || 'Connection failed. Please try again.'}
                </p>
              </div>
            )}

            {/* Supported Networks */}
            <div className="mt-6 pt-4 border-t border-gray-700">
              <p className="text-xs text-gray-500 mb-2">Supported Networks:</p>
              <div className="flex flex-wrap gap-2">
                {supportedChains.map((chain) => (
                  <span
                    key={chain.id}
                    className="px-2 py-1 text-xs bg-gray-800 text-gray-400 rounded-full"
                  >
                    {chain.name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Export a hook for using wallet connection state
export function useWalletConnection() {
  const { address, isConnected, isConnecting, chain } = useAccount();
  const { disconnect } = useDisconnect();
  
  return {
    address,
    isConnected,
    isConnecting,
    chain,
    disconnect,
  };
}
