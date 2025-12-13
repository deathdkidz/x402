'use client';

import { useState, useEffect } from 'react';
import { useAccount, useSignTypedData } from 'wagmi';
import Link from 'next/link';
import WalletConnect from '../components/WalletConnect';

// Helper function to get block explorer URL
const getExplorerUrl = (network: string, txHash: string): string => {
  if (!txHash || !network) {
    console.warn('Missing txHash or network:', { network, txHash });
    return '';
  }
  
  // Normalize network name (handle both "base-sepolia" and "Base Sepolia" formats)
  const normalizedNetwork = network.toLowerCase().replace(/\s+/g, '-');
  
  const explorers: Record<string, string> = {
    'ethereum': 'https://etherscan.io/tx/',
    'ethereum-sepolia': 'https://sepolia.etherscan.io/tx/',
    'base': 'https://basescan.org/tx/',
    'base-sepolia': 'https://sepolia.basescan.org/tx/',
    'polygon': 'https://polygonscan.com/tx/',
    'polygon-amoy': 'https://amoy.polygonscan.com/tx/',
    'optimism': 'https://optimistic.etherscan.io/tx/',
    'optimism-sepolia': 'https://sepolia-optimism.etherscan.io/tx/',
    'arbitrum': 'https://arbiscan.io/tx/',
    'arbitrum-sepolia': 'https://sepolia.arbiscan.io/tx/',
    'hyperevm': 'https://hyperevmscan.io/tx/',
    'hyperevm-testnet': 'https://testnet.purrsec.com/tx/',
  };
  
  const explorerUrl = explorers[normalizedNetwork];
  if (!explorerUrl) {
    console.warn('No explorer found for network:', network, 'normalized:', normalizedNetwork);
    return '';
  }
  
  return explorerUrl + txHash;
};

interface NetworkConfig {
  network: string;
  chainId: number;
  tokens: {
    symbol: string;
    address: string;
    decimals: number;
    eip712: {
      name: string;
      version: string;
      verifyingContract: string;
    };
  }[];
}

