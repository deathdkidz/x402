'use client';

import { useState, useEffect } from 'react';
import { useAccount, useSignTypedData } from 'wagmi';
import Link from 'next/link';
import WalletConnect from '../components/WalletConnect';

interface TokenConfig {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  eip712?: {
    name: string;
    version: string;
    verifyingContract: string;
  };
}

interface NetworkConfig {
  network: string;
  chainId: number;
  tokens: TokenConfig[];
  rpcConfigured: boolean;
}

export default function DemoPage() {
  const { address, isConnected } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  
  const [apiKey, setApiKey] = useState('');
  const [merchantAddress, setMerchantAddress] = useState('');
  const [networks, setNetworks] = useState<NetworkConfig[]>([]);
  const [selectedNetwork, setSelectedNetwork] = useState('');
  const [selectedToken, setSelectedToken] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [txHash, setTxHash] = useState('');
  const [loadingNetworks, setLoadingNetworks] = useState(true);

  const facilitatorUrl = 'http://localhost:8080';

  useEffect(() => {
    const stored = localStorage.getItem('x402_api_key');
    if (stored) setApiKey(stored);
  }, []);

  // Fetch supported networks from facilitator
  useEffect(() => {
    const fetchNetworks = async () => {
      try {
        const response = await fetch(`${facilitatorUrl}/networks`);
        if (response.ok) {
          const data = await response.json();
          setNetworks(data.networks);
          if (data.networks.length > 0) {
            setSelectedNetwork(data.networks[0].network);
            if (data.networks[0].tokens.length > 0) {
              setSelectedToken(data.networks[0].tokens[0].address);
            }
          }
        }
      } catch (error) {
        console.error('Failed to fetch networks:', error);
      } finally {
        setLoadingNetworks(false);
      }
    };

    fetchNetworks();
  }, []);

  // Fetch merchant address when API key is available
  useEffect(() => {
    const fetchMerchantAddress = async () => {
      if (!apiKey) return;
      
      try {
        const response = await fetch(`${facilitatorUrl}/merchant/wallet`, {
          headers: {
            'Authorization': `Bearer ${apiKey}`
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          setMerchantAddress(data.merchant.merchant_address);
        }
      } catch (error) {
        console.error('Failed to fetch merchant address:', error);
      }
    };

    fetchMerchantAddress();
  }, [apiKey]);

  const handleUnlock = async () => {
    if (!address || !apiKey || !merchantAddress || !selectedNetwork || !selectedToken) return;
    
    setProcessing(true);
    setError('');
    setTxHash('');

    try {
      const networkConfig = networks.find(n => n.network === selectedNetwork);
      const tokenConfig = networkConfig?.tokens.find(t => t.address === selectedToken);
      
      if (!networkConfig || !tokenConfig || !tokenConfig.eip712) {
        throw new Error('Invalid network or token configuration');
      }
      
      // 1. Generate payment payload locally
      const validAfter = Math.floor(Date.now() / 1000);
      const validBefore = validAfter + 3600; // 1 hour validity
      const nonce = `0x${Array.from({length: 64}, () => Math.floor(Math.random() * 16).toString(16)).join('')}`;
      
      const payload = {
        from: address,
        to: merchantAddress,
        value: '10000', // 0.01 USDC
        validAfter: validAfter.toString(),
        validBefore: validBefore.toString(),
        nonce: nonce
      };

      // 2. Sign with EIP-712 typed data
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
        message: payload as any
      });

      // 3. Verify signature
      const verifyResponse = await fetch(`${facilitatorUrl}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          x402Version: 1,
          paymentPayload: {
            x402Version: 1,
            payload: {
              authorization: payload,
              signature: signature
            }
          },
          paymentRequirements: {
            scheme: 'erc3009',
            network: selectedNetwork,
            asset: selectedToken,
            payTo: merchantAddress,
            maxAmountRequired: '10000',
            resource: '/demo/cat',
            description: 'Unlock cat image',
            mimeType: 'image/jpeg',
            maxTimeoutSeconds: 3600
          }
        })
      });

      if (!verifyResponse.ok) {
        throw new Error('Signature verification failed');
      }

      // 4. Settle payment
      const settleResponse = await fetch(`${facilitatorUrl}/settle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          x402Version: 1,
          paymentPayload: {
            x402Version: 1,
            payload: {
              authorization: payload,
              signature: signature
            }
          },
          paymentRequirements: {
            scheme: 'erc3009',
            network: selectedNetwork,
            asset: selectedToken,
            payTo: merchantAddress,
            maxAmountRequired: '10000',
            resource: '/demo/cat',
            description: 'Unlock cat image',
            mimeType: 'image/jpeg',
            maxTimeoutSeconds: 3600
          }
        })
      });

      if (!settleResponse.ok) {
        const errorData = await settleResponse.json();
        throw new Error(errorData.error || 'Settlement failed');
      }

      const settleData = await settleResponse.json();
      
      // Check if settlement was actually successful
      if (!settleData.success) {
        throw new Error(settleData.errorReason || 'Settlement transaction failed');
      }
      
      setTxHash(settleData.transaction || '');
      
      // Handle different transaction statuses
      if (settleData.status === 'completed') {
        // Transaction confirmed on blockchain
        setUnlocked(true);
      } else if (settleData.status === 'pending') {
        // Transaction submitted but not yet confirmed
        setError(settleData.message || 'Transaction pending confirmation. Please wait...');
        // Show message but don't unlock yet
      }
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link href="/" className="text-cyan-400 hover:text-cyan-300 text-sm mb-2 inline-flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Home
            </Link>
            <h1 className="text-3xl font-bold text-slate-100">Payment Demo</h1>
            <p className="text-slate-400 text-sm">Unlock premium content with x402 payment</p>
          </div>
          <WalletConnect />
        </div>

        {/* Content Card */}
        <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/30 rounded-xl overflow-hidden">
          {/* Status Messages */}
          {!isConnected && (
            <div className="bg-amber-500/10 border-b border-amber-500/20 p-4">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span className="text-amber-300 text-sm">Connect your wallet to unlock content</span>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-500/10 border-b border-red-500/20 p-4">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span className="text-red-300 text-sm">{error}</span>
              </div>
            </div>
          )}

          {processing && (
            <div className="bg-blue-500/10 border-b border-blue-500/20 p-4">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <div>
                  <div className="text-blue-300 font-semibold">Processing Payment...</div>
                  <div className="text-blue-400/70 text-sm">Please sign the message in your wallet</div>
                </div>
              </div>
            </div>
          )}

          {/* Locked/Unlocked Content */}
          <div className="p-8">
            {!unlocked ? (
              <div className="text-center">
                {/* Locked Icon */}
                <div className="relative inline-block mb-6">
                  <div className="w-48 h-48 bg-slate-700/30 rounded-2xl flex items-center justify-center border-2 border-slate-600/50 backdrop-blur-sm">
                    <svg className="w-24 h-24 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <div className="absolute -top-2 -right-2 bg-pink-500 text-white px-3 py-1 rounded-full text-xs font-bold">
                    LOCKED
                  </div>
                </div>

                <h2 className="text-2xl font-bold text-slate-100 mb-2">Premium Cat Content</h2>
                <p className="text-slate-400 mb-6">
                  Unlock this hilarious cat image for only <span className="text-pink-400 font-bold">0.01 USDC</span>
                </p>

                {/* Network Selector */}
                {loadingNetworks ? (
                  <div className="text-slate-400 text-sm mb-6">Loading networks...</div>
                ) : (
                  <div className="max-w-md mx-auto mb-6">
                    <label className="block text-slate-300 text-sm font-medium mb-2">
                      Select Network
                    </label>
                    <select
                      value={selectedNetwork}
                      onChange={(e) => {
                        setSelectedNetwork(e.target.value);
                        const network = networks.find(n => n.network === e.target.value);
                        if (network && network.tokens.length > 0) {
                          setSelectedToken(network.tokens[0].address);
                        }
                      }}
                      className="w-full px-4 py-3 bg-slate-900/60 border border-slate-700/40 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/20"
                    >
                      {networks.map((network) => (
                        <option key={network.network} value={network.network}>
                          {network.network} (Chain ID: {network.chainId})
                        </option>
                      ))}
                    </select>

                    {/* Token Selector */}
                    {selectedNetwork && (networks.find(n => n.network === selectedNetwork)?.tokens.length ?? 0) > 0 && (
                      <div className="mt-3">
                        <label className="block text-slate-300 text-sm font-medium mb-2">
                          Select Token
                        </label>
                        <select
                          value={selectedToken}
                          onChange={(e) => setSelectedToken(e.target.value)}
                          className="w-full px-4 py-3 bg-slate-900/60 border border-slate-700/40 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/20"
                        >
                          {networks.find(n => n.network === selectedNetwork)?.tokens?.map((token) => (
                            <option key={token.address} value={token.address}>
                              {token.symbol} - {token.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}

                <div className="bg-slate-800/50 border border-slate-700/40 rounded-lg p-4 mb-6 max-w-md mx-auto">
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-slate-400">Price:</span>
                    <span className="text-slate-100 font-semibold">0.01 {networks.find(n => n.network === selectedNetwork)?.tokens.find(t => t.address === selectedToken)?.symbol || 'USDC'}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-slate-400">Network:</span>
                    <span className="text-slate-100">{selectedNetwork}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">Gas Fees:</span>
                    <span className="text-emerald-400 font-semibold">FREE (x402)</span>
                  </div>
                </div>

                <button
                  onClick={handleUnlock}
                  disabled={!isConnected || processing || !apiKey || !merchantAddress}
                  className="btn-secondary px-8 py-3 rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {processing ? 'Processing...' : '🔓 Unlock for 0.01 USDC'}
                </button>

                {!apiKey && isConnected && (
                  <p className="text-amber-400 text-xs mt-3">⚠️ API key not configured. Return to home page.</p>
                )}
                {!merchantAddress && apiKey && isConnected && (
                  <p className="text-amber-400 text-xs mt-3">⚠️ Loading merchant address...</p>
                )}
              </div>
            ) : (
              <div className="text-center">
                {/* Success Message */}
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4 mb-6">
                  <div className="flex items-center justify-center gap-3 mb-2">
                    <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-emerald-300 font-semibold">Payment Successful!</span>
                  </div>
                  {txHash && (
                    <a
                      href={`https://sepolia.basescan.org/tx/${txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-cyan-400 hover:text-cyan-300 font-mono"
                    >
                      View on Explorer →
                    </a>
                  )}
                </div>

                {/* Unlocked Cat Image */}
                <div className="relative inline-block mb-6">
                  <div className="w-64 h-64 bg-gradient-to-br from-pink-500/20 to-purple-500/20 rounded-2xl flex items-center justify-center border-2 border-pink-500/50 backdrop-blur-sm">
                    <div className="text-8xl">😺</div>
                  </div>
                  <div className="absolute -top-2 -right-2 bg-emerald-500 text-white px-3 py-1 rounded-full text-xs font-bold">
                    UNLOCKED
                  </div>
                </div>

                <h2 className="text-2xl font-bold text-slate-100 mb-2">Success!</h2>
                <p className="text-slate-400 mb-6">
                  Enjoy your premium cat content! 🎉
                </p>

                <button
                  onClick={() => {
                    setUnlocked(false);
                    setTxHash('');
                    setError('');
                  }}
                  className="text-cyan-400 hover:text-cyan-300 text-sm"
                >
                  ← Lock Again (for testing)
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="mt-6 text-center text-xs text-slate-500">
          This demo uses x402 protocol for gasless USDC payments on Base Sepolia testnet
        </div>
      </div>
    </div>
  );
}
