'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount, useSignTypedData, useChainId, useSwitchChain } from 'wagmi';
import Link from 'next/link';

interface Token {
  address: string;
  symbol: string;
  decimals: number;
}

interface NetworkInfo {
  network: string;
  chainId: number;
  tokens: Token[];
}

// Get block explorer URL for transaction
function getExplorerUrl(chainId: number | null, txHash: string): string {
  const explorers: Record<number, string> = {
    8453: 'https://basescan.org/tx/',
    84532: 'https://sepolia.basescan.org/tx/',
    10: 'https://optimistic.etherscan.io/tx/',
    11155420: 'https://sepolia-optimism.etherscan.io/tx/',
    999: 'https://explorer.hyperliquid.xyz/tx/',
  };
  const base = chainId ? explorers[chainId] : 'https://basescan.org/tx/';
  return `${base || 'https://basescan.org/tx/'}${txHash}`;
}

export default function DemoContent() {
  const { address, isConnected, connector } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { signTypedDataAsync } = useSignTypedData();

  // API Key state
  const [apiKey, setApiKey] = useState('');
  const [apiKeyValidated, setApiKeyValidated] = useState(false);
  const [validatingKey, setValidatingKey] = useState(false);
  const [keyBalance, setKeyBalance] = useState<string | null>(null);

  // Demo state
  const [step, setStep] = useState<'apikey' | 'config' | 'payment' | 'success'>('apikey');
  const [networks, setNetworks] = useState<NetworkInfo[]>([]);
  const [selectedNetwork, setSelectedNetwork] = useState<NetworkInfo | null>(null);
  const [networkType, setNetworkType] = useState<'testnet' | 'mainnet'>('testnet');
  const [recipientAddress, setRecipientAddress] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('0.01');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [transactionHash, setTransactionHash] = useState('');
  const [paymentChainId, setPaymentChainId] = useState<number | null>(null);

  const FACILITATOR_URL = 'https://api.netpay.id';

  // Get available networks based on type
  const availableNetworks = networks.filter(n => {
    const testnetChains = [84532, 11155420]; // Base Sepolia, OP Sepolia
    const mainnetChains = [8453, 10, 999]; // Base, OP Mainnet, HyperEVM
    return networkType === 'testnet' 
      ? testnetChains.includes(n.chainId)
      : mainnetChains.includes(n.chainId);
  });

  // Get USDC token for selected network
  const usdcToken = selectedNetwork?.tokens?.find(t => t.symbol === 'USDC');

  // Check if chain switch is needed
  const needsChainSwitch = isConnected && selectedNetwork && chainId !== selectedNetwork.chainId;

  // Fetch networks
  useEffect(() => {
    async function fetchNetworks() {
      try {
        const response = await fetch(`${FACILITATOR_URL}/supported`);
        if (response.ok) {
          const data = await response.json();
          // Filter networks with USDC
          const networksWithUSDC = data.filter((n: NetworkInfo) => 
            n.tokens?.some((t: Token) => t.symbol === 'USDC')
          );
          setNetworks(networksWithUSDC);
          // Set default network
          const defaultNet = networksWithUSDC.find((n: NetworkInfo) => n.chainId === 84532);
          if (defaultNet) setSelectedNetwork(defaultNet);
        }
      } catch (err) {
        console.error('Failed to fetch networks:', err);
      }
    }
    fetchNetworks();
  }, []);

  // Update selected network when type changes
  useEffect(() => {
    if (availableNetworks.length > 0 && selectedNetwork) {
      const currentTypeNetworks = availableNetworks;
      if (!currentTypeNetworks.find(n => n.chainId === selectedNetwork.chainId)) {
        setSelectedNetwork(currentTypeNetworks[0]);
      }
    }
  }, [networkType, availableNetworks, selectedNetwork]);

  // Validate API Key
  const validateApiKey = useCallback(async () => {
    const keyRegex = /^[A-Za-z0-9]{64}$/;
    if (!apiKey || !keyRegex.test(apiKey)) {
      setError('API key must be 64 alphanumeric characters (no special characters)');
      return;
    }

    setValidatingKey(true);
    setError('');
    
    try {
      const response = await fetch(`${FACILITATOR_URL}/balance`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setKeyBalance(data.balance);
        setApiKeyValidated(true);
        setStep('config');
      } else if (response.status === 401) {
        setError('Invalid API key. Please check and try again.');
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to validate API key');
      }
    } catch (err) {
      setError('Failed to connect to API. Please try again.');
    } finally {
      setValidatingKey(false);
    }
  }, [apiKey]);

  // Handle connect wallet
  const handleConnect = async () => {
    try {
      if (connector?.connect) {
        await connector.connect();
      }
    } catch (err) {
      console.error('Failed to connect:', err);
    }
  };

  // Handle network type change
  const handleNetworkTypeChange = (type: 'testnet' | 'mainnet') => {
    setNetworkType(type);
    setError('');
  };

  // Proceed to payment step
  const handleProceedToPayment = () => {
    if (!recipientAddress || !recipientAddress.startsWith('0x') || recipientAddress.length !== 42) {
      setError('Please enter a valid recipient address');
      return;
    }
    setError('');
    setStep('payment');
  };

  // Handle payment
  const handlePay = async () => {
    if (!address || !selectedNetwork || !usdcToken || !recipientAddress) {
      setError('Missing required payment details');
      return;
    }

    // Check if chain switch needed
    if (needsChainSwitch) {
      try {
        switchChain({ chainId: selectedNetwork.chainId });
      } catch {
        setError('Please switch to the correct network in your wallet');
      }
      return;
    }

    setProcessing(true);
    setError('');

    try {
      const amount = BigInt(Math.floor(parseFloat(paymentAmount) * (10 ** usdcToken.decimals)));
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
      const nonce = BigInt(`0x${[...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2, '0')).join('')}`);

      // EIP-712 domain for USDC
      const domain = {
        name: 'USD Coin',
        version: '2',
        chainId: BigInt(selectedNetwork.chainId),
        verifyingContract: usdcToken.address as `0x${string}`,
      };

      // TransferWithAuthorization types
      const types = {
        TransferWithAuthorization: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'validAfter', type: 'uint256' },
          { name: 'validBefore', type: 'uint256' },
          { name: 'nonce', type: 'bytes32' },
        ],
      };

      // Message
      const message = {
        from: address as `0x${string}`,
        to: recipientAddress as `0x${string}`,
        value: amount,
        validAfter: BigInt(0),
        validBefore: deadline,
        nonce: `0x${nonce.toString(16).padStart(64, '0')}` as `0x${string}`,
      };

      // Sign the typed data
      const signature = await signTypedDataAsync({
        domain,
        types,
        primaryType: 'TransferWithAuthorization',
        message,
      });

      // Create payment payload
      const payload = {
        x402Version: 2,
        scheme: 'exact',
        network: selectedNetwork.network,
        payload: {
          signature,
          authorization: {
            from: address,
            to: recipientAddress,
            value: amount.toString(),
            validAfter: '0',
            validBefore: deadline.toString(),
            nonce: `0x${nonce.toString(16).padStart(64, '0')}`,
          },
          token: usdcToken.address,
        },
      };

      // Call facilitator directly with user's API key
      const response = await fetch(`${FACILITATOR_URL}/settle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setTransactionHash(result.txHash || result.transactionHash || '');
        setPaymentChainId(selectedNetwork.chainId);
        setStep('success');
      } else {
        setError(result.error || 'Settlement failed');
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Payment failed';
      if (errorMessage.includes('rejected') || errorMessage.includes('denied')) {
        setError('Transaction was rejected');
      } else {
        setError(errorMessage);
      }
    } finally {
      setProcessing(false);
    }
  };

  // Reset demo
  const handleReset = () => {
    setStep('config');
    setRecipientAddress('');
    setPaymentAmount('0.01');
    setTransactionHash('');
    setPaymentChainId(null);
    setError('');
  };

  // Change API key
  const handleChangeApiKey = () => {
    setApiKeyValidated(false);
    setKeyBalance(null);
    setStep('apikey');
    setError('');
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      {/* Header */}
      <header className="border-b border-neutral-800">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center">
              <span className="text-black font-bold text-sm">N</span>
            </div>
            <span className="font-semibold">NetPay</span>
          </Link>
          <nav className="flex items-center gap-6">
            <Link href="/" className="text-sm text-neutral-400 hover:text-white transition-colors">
              Purchase Credits
            </Link>
            <Link href="/docs" className="text-sm text-neutral-400 hover:text-white transition-colors">
              API Docs
            </Link>
            <span className="text-sm text-amber-500 font-medium">Demo</span>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-xl mx-auto px-6 py-12">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Payment Demo</h1>
          <p className="text-neutral-400">
            Test x402 payment settlements using your API key
          </p>
        </div>

        {/* API Key Step */}
        {step === 'apikey' && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 space-y-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold mb-1">Enter Your API Key</h2>
              <p className="text-sm text-neutral-400">
                Use your NetPay API key to test payment settlements
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-2">
                API Key
              </label>
              <input
                type="text"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="x402_pk_test_abc123def456..."
                className="w-full px-4 py-3 bg-neutral-950 border border-neutral-800 rounded-lg text-white placeholder-neutral-600 focus:outline-none focus:border-amber-500 font-mono text-sm"
              />
              <p className="text-xs text-neutral-500 mt-2">
                Don&apos;t have an API key? <Link href="/" className="text-amber-500 hover:text-amber-400">Purchase credits</Link> to get one.
              </p>
            </div>

            {/* Error Display */}
            {error && (
              <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            <button
              onClick={validateApiKey}
              disabled={!apiKey || validatingKey}
              className="w-full px-6 py-4 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {validatingKey ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Validating...
                </span>
              ) : (
                'Continue'
              )}
            </button>
          </div>
        )}

        {/* Config Step */}
        {step === 'config' && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 space-y-6">
            {/* API Key Info */}
            <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm text-green-400">API key validated</span>
                </div>
                <button 
                  onClick={handleChangeApiKey}
                  className="text-xs text-neutral-400 hover:text-white"
                >
                  Change
                </button>
              </div>
              {keyBalance && (
                <p className="text-xs text-neutral-400 mt-1">
                  Balance: {keyBalance} USDC credits
                </p>
              )}
            </div>

            {/* Network Type Toggle */}
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-2">
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
                    {net.network}
                  </option>
                ))}
              </select>
              {availableNetworks.length === 0 && (
                <p className="text-neutral-500 text-sm mt-2">Loading networks...</p>
              )}
            </div>

            {/* Recipient Address */}
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-2">
                Recipient Address <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={recipientAddress}
                onChange={(e) => setRecipientAddress(e.target.value)}
                placeholder="0x..."
                className="w-full px-4 py-3 bg-neutral-950 border border-neutral-800 rounded-lg text-white placeholder-neutral-600 focus:outline-none focus:border-amber-500"
              />
              <p className="text-xs text-neutral-500 mt-1">
                The wallet address that will receive the payment
              </p>
            </div>

            {/* Amount */}
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-2">
                Amount (USDC)
              </label>
              <input
                type="number"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                min="0.001"
                max="10"
                step="0.001"
                className="w-full px-4 py-3 bg-neutral-950 border border-neutral-800 rounded-lg text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* Error Display */}
            {error && (
              <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            {/* Continue Button */}
            {!isConnected ? (
              <button
                onClick={handleConnect}
                className="w-full px-6 py-4 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-lg transition-colors"
              >
                Connect Wallet to Continue
              </button>
            ) : (
              <button
                onClick={handleProceedToPayment}
                disabled={!recipientAddress}
                className="w-full px-6 py-4 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue to Payment
              </button>
            )}
          </div>
        )}

        {/* Payment Step */}
        {step === 'payment' && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 space-y-6">
            {/* Payment Summary */}
            <div className="p-4 bg-neutral-950 rounded-lg space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-neutral-400">Recipient</span>
                <span className="text-white font-mono text-xs">
                  {recipientAddress.slice(0, 10)}...{recipientAddress.slice(-8)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-neutral-400">Network</span>
                <span className="text-white">{selectedNetwork?.network}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-neutral-400">Token</span>
                <span className="text-white">{usdcToken?.symbol}</span>
              </div>
              <div className="border-t border-neutral-800 pt-3 flex justify-between">
                <span className="text-neutral-400">Amount</span>
                <span className="text-xl font-bold text-amber-500">{paymentAmount} USDC</span>
              </div>
            </div>

            {/* Chain Switch Warning */}
            {needsChainSwitch && (
              <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <p className="text-yellow-400 text-sm">
                  Please switch to {selectedNetwork?.network} in your wallet to continue
                </p>
              </div>
            )}

            {/* Error Display */}
            {error && (
              <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => setStep('config')}
                disabled={processing}
                className="flex-1 px-6 py-4 border border-neutral-700 text-neutral-300 rounded-lg font-semibold hover:border-neutral-600 disabled:opacity-50 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handlePay}
                disabled={processing}
                className="flex-1 px-6 py-4 bg-amber-500 hover:bg-amber-400 text-black rounded-lg font-semibold disabled:opacity-50 transition-colors"
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
                  'Switch Network'
                ) : (
                  'Sign & Pay'
                )}
              </button>
            </div>
          </div>
        )}

        {/* Success Step */}
        {step === 'success' && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 space-y-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold mb-2">Payment Successful!</h2>
              <p className="text-neutral-400">
                Your payment has been settled on {selectedNetwork?.network}
              </p>
            </div>

            {/* Transaction Info */}
            {transactionHash && (
              <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                <p className="text-green-400 text-sm font-medium mb-2">Transaction Hash</p>
                <a 
                  href={getExplorerUrl(paymentChainId, transactionHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-mono text-amber-500 hover:text-amber-400 break-all flex items-center gap-1"
                >
                  {transactionHash}
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
            )}

            {/* Try Again Button */}
            <button
              onClick={handleReset}
              className="w-full px-6 py-4 border border-neutral-700 text-neutral-300 rounded-lg font-semibold hover:border-neutral-600 transition-colors"
            >
              Try Another Payment
            </button>
          </div>
        )}

        {/* Info Footer */}
        <div className="mt-8 p-4 bg-neutral-900/50 border border-neutral-800 rounded-lg">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-sm text-neutral-400">
              <p className="font-medium text-neutral-300 mb-1">How it works</p>
              <p>
                This demo uses your NetPay API key to settle USDC payments instantly. 
                Sign the ERC-3009 authorization, and we&apos;ll execute the transfer on-chain.
                Each settlement costs approximately 0.001 USDC from your credit balance.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
