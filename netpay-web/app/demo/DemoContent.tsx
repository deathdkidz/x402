'use client';

import { useState, useEffect } from 'react';
import { useAccount, useConnect, useDisconnect, useSignTypedData, useChainId, useSwitchChain } from 'wagmi';
import { injected } from 'wagmi/connectors';
import Link from 'next/link';

// Helper function to get block explorer URL
const getExplorerUrl = (network: string, txHash: string): string => {
  if (!txHash || !network) return '';
  const normalizedNetwork = network.toLowerCase().replace(/\s+/g, '-');
  const explorers: Record<string, string> = {
    'ethereum': 'https://etherscan.io/tx/',
    'ethereum-sepolia': 'https://sepolia.etherscan.io/tx/',
    'base': 'https://basescan.org/tx/',
    'base-sepolia': 'https://sepolia.basescan.org/tx/',
    'optimism': 'https://optimistic.etherscan.io/tx/',
    'op-sepolia': 'https://sepolia-optimism.etherscan.io/tx/',
  };
  return (explorers[normalizedNetwork] || '') + txHash;
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

export default function DemoContent() {
  // UI State
  const [step, setStep] = useState<'config' | 'payment' | 'success'>('config');
  
  // Configuration
  const [networks, setNetworks] = useState<NetworkConfig[]>([]);
  const [selectedNetwork, setSelectedNetwork] = useState<string>('');
  const [selectedToken, setSelectedToken] = useState<string>('');
  const [recipientAddress, setRecipientAddress] = useState<string>('');
  const [paymentAmount, setPaymentAmount] = useState<string>('0.01');
  
  // Rate limiting
  const [settleCount, setSettleCount] = useState<number>(0);
  const [rateError, setRateError] = useState<string>('');
  
  // Loading states
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [transactionHash, setTransactionHash] = useState('');
  const [paymentNetwork, setPaymentNetwork] = useState('');

  const facilitatorUrl = process.env.NEXT_PUBLIC_FACILITATOR_URL || 'https://x402.netpay.id';
  const DAILY_LIMIT = 5; // 5 settlements per address per day

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
        const networksRes = await fetch(`${facilitatorUrl}/networks`);
        if (networksRes.ok) {
          const data = await networksRes.json();
          const allNetworks = [...(data.mainnet || []), ...(data.testnet || [])];
          setNetworks(allNetworks);
          if (allNetworks.length > 0) {
            // Default to Base Sepolia for demo
            const defaultNet = allNetworks.find(n => n.network.toLowerCase().includes('sepolia')) || allNetworks[0];
            setSelectedNetwork(defaultNet.network);
            if (defaultNet.tokens.length > 0) {
              setSelectedToken(defaultNet.tokens[0].address);
            }
          }
        }
      } catch (error) {
        console.error('Failed to fetch networks:', error);
        setError('Failed to load payment networks');
      }
    };
    fetchNetworks();
  }, [facilitatorUrl]);

  // Check rate limit on address change
  useEffect(() => {
    if (address) {
      checkRateLimit();
    }
  }, [address]);

  const checkRateLimit = async () => {
    if (!address) return;
    try {
      const res = await fetch(`/api/demo/rate-limit?address=${address}`);
      const data = await res.json();
      setSettleCount(data.count || 0);
      if (data.count >= DAILY_LIMIT) {
        setRateError(`Daily limit reached (${DAILY_LIMIT} settlements). Try again tomorrow.`);
      } else {
        setRateError('');
      }
    } catch (e) {
      console.error('Rate limit check failed:', e);
    }
  };

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

  // Check if wallet chain matches selected network
  const needsChainSwitch = networkConfig && chainId !== networkConfig.chainId;

  const handleConnect = () => {
    connect({ connector: injected() });
  };

  const validateRecipient = (addr: string): boolean => {
    return /^0x[a-fA-F0-9]{40}$/.test(addr);
  };

  const handleProceedToPayment = () => {
    if (!validateRecipient(recipientAddress)) {
      setError('Please enter a valid recipient address');
      return;
    }
    if (settleCount >= DAILY_LIMIT) {
      setError(rateError);
      return;
    }
    setError('');
    setStep('payment');
  };

  const handlePay = async () => {
    if (!address || !networkConfig || !tokenConfig || !recipientAddress) {
      setError('Missing required configuration');
      return;
    }

    // Check chain
    if (needsChainSwitch) {
      try {
        await switchChain({ chainId: networkConfig.chainId });
        return; // Let the user click pay again after switching
      } catch (e) {
        setError('Please switch to the correct network in your wallet');
        return;
      }
    }

    setProcessing(true);
    setError('');

    try {
      // Generate nonce
      const nonce = '0x' + Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      const amountInMicro = Math.floor(parseFloat(paymentAmount) * 1_000_000).toString();
      const now = Math.floor(Date.now() / 1000);
      const validAfter = now;
      const validBefore = now + 3600;

      // Create authorization message
      const authorization = {
        from: address,
        to: recipientAddress as `0x${string}`,
        value: BigInt(amountInMicro),
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

      // Create X-PAYMENT payload
      const xPaymentData = {
        authorization: {
          from: address,
          to: recipientAddress,
          value: amountInMicro,
          validAfter: validAfter.toString(),
          validBefore: validBefore.toString(),
          nonce: nonce
        },
        signature,
        network: networkConfig.network,
        asset: tokenConfig.address
      };
      const xPaymentHeader = btoa(JSON.stringify(xPaymentData));

      // Call demo settle endpoint (rate limited, uses demo API key)
      const response = await fetch('/api/demo/settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          xPayment: xPaymentHeader,
          network: networkConfig.network,
          amount: amountInMicro,
          recipient: recipientAddress,
        }),
      });

      const result = await response.json();

      if (result.success) {
        setTransactionHash(result.transactionHash);
        setPaymentNetwork(networkConfig.network);
        setSettleCount(prev => prev + 1);
        setStep('success');
      } else {
        setError(result.error || 'Settlement failed');
      }
    } catch (err: unknown) {
      console.error('Payment error:', err);
      if (err instanceof Error) {
        if (err.message.includes('rejected')) {
          setError('Transaction was rejected');
        } else {
          setError(err.message || 'Payment failed');
        }
      } else {
        setError('Payment failed. Please try again.');
      }
    } finally {
      setProcessing(false);
    }
  };

  const handleReset = () => {
    setTransactionHash('');
    setPaymentNetwork('');
    setStep('config');
    setError('');
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      {/* Navigation */}
      <nav className="border-b border-neutral-800">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center">
                <span className="text-black font-bold text-sm">N</span>
              </div>
              <span className="text-xl font-semibold text-white">NetPay</span>
            </Link>
            <div className="flex items-center gap-4">
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

      {/* Main Content */}
      <main className="max-w-2xl mx-auto px-6 py-12">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Payment Demo</h1>
          <p className="text-neutral-400">
            Try NetPay&apos;s instant USDC settlement
          </p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {['Configure', 'Pay', 'Done'].map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                i === 0 && step === 'config' ? 'bg-amber-500 text-black' :
                i === 1 && step === 'payment' ? 'bg-amber-500 text-black' :
                i === 2 && step === 'success' ? 'bg-green-500 text-black' :
                (step === 'payment' && i === 0) || (step === 'success' && i <= 1) ? 'bg-green-500/20 text-green-400' :
                'bg-neutral-800 text-neutral-500'
              }`}>
                {(step === 'payment' && i === 0) || (step === 'success' && i <= 1) ? '✓' : i + 1}
              </div>
              <span className={`text-sm ${
                (step === 'config' && i === 0) || (step === 'payment' && i === 1) || (step === 'success' && i === 2)
                  ? 'text-white' : 'text-neutral-500'
              }`}>{label}</span>
              {i < 2 && <div className="w-12 h-px bg-neutral-800 mx-2" />}
            </div>
          ))}
        </div>

        {/* Config Step */}
        {step === 'config' && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 space-y-6">
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

            {/* Network */}
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-2">
                Network
              </label>
              <select
                value={selectedNetwork}
                onChange={(e) => handleNetworkChange(e.target.value)}
                className="w-full px-4 py-3 bg-neutral-950 border border-neutral-800 rounded-lg text-white focus:outline-none focus:border-amber-500"
              >
                {networks.map((net) => (
                  <option key={net.network} value={net.network}>
                    {net.network}
                  </option>
                ))}
              </select>
            </div>

            {/* Rate Limit Info */}
            {address && (
              <div className="p-3 bg-neutral-950 rounded-lg">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-neutral-400">Daily usage</span>
                  <span className={settleCount >= DAILY_LIMIT ? 'text-red-400' : 'text-green-400'}>
                    {settleCount}/{DAILY_LIMIT} settlements
                  </span>
                </div>
              </div>
            )}

            {/* Error Display */}
            {(error || rateError) && (
              <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-red-400 text-sm">{error || rateError}</p>
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
                disabled={!recipientAddress || settleCount >= DAILY_LIMIT}
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
                <span className="text-white">{selectedNetwork}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-neutral-400">Token</span>
                <span className="text-white">{tokenConfig?.symbol}</span>
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
                  Please switch to {selectedNetwork} in your wallet to continue
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
                Your payment has been settled on {paymentNetwork}
              </p>
            </div>

            {/* Transaction Info */}
            {transactionHash && (
              <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                <p className="text-green-400 text-sm font-medium mb-2">Transaction Hash</p>
                <a 
                  href={getExplorerUrl(paymentNetwork, transactionHash)}
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
                This demo uses NetPay&apos;s facilitator to settle USDC payments instantly. 
                Sign the ERC-3009 authorization, and we&apos;ll execute the transfer on-chain.
                Limited to {DAILY_LIMIT} settlements per address daily.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
