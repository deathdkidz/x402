'use client';

import { useState, useEffect } from 'react';
import { useAccount, useConnect, useDisconnect, useSignTypedData, useChainId, useSwitchChain } from 'wagmi';
import { injected } from 'wagmi/connectors';
import Link from 'next/link';

// Constants
const VAULT_ADDRESS = '0xaEc38404154C8EA2b9cfcCcF6c0E42A39ee30d54';
const FACILITATOR_URL = process.env.NEXT_PUBLIC_FACILITATOR_URL || 'https://api.netpay.id';

interface TokenConfig {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  eip712: {
    name: string;
    version: string;
    verifyingContract: string;
  };
}

interface NetworkConfig {
  network: string;
  caip2: string;
  chainId: number;
  tokens: TokenConfig[];
}

interface NetworksResponse {
  success: boolean;
  mainnet: NetworkConfig[];
  testnet: NetworkConfig[];
}

// Helper function to get block explorer URL
const getExplorerUrl = (chainId: number, txHash: string): string => {
  if (!txHash) return '';
  const explorers: Record<number, string> = {
    8453: 'https://basescan.org/tx/',
    84532: 'https://sepolia.basescan.org/tx/',
    10: 'https://optimistic.etherscan.io/tx/',
    11155420: 'https://sepolia-optimism.etherscan.io/tx/',
    999: 'https://explorer.hyperliquid.xyz/tx/',
    998: 'https://explorer.hyperliquid-testnet.xyz/tx/',
  };
  return (explorers[chainId] || '') + txHash;
};