export default function DemoPage() {
  // UI State
  const [step, setStep] = useState<'locked' | 'payment' | 'unlocked'>('locked');
  
  // Configuration
  const [networks, setNetworks] = useState<NetworkConfig[]>([]);
  const [selectedNetwork, setSelectedNetwork] = useState<string>('');
  const [selectedToken, setSelectedToken] = useState<string>('');
  
  // Loading states
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [transactionHash, setTransactionHash] = useState('');

  const facilitatorUrl = process.env.NEXT_PUBLIC_FACILITATOR_URL || 'http://localhost:8080';
  const merchantAddress = process.env.NEXT_PUBLIC_MERCHANT_ADDRESS || '';
  const PROTECTED_RESOURCE = '/dancing-cat.gif';
  const PAYMENT_AMOUNT = '10000'; // 0.01 USDC
  const RESOURCE_DESCRIPTION = 'Premium Dancing Cat GIF';

  const { address, isConnected, chain } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();

  // Fetch networks on mount
  useEffect(() => {
    const fetchNetworks = async () => {
      try {
        const networksRes = await fetch(`${facilitatorUrl}/networks`);
        if (networksRes.ok) {
          const data = await networksRes.json();
          // Combine mainnet and testnet networks
          const allNetworks = [...(data.mainnet || []), ...(data.testnet || [])];
          setNetworks(allNetworks);
          // Set default selections
          if (allNetworks.length > 0) {
            const defaultNet = allNetworks[0];
            setSelectedNetwork(defaultNet.network);
            if (defaultNet.tokens.length > 0) {
              setSelectedToken(defaultNet.tokens[0].address);
            }
          }
        } else {
          setError('Failed to load payment networks');
        }
      } catch (error) {
        console.error('Failed to fetch networks:', error);
        setError('Failed to load configuration.');
      }
    };
    fetchNetworks();

    // Cleanup blob URL on unmount
    return () => {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [facilitatorUrl, imageUrl]);

  // Handle network change
  const handleNetworkChange = (networkName: string) => {
    setSelectedNetwork(networkName);
    const network = networks.find(n => n.network === networkName);
    if (network && network.tokens.length > 0) {
      setSelectedToken(network.tokens[0].address);
    }
  };

  // Get current network and token configs
  const networkConfig = networks.find(n => n.network === selectedNetwork);
  const tokenConfig = networkConfig?.tokens.find(t => t.address === selectedToken);

  const handleUnlock = () => {
    if (!isConnected) {
      setError('Please connect your wallet first');
      return;
    }
    if (!merchantAddress) {
      setError('Merchant address not loaded');
      return;
    }
    setStep('payment');
    setError('');
  };

  const handlePay = async () => {
    if (!address || !networkConfig || !tokenConfig) {
      setError('Missing required configuration');
      return;
    }

    setProcessing(true);
    setError('');

    try {
      // Generate nonce
      const nonce = '0x' + Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      const now = Math.floor(Date.now() / 1000);
      const validAfter = now;
      const validBefore = now + 3600; // 1 hour validity

      // Create authorization message
      const authorization = {
        from: address,
        to: merchantAddress as `0x${string}`,
        value: BigInt(PAYMENT_AMOUNT),
        validAfter: BigInt(validAfter),
        validBefore: BigInt(validBefore),
        nonce: nonce as `0x${string}`
      };

      // Sign with EIP-712
      const signature = await signTypedDataAsync({
        domain: {
          name: tokenConfig.eip712.name,
          version: tokenConfig.eip712.version,
          chainId: networkConfig.chainId,
          verifyingContract: tokenConfig.eip712.verifyingContract as `0x${string}`
        },
        types: {
          TransferWithAuthorization: [
            { name: 'from', type: 'address' },
            { name: 'to', type: 'address' },
            { name: 'value', type: 'uint256' },
            { name: 'validAfter', type: 'uint256' },
            { name: 'validBefore', type: 'uint256' },
            { name: 'nonce', type: 'bytes32' }
          ]
        },
        primaryType: 'TransferWithAuthorization',
        message: authorization
      });

      // Convert authorization back to strings for JSON
      const authorizationForPayload = {
        from: address,
        to: merchantAddress,
        value: PAYMENT_AMOUNT,
        validAfter: validAfter.toString(),
        validBefore: validBefore.toString(),
        nonce: nonce
      };

      // Create payment requirements that match what we signed
      const paymentRequirements = {
        scheme: 'exact',
        network: networkConfig.network,
        asset: tokenConfig.address,
        payTo: merchantAddress,
        maxAmountRequired: PAYMENT_AMOUNT,
        resource: PROTECTED_RESOURCE,
        description: RESOURCE_DESCRIPTION,
        mimeType: 'image/gif',
        maxTimeoutSeconds: 3600
      };

      // Create X-PAYMENT header payload (per x402 spec)
      const xPaymentData = {
        payload: {
          authorization: authorizationForPayload,
          signature
        }
      };
      const xPaymentHeader = Buffer.from(JSON.stringify(xPaymentData)).toString('base64');

      // Request protected resource with payment (cache-busting to force new payment each time)
      const response = await fetch(`${PROTECTED_RESOURCE}?t=${Date.now()}`, {
        headers: {
          'X-PAYMENT': xPaymentHeader
        },
        cache: 'no-store'
      });

      if (response.ok) {
        // Payment accepted - get the image
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        
        // Try to get transaction hash from X-PAYMENT-RESPONSE header
        const paymentResponse = response.headers.get('x-payment-response');
        if (paymentResponse) {
          try {
            const decoded = JSON.parse(Buffer.from(paymentResponse, 'base64').toString('utf-8'));
            if (decoded.transactionHash) {
              setTransactionHash(decoded.transactionHash);
            }
          } catch (e) {
            console.error('Failed to decode payment response:', e);
          }
        }
        
        setImageUrl(url);
        setStep('unlocked');
      } else if (response.status === 402) {
        setError('Payment verification failed. Please try again.');
      } else {
        setError(`Request failed: ${response.status} ${response.statusText}`);
      }
    } catch (err: any) {
      console.error('Payment error:', err);
      setError(err.message || 'Payment failed. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  const handleReset = () => {
    if (imageUrl) {
      URL.revokeObjectURL(imageUrl);
    }
    setImageUrl('');
    setTransactionHash('');
    setStep('locked');
    setError('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
        {/* Header */}
        <div className="mb-10">
          <Link href="/" className="text-cyan-400 hover:text-cyan-300 text-sm mb-4 inline-flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Home
          </Link>
          <div className="text-center">
            <h1 className="text-4xl sm:text-5xl font-bold mb-4 bg-gradient-to-r from-pink-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
              Premium Content Demo
            </h1>
            <p className="text-slate-400">
              Experience X-402 payment protocol in action
            </p>
          </div>
        </div>

        {/* Wallet Connect */}
        <div className="mb-8">
          <WalletConnect />
        </div>

        {/* Main Content */}
        <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl overflow-hidden">
          
          {/* LOCKED STATE - Paywall */}
          {step === 'locked' && (
            <div className="p-8">
              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-20 h-20 bg-pink-500/10 border-2 border-pink-500/30 rounded-full mb-4">
                  <svg className="w-10 h-10 text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Premium Content Locked</h2>
                <p className="text-slate-400">Pay to unlock exclusive dancing cat GIF</p>
              </div>

              {/* Blurred Preview */}
              <div className="relative mb-6 rounded-lg overflow-hidden">
                <div className="aspect-square bg-slate-900/60 flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-6xl mb-4">🐱</div>
                    <p className="text-slate-500">Preview unavailable</p>
                  </div>
                </div>
                <div className="absolute inset-0 backdrop-blur-sm bg-black/20 flex items-center justify-center">
                  <div className="bg-slate-900/90 border border-pink-500/30 rounded-lg p-6 text-center">
                    <p className="text-pink-300 font-semibold mb-1">🔒 Unlock Required</p>
                    <p className="text-2xl font-bold text-white">0.01 USDC</p>
                  </div>
                </div>
              </div>

              {/* Error Display */}
              {error && (
                <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                  <p className="text-red-300 text-sm">{error}</p>
                </div>
              )}

              {/* Unlock Button */}
              <button
                onClick={handleUnlock}
                disabled={!isConnected || !merchantAddress || loading}
                className="w-full px-6 py-4 bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-lg font-semibold text-lg hover:from-pink-600 hover:to-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-[1.02] active:scale-[0.98]"
              >
                {!isConnected ? 'Connect Wallet to Unlock' : 'Unlock Premium Content'}
              </button>

              <p className="text-xs text-slate-500 text-center mt-4">
                One-time payment • Instant access • Secure on-chain transaction
              </p>
            </div>
          )}

          {/* PAYMENT STATE */}
          {step === 'payment' && (
            <div className="p-8">
              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-20 h-20 bg-cyan-500/10 border-2 border-cyan-500/30 rounded-full mb-4">
                  <svg className="w-10 h-10 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Complete Payment</h2>
                <p className="text-slate-400">Sign the transaction to unlock content</p>
              </div>

              {/* Payment Summary */}
              <div className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-6 mb-6">
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Content</span>
                    <span className="text-white font-medium">{RESOURCE_DESCRIPTION}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Network</span>
                    <span className="text-white font-medium">{selectedNetwork}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Token</span>
                    <span className="text-white font-medium">{tokenConfig?.symbol}</span>
                  </div>
                  <div className="border-t border-slate-700/40 pt-3 flex justify-between">
                    <span className="text-slate-400">Amount</span>
                    <span className="text-2xl font-bold text-cyan-400">0.01 USDC</span>
                  </div>
                </div>
              </div>

              {/* Network & Token Selectors (can still change) */}
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Payment Network</label>
                  <select
                    value={selectedNetwork}
                    onChange={(e) => handleNetworkChange(e.target.value)}
                    disabled={processing}
                    className="w-full px-4 py-3 bg-slate-900/60 border border-slate-700/40 rounded-lg text-white focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/20 disabled:opacity-50"
                  >
                    {networks.map((net) => (
                      <option key={net.network} value={net.network}>
                        {net.network}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Payment Token</label>
                  <select
                    value={selectedToken}
                    onChange={(e) => setSelectedToken(e.target.value)}
                    disabled={processing}
                    className="w-full px-4 py-3 bg-slate-900/60 border border-slate-700/40 rounded-lg text-white focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/20 disabled:opacity-50"
                  >
                    {networkConfig?.tokens.map((token) => (
                      <option key={token.address} value={token.address}>
                        {token.symbol}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Error Display */}
              {error && (
                <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                  <p className="text-red-300 text-sm">{error}</p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => setStep('locked')}
                  disabled={processing}
                  className="flex-1 px-6 py-4 bg-slate-700/40 border border-slate-600/40 text-slate-300 rounded-lg font-semibold hover:bg-slate-700/60 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePay}
                  disabled={processing}
                  className="flex-1 px-6 py-4 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-lg font-semibold hover:from-cyan-600 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-[1.02] active:scale-[0.98]"
                >
                  {processing ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Processing...
                    </span>
                  ) : (
                    'Sign & Pay'
                  )}
                </button>
              </div>
            </div>
          )}

          {/* UNLOCKED STATE */}
          {step === 'unlocked' && (
            <div className="p-8">
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-20 h-20 bg-green-500/10 border-2 border-green-500/30 rounded-full mb-4">
                  <svg className="w-10 h-10 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Payment Successful!</h2>
                <p className="text-slate-400">Your premium content is now unlocked</p>
              </div>

              {/* Premium Content */}
              <div className="relative w-full aspect-square max-w-2xl mx-auto mb-6 rounded-lg overflow-hidden bg-slate-900/60">
                {imageUrl && (
                  <img
                    src={imageUrl}
                    alt="Premium Dancing Cat"
                    className="w-full h-full object-contain"
                  />
                )}
              </div>

              {/* Transaction Info */}
              {transactionHash && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 mb-6">
                  <div className="flex items-start gap-2">
                    <svg className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="flex-1">
                      <p className="text-emerald-300 text-sm font-semibold mb-2">Payment Confirmed On-Chain</p>
                      <p className="text-xs text-emerald-200/80 mb-2">Transaction Hash:</p>
                      {(() => {
                        const explorerUrl = getExplorerUrl(selectedNetwork, transactionHash);
                        if (explorerUrl) {
                          return (
                            <a 
                              href={explorerUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-mono text-xs break-all text-cyan-400 hover:text-cyan-300 underline inline-flex items-center gap-1"
                            >
                              {transactionHash}
                              <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                            </a>
                          );
                        }
                        return <span className="font-mono text-xs break-all text-slate-300">{transactionHash}</span>;
                      })()}
                    </div>
                  </div>
                </div>
              )}

              {/* Reset Button */}
              <button
                onClick={handleReset}
                className="w-full px-6 py-3 bg-slate-700/40 border border-slate-600/40 text-slate-300 rounded-lg font-semibold hover:bg-slate-700/60 transition-all"
              >
                Lock Again (Demo Reset)
              </button>
            </div>
          )}

        </div>

        {/* Info Footer */}
        <div className="mt-8 bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <svg className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-sm text-blue-300">
              <p className="font-semibold mb-1">How it works</p>
                <p className="text-blue-400/70">
                Connect your wallet, click unlock, and sign the payment to instantly access premium content. 
                Payment is processed securely on-chain using USDC. You can reset and try again as many times 
                as you'd like in this demo.
                </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