export default function Home() {
  // Network data
  const [networksData, setNetworksData] = useState<NetworksResponse | null>(null);
  const [networkType, setNetworkType] = useState<'testnet' | 'mainnet'>('testnet');
  const [selectedNetwork, setSelectedNetwork] = useState<NetworkConfig | null>(null);
  
  // Purchase state
  const [purchaseAmount, setPurchaseAmount] = useState<string>('10');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<{ apiKey?: string; transaction?: string; balance?: string } | null>(null);
  
  // Existing API key state
  const [existingApiKey, setExistingApiKey] = useState('');
  const [isTopUp, setIsTopUp] = useState(false);

  // Wagmi hooks
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { signTypedDataAsync } = useSignTypedData();

  // Fetch networks on mount
  useEffect(() => {
    const fetchNetworks = async () => {
      try {
        const response = await fetch(`${FACILITATOR_URL}/networks`);
        if (response.ok) {
          const data: NetworksResponse = await response.json();
          setNetworksData(data);
          
          // Default to first testnet network with USDC
          const testnetsWithUsdc = data.testnet.filter(n => n.tokens.some(t => t.symbol === 'USDC'));
          if (testnetsWithUsdc.length > 0) {
            setSelectedNetwork(testnetsWithUsdc[0]);
          }
        }
      } catch (err) {
        console.error('Failed to fetch networks:', err);
        setError('Failed to load networks');
      }
    };
    fetchNetworks();
  }, []);

  // Get available networks based on type (only those with USDC)
  const availableNetworks = networksData
    ? (networkType === 'mainnet' ? networksData.mainnet : networksData.testnet)
        .filter(n => n.tokens.some(t => t.symbol === 'USDC'))
    : [];

  // Update selected network when type changes
  useEffect(() => {
    if (availableNetworks.length > 0 && (!selectedNetwork || !availableNetworks.find(n => n.chainId === selectedNetwork.chainId))) {
      setSelectedNetwork(availableNetworks[0]);
    }
  }, [networkType, availableNetworks, selectedNetwork]);

  // Get USDC token config for selected network
  const usdcToken = selectedNetwork?.tokens.find(t => t.symbol === 'USDC');

  // Check if wallet chain matches selected network
  const needsChainSwitch = selectedNetwork && chainId !== selectedNetwork.chainId;

  const handleConnect = () => {
    connect({ connector: injected() });
  };

  const handleNetworkTypeChange = (type: 'testnet' | 'mainnet') => {
    setNetworkType(type);
    setError('');
    setSuccess(null);
  };

  const handlePurchase = async () => {
    if (!address || !selectedNetwork || !usdcToken) {
      setError('Please connect wallet and select network');
      return;
    }

    // Check chain
    if (needsChainSwitch) {
      try {
        await switchChain({ chainId: selectedNetwork.chainId });
        return; // Let the user click again after switching
      } catch {
        setError('Please switch to the correct network in your wallet');
        return;
      }
    }

    setProcessing(true);
    setError('');
    setSuccess(null);

    try {
      // Generate nonce
      const nonce = '0x' + Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      const amountInMicro = Math.floor(parseFloat(purchaseAmount) * 1_000_000).toString();
      const now = Math.floor(Date.now() / 1000);
      const validAfter = 0;
      const validBefore = now + 3600; // 1 hour validity

      // Create authorization message
      const authorization = {
        from: address,
        to: VAULT_ADDRESS as `0x${string}`,
        value: BigInt(amountInMicro),
        validAfter: BigInt(validAfter),
        validBefore: BigInt(validBefore),
        nonce: nonce as `0x${string}`
      };

      // Sign with EIP-712
      const signature = await signTypedDataAsync({
        domain: {
          name: usdcToken.eip712.name,
          version: usdcToken.eip712.version,
          chainId: selectedNetwork.chainId,
          verifyingContract: usdcToken.eip712.verifyingContract as `0x${string}`
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

      // Create PAYMENT-SIGNATURE payload
      const paymentSignature = {
        authorization: {
          from: address,
          to: VAULT_ADDRESS,
          value: amountInMicro,
          validAfter: validAfter.toString(),
          validBefore: validBefore.toString(),
          nonce: nonce
        },
        signature,
        network: selectedNetwork.network,
        asset: usdcToken.address
      };
      
      const paymentSignatureHeader = btoa(JSON.stringify(paymentSignature));

      // Build headers
      const headers: Record<string, string> = {
        'PAYMENT-SIGNATURE': paymentSignatureHeader,
        'PAYMENT-VERSION': '2',
      };

      // Add API key if topping up
      if (isTopUp && existingApiKey) {
        headers['API-KEY'] = existingApiKey;
      }

      // Call POST /account to create/top-up API key
      const response = await fetch(`${FACILITATOR_URL}/account`, {
        method: 'POST',
        headers,
      });

      const result = await response.json();

      if (result.success) {
        setSuccess({
          apiKey: result.apiKey,
          transaction: result.transaction,
          balance: result.usdc || result.newBalance,
        });
      } else {
        setError(result.error || 'Purchase failed');
      }
    } catch (err: unknown) {
      console.error('Purchase error:', err);
      if (err instanceof Error) {
        if (err.message.includes('rejected')) {
          setError('Transaction was rejected');
        } else {
          setError(err.message || 'Purchase failed');
        }
      } else {
        setError('Purchase failed. Please try again.');
      }
    } finally {
      setProcessing(false);
    }
  };

  const handleReset = () => {
    setSuccess(null);
    setError('');
    setExistingApiKey('');
    setIsTopUp(false);
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      {/* Navigation */}
      <nav className="border-b border-neutral-800">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center">
                <span className="text-black font-bold text-sm">N</span>
              </div>
              <span className="text-xl font-semibold text-white">NetPay</span>
            </Link>
            <div className="flex items-center gap-4">
              <Link href="/demo" className="text-sm text-neutral-400 hover:text-white transition-colors">
                Demo
              </Link>
              <Link 
                href="/docs"
                className="text-sm text-neutral-400 hover:text-white transition-colors"
              >
                API Docs
              </Link>
              {isConnected ? (
                <button
                  onClick={() => disconnect()}
                  className="px-4 py-2 text-sm border border-neutral-700 hover:border-neutral-600 rounded-lg transition-colors"
                >
                  {address?.slice(0, 6)}...{address?.slice(-4)}
                </button>
              ) : (
                <button
                  onClick={handleConnect}
                  className="px-4 py-2 text-sm bg-amber-500 hover:bg-amber-400 text-black font-medium rounded-lg transition-colors"
                >
                  Connect Wallet
                </button>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 py-12">
        <div className="max-w-3xl mx-auto text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full text-amber-500 text-sm mb-6">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            x402 Payment Protocol
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4 leading-tight">
            Gasless USDC Payments<br/>
            <span className="text-amber-500">for Developers</span>
          </h1>
          <p className="text-lg text-neutral-400 max-w-xl mx-auto mb-8">
            x402 facilitator service for instant USDC payment settlements. 
            Non-custodial, sub-second confirmation on multiple chains.
          </p>
          
          {/* Two Action Options */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center max-w-md mx-auto">
            <a 
              href="#purchase"
              className="flex-1 px-6 py-4 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-lg transition-colors text-center"
            >
              Purchase Credits
            </a>
            <Link
              href="/demo"
              className="flex-1 px-6 py-4 border border-neutral-700 text-neutral-300 hover:border-amber-500 hover:text-white rounded-lg font-semibold transition-colors text-center"
            >
              Try Demo
            </Link>
          </div>
        </div>

        {/* Main Purchase Card */}
        <div id="purchase" className="max-w-xl mx-auto scroll-mt-24">
          {success ? (
            // Success State
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 space-y-6">
              <div className="text-center">
                <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold mb-2">
                  {success.apiKey ? 'Credits Purchased!' : 'Top-up Successful!'}
                </h2>
                <p className="text-neutral-400">
                  Your balance: <span className="text-amber-500 font-semibold">{success.balance} USDC</span>
                </p>
              </div>

              {/* API Key (only shown on new account) */}
              {success.apiKey && (
                <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                  <p className="text-amber-400 text-sm font-medium mb-2">⚠️ Save your API Key - shown only once!</p>
                  <div className="relative">
                    <input
                      type="text"
                      value={success.apiKey}
                      readOnly
                      className="w-full px-4 py-3 pr-24 bg-neutral-950 border border-neutral-800 rounded-lg text-white font-mono text-sm"
                    />
                    <button
                      onClick={() => navigator.clipboard.writeText(success.apiKey!)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black text-sm font-medium rounded transition-colors"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              )}

              {/* Transaction Hash */}
              {success.transaction && selectedNetwork && (
                <div className="p-4 bg-neutral-950 rounded-lg">
                  <p className="text-neutral-400 text-sm mb-2">Transaction</p>
                  <a 
                    href={getExplorerUrl(selectedNetwork.chainId, success.transaction)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-mono text-amber-500 hover:text-amber-400 break-all flex items-center gap-1"
                  >
                    {success.transaction.slice(0, 20)}...{success.transaction.slice(-16)}
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={handleReset}
                  className="flex-1 px-6 py-4 border border-neutral-700 text-neutral-300 rounded-lg font-semibold hover:border-neutral-600 transition-colors"
                >
                  Purchase More Credits
                </button>
                <Link
                  href="/demo"
                  className="flex-1 px-6 py-4 bg-amber-500 hover:bg-amber-400 text-black rounded-lg font-semibold transition-colors text-center"
                >
                  Try Demo
                </Link>
              </div>
            </div>
          ) : (
            // Purchase Form
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 space-y-6">
              {/* Network Type Toggle */}
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-3">
                  Network Type
                </label>
                <div className="flex p-1 bg-neutral-950 rounded-lg">
                  <button
                    onClick={() => handleNetworkTypeChange('testnet')}
                    className={`flex-1 py-2.5 text-sm font-medium rounded-md transition-colors ${
                      networkType === 'testnet'
                        ? 'bg-amber-500 text-black'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    Testnet
                  </button>
                  <button
                    onClick={() => handleNetworkTypeChange('mainnet')}
                    className={`flex-1 py-2.5 text-sm font-medium rounded-md transition-colors ${
                      networkType === 'mainnet'
                        ? 'bg-amber-500 text-black'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    Mainnet
                  </button>
                </div>
              </div>

              {/* Network Selector */}
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-2">
                  Network
                </label>
                <select
                  value={selectedNetwork?.chainId || ''}
                  onChange={(e) => {
                    const network = availableNetworks.find(n => n.chainId === parseInt(e.target.value));
                    if (network) setSelectedNetwork(network);
                  }}
                  className="w-full px-4 py-3 bg-neutral-950 border border-neutral-800 rounded-lg text-white focus:outline-none focus:border-amber-500"
                >
                  {availableNetworks.map((net) => (
                    <option key={net.chainId} value={net.chainId}>
                      {net.network} (Chain ID: {net.chainId})
                    </option>
                  ))}
                </select>
                {availableNetworks.length === 0 && (
                  <p className="text-neutral-500 text-sm mt-2">Loading networks...</p>
                )}
              </div>

              {/* Amount */}
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-2">
                  Amount (USDC)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={purchaseAmount}
                    onChange={(e) => setPurchaseAmount(e.target.value)}
                    min="1"
                    step="1"
                    className="w-full px-4 py-3 bg-neutral-950 border border-neutral-800 rounded-lg text-white focus:outline-none focus:border-amber-500"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500">
                    ≈ {Math.floor(parseFloat(purchaseAmount || '0') * 900)} settlements
                  </div>
                </div>
                <div className="flex gap-2 mt-2">
                  {['1', '5', '10', '25'].map((amt) => (
                    <button
                      key={amt}
                      onClick={() => setPurchaseAmount(amt)}
                      className={`px-3 py-1 text-sm rounded ${
                        purchaseAmount === amt
                          ? 'bg-amber-500 text-black'
                          : 'bg-neutral-800 text-neutral-400 hover:text-white'
                      }`}
                    >
                      {amt} USDC
                    </button>
                  ))}
                </div>
              </div>

              {/* Top-up Toggle */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsTopUp(!isTopUp)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    isTopUp ? 'bg-amber-500' : 'bg-neutral-700'
                  }`}
                >
                  <span
                    className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                      isTopUp ? 'translate-x-5' : ''
                    }`}
                  />
                </button>
                <span className="text-sm text-neutral-400">Top up existing API key</span>
              </div>

              {/* Existing API Key Input */}
              {isTopUp && (
                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-2">
                    Existing API Key
                  </label>
                  <input
                    type="text"
                    value={existingApiKey}
                    onChange={(e) => setExistingApiKey(e.target.value)}
                    placeholder="a1b2c3d4e5f67890abc..."
                    className="w-full px-4 py-3 bg-neutral-950 border border-neutral-800 rounded-lg text-white placeholder-neutral-600 focus:outline-none focus:border-amber-500 font-mono text-sm"
                  />
                </div>
              )}

              {/* Vault Address Info */}
              <div className="p-3 bg-neutral-950 rounded-lg">
                <p className="text-xs text-neutral-500 mb-1">Funds sent to vault</p>
                <p className="text-sm font-mono text-neutral-400">{VAULT_ADDRESS}</p>
              </div>

              {/* Chain Switch Warning */}
              {needsChainSwitch && isConnected && (
                <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                  <p className="text-yellow-400 text-sm">
                    Please switch to {selectedNetwork?.network} in your wallet
                  </p>
                </div>
              )}

              {/* Error Display */}
              {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}

              {/* Action Button */}
              {!isConnected ? (
                <button
                  onClick={handleConnect}
                  className="w-full px-6 py-4 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-lg transition-colors"
                >
                  Connect Wallet
                </button>
              ) : (
                <button
                  onClick={handlePurchase}
                  disabled={processing || !selectedNetwork || (isTopUp && !existingApiKey)}
                  className="w-full px-6 py-4 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {processing ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Processing...
                    </span>
                  ) : needsChainSwitch ? (
                    `Switch to ${selectedNetwork?.network}`
                  ) : isTopUp ? (
                    `Top Up ${purchaseAmount} USDC`
                  ) : (
                    `Purchase ${purchaseAmount} USDC Credits`
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Info Cards */}
      <section className="max-w-6xl mx-auto px-6 py-12">
        <div className="grid md:grid-cols-3 gap-6">
          <div className="p-5 bg-neutral-900 border border-neutral-800 rounded-xl">
            <div className="w-10 h-10 bg-amber-500/10 rounded-lg flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="font-semibold mb-1">Sub-Second Settlement</h3>
            <p className="text-neutral-400 text-sm">Flashblock-optimized for Base. Payments confirm in under 500ms.</p>
          </div>
          <div className="p-5 bg-neutral-900 border border-neutral-800 rounded-xl">
            <div className="w-10 h-10 bg-amber-500/10 rounded-lg flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h3 className="font-semibold mb-1">Non-Custodial</h3>
            <p className="text-neutral-400 text-sm">We never hold user funds. Direct transfers via EIP-3009.</p>
          </div>
          <div className="p-5 bg-neutral-900 border border-neutral-800 rounded-xl">
            <div className="w-10 h-10 bg-amber-500/10 rounded-lg flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="font-semibold mb-1">Multi-Chain</h3>
            <p className="text-neutral-400 text-sm">Base, Optimism, HyperEVM. Mainnet and testnet support.</p>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="border-t border-neutral-800 bg-neutral-900/30">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <h2 className="text-2xl font-bold text-center mb-12">How It Works</h2>
          <div className="grid md:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                <span className="text-amber-500 font-bold">1</span>
              </div>
              <h3 className="font-semibold mb-2">Purchase Credits</h3>
              <p className="text-neutral-400 text-sm">
                Send USDC to our vault. Receive an API key with credits.
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                <span className="text-amber-500 font-bold">2</span>
              </div>
              <h3 className="font-semibold mb-2">User Signs Payment</h3>
              <p className="text-neutral-400 text-sm">
                User signs EIP-3009 authorization. No gas needed from user.
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                <span className="text-amber-500 font-bold">3</span>
              </div>
              <h3 className="font-semibold mb-2">Call /settle</h3>
              <p className="text-neutral-400 text-sm">
                POST the signed auth to our API. We execute on-chain.
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                <span className="text-amber-500 font-bold">4</span>
              </div>
              <h3 className="font-semibold mb-2">Receive USDC</h3>
              <p className="text-neutral-400 text-sm">
                USDC transfers directly to your wallet. ~0.001 USDC per settlement.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold text-center mb-8">Simple Pricing</h2>
        <div className="max-w-md mx-auto bg-neutral-900 border border-neutral-800 rounded-xl p-6">
          <div className="text-center mb-6">
            <div className="text-4xl font-bold mb-1">~0.001 USDC</div>
            <div className="text-neutral-400">per settlement</div>
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-neutral-300">~900 settlements per USDC</span>
            </div>
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-neutral-300">Service fee: 0.001 USDC</span>
            </div>
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-neutral-300">Gas included in settlement cost</span>
            </div>
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-neutral-300">Minimum deposit: 1 USDC</span>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-neutral-800 bg-neutral-900/30">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-amber-500 rounded flex items-center justify-center">
                <span className="text-black font-bold text-xs">N</span>
              </div>
              <span className="text-neutral-400 text-sm">NetPay © 2026</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-neutral-500">
              <Link href="/docs" className="hover:text-white transition-colors">API Docs</Link>
              <a href="https://api.netpay.id/help" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">API Reference</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
