'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount, useConnect, useDisconnect, useSignTypedData, useChainId, useSwitchChain } from 'wagmi';
import { injected } from 'wagmi/connectors';
import Link from 'next/link';
import { WalletConnect } from './components/WalletConnect';

// Constants
const VAULT_ADDRESS = '0xaEc38404154C8EA2b9cfcCcF6c0E42A39ee30d54';
const FACILITATOR_URL = process.env.NEXT_PUBLIC_FACILITATOR_URL || 'https://api.netpay.id';

// Validation helpers
const isValidApiKey = (key: string): boolean => /^[A-Za-z0-9]{64}$/.test(key);
const isValidAddress = (addr: string): boolean => /^0x[a-fA-F0-9]{40}$/.test(addr);
const isValidAmount = (amount: string, min = 0.001, max = 10000): boolean => {
  const num = parseFloat(amount);
  return !isNaN(num) && num >= min && num <= max;
};

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
  // View state
  const [activeView, setActiveView] = useState<'none' | 'purchase' | 'demo'>('none');
  
  // Network data
  const [networksData, setNetworksData] = useState<NetworksResponse | null>(null);
  const [networkType, setNetworkType] = useState<'testnet' | 'mainnet'>('mainnet');
  const [selectedNetwork, setSelectedNetwork] = useState<NetworkConfig | null>(null);
  
  // Purchase state
  const [purchaseAmount, setPurchaseAmount] = useState<string>('10');
  const [purchaseProcessing, setPurchaseProcessing] = useState(false);
  const [purchaseError, setPurchaseError] = useState('');
  const [purchaseSuccess, setPurchaseSuccess] = useState<{ apiKey?: string; transaction?: string; balance?: string } | null>(null);
  const [existingApiKey, setExistingApiKey] = useState('');
  const [isTopUp, setIsTopUp] = useState(false);

  // Demo state
  const [apiKey, setApiKey] = useState('');
  const [apiKeyValidated, setApiKeyValidated] = useState(false);
  const [validatingKey, setValidatingKey] = useState(false);
  const [keyBalance, setKeyBalance] = useState<string | null>(null);
  const [demoStep, setDemoStep] = useState<'apikey' | 'config' | 'payment' | 'success'>('apikey');
  const [recipientAddress, setRecipientAddress] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('0.01');
  const [demoProcessing, setDemoProcessing] = useState(false);
  const [demoError, setDemoError] = useState('');
  const [transactionHash, setTransactionHash] = useState('');
  const [paymentChainId, setPaymentChainId] = useState<number | null>(null);
  const [demoFees, setDemoFees] = useState<any | null>(null);

  // Wagmi hooks
  const { address, isConnected, connector } = useAccount();
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
          
          // Default to first mainnet network with USDC, fall back to testnet
          const mainnetsWithUsdc = data.mainnet.filter(n => n.tokens.some(t => t.symbol === 'USDC'));
          if (mainnetsWithUsdc.length > 0) {
            setSelectedNetwork(mainnetsWithUsdc[0]);
          } else {
            const testnetsWithUsdc = data.testnet.filter(n => n.tokens.some(t => t.symbol === 'USDC'));
            if (testnetsWithUsdc.length > 0) setSelectedNetwork(testnetsWithUsdc[0]);
          }
        }
      } catch (err) {
        console.error('Failed to fetch networks:', err);
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
    setPurchaseError('');
    setDemoError('');
    setPurchaseSuccess(null);
  };

  const handleViewToggle = (view: 'purchase' | 'demo') => {
    if (activeView === view) {
      setActiveView('none');
    } else {
      setActiveView(view);
      // Reset states when switching
      if (view === 'purchase') {
        setPurchaseError('');
        setPurchaseSuccess(null);
      } else {
        setDemoError('');
        if (!apiKeyValidated) {
          setDemoStep('apikey');
        }
      }
    }
  };

  // ========== PURCHASE FUNCTIONS ==========
  const handlePurchase = async () => {
    if (!address || !selectedNetwork || !usdcToken) {
      setPurchaseError('Please connect wallet and select network');
      return;
    }

    if (needsChainSwitch) {
      try {
        await switchChain({ chainId: selectedNetwork.chainId });
        return;
      } catch {
        setPurchaseError('Please switch to the correct network in your wallet');
        return;
      }
    }

    setPurchaseProcessing(true);
    setPurchaseError('');
    setPurchaseSuccess(null);

    try {
      const nonce = '0x' + Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      const amountInMicro = Math.floor(parseFloat(purchaseAmount) * 1_000_000).toString();
      const now = Math.floor(Date.now() / 1000);
      const validAfter = 0;
      const validBefore = now + 3600;

      const authorization = {
        from: address,
        to: VAULT_ADDRESS as `0x${string}`,
        value: BigInt(amountInMicro),
        validAfter: BigInt(validAfter),
        validBefore: BigInt(validBefore),
        nonce: nonce as `0x${string}`
      };

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

      // Build request body for JSON API
      const requestBody: Record<string, unknown> = {
        paymentSignature
      };

      // Add API key for top-up
      if (isTopUp && existingApiKey) {
        requestBody.apiKey = existingApiKey;
      }

      const response = await fetch(`${FACILITATOR_URL}/account`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const result = await response.json();

      if (result.success) {
        setPurchaseSuccess({
          apiKey: result.apiKey,
          transaction: result.transaction,
          balance: result.usdc || result.newBalance,
        });
      } else {
        setPurchaseError(result.error || 'Purchase failed');
      }
    } catch (err: unknown) {
      console.error('Purchase error:', err);
      if (err instanceof Error) {
        if (err.message.includes('rejected')) {
          setPurchaseError('Transaction was rejected');
        } else {
          setPurchaseError(err.message || 'Purchase failed');
        }
      } else {
        setPurchaseError('Purchase failed. Please try again.');
      }
    } finally {
      setPurchaseProcessing(false);
    }
  };

  const handlePurchaseReset = () => {
    setPurchaseSuccess(null);
    setPurchaseError('');
    setExistingApiKey('');
    setIsTopUp(false);
  };

  // ========== DEMO FUNCTIONS ==========
  const validateApiKey = useCallback(async () => {
    const keyRegex = /^[A-Za-z0-9]{64}$/;
    if (!apiKey || !keyRegex.test(apiKey)) {
      setDemoError('API key must be 64 alphanumeric characters (no special characters)');
      return;
    }

    setValidatingKey(true);
    setDemoError('');
    
    try {
      const response = await fetch(`${FACILITATOR_URL}/account`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ action: 'balance' }),
      });

      if (response.ok) {
        const data = await response.json();
        // Prefer testnet balance, then mainnet, then generic fields
        const balance = data.testnetBalance || data.mainnetBalance || data.balance || data.usdc || null;
        setKeyBalance(balance);
        setApiKeyValidated(true);
        setDemoStep('config');
      } else if (response.status === 401) {
        setDemoError('Invalid API key. Please check and try again.');
      } else {
        const data = await response.json().catch(() => ({}));
        setDemoError(data.error || 'Failed to validate API key');
      }
    } catch (err) {
      setDemoError('Failed to connect to API. Please try again.');
    } finally {
      setValidatingKey(false);
    }
  }, [apiKey]);

  const handleProceedToPayment = () => {
    if (!recipientAddress || !recipientAddress.startsWith('0x') || recipientAddress.length !== 42) {
      setDemoError('Please enter a valid recipient address');
      return;
    }
    setDemoError('');
    setDemoStep('payment');
  };

  const handleDemoPay = async () => {
    if (!address || !selectedNetwork || !usdcToken || !recipientAddress) {
      setDemoError('Missing required payment details');
      return;
    }

    if (needsChainSwitch) {
      try {
        switchChain({ chainId: selectedNetwork.chainId });
      } catch {
        setDemoError('Please switch to the correct network in your wallet');
      }
      return;
    }

    setDemoProcessing(true);
    setDemoError('');

    try {
      // Match merchant-demo exactly: use string amounts and checksummed addresses
      const amount = Math.floor(parseFloat(paymentAmount) * (10 ** usdcToken.decimals)).toString();
      const validAfter = Math.floor(Date.now() / 1000).toString();
      const validBefore = (Math.floor(Date.now() / 1000) + 3600).toString();
      const nonce = '0x' + Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map(b => b.toString(16).padStart(2, '0')).join('');

      // Keep original checksummed addresses (DO NOT lowercase - signature depends on exact bytes)
      const authorization = {
        from: address,
        to: recipientAddress,
        value: amount,
        validAfter,
        validBefore,
        nonce
      };

      // Use token.eip712 values from /networks response (like merchant-demo)
      const domain = {
        name: usdcToken.eip712.name,
        version: usdcToken.eip712.version,
        chainId: selectedNetwork.chainId,
        verifyingContract: usdcToken.eip712.verifyingContract as `0x${string}`
      };

      const types = {
        TransferWithAuthorization: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'validAfter', type: 'uint256' },
          { name: 'validBefore', type: 'uint256' },
          { name: 'nonce', type: 'bytes32' }
        ]
      };

      // Sign with authorization object directly (like merchant-demo)
      const signature = await signTypedDataAsync({
        domain,
        types,
        primaryType: 'TransferWithAuthorization',
        message: authorization as any
      });

      // Build payload matching merchant-demo structure
      const paymentPayload = {
        authorization,
        signature
      };

      const paymentRequirements = {
        scheme: 'exact',
        network: selectedNetwork.network,
        asset: usdcToken.address,
        payTo: recipientAddress,
        maxAmountRequired: amount,
        resource: '/demo/payment',
        description: 'NetPay demo payment',
        mimeType: 'application/json',
        maxTimeoutSeconds: 60,
      };

      const payload = {
        x402Version: 2,
        paymentPayload,
        paymentRequirements,
      };

      // Use JSON body for facilitator API
      const requestBody = {
        paymentPayload,
        paymentRequirements,
      };

      const response = await fetch(`${FACILITATOR_URL}/settle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        const tx = result.transaction || result.txHash || result.transactionHash || result.tx || '';
        setTransactionHash(tx);

        // Derive chainId for explorer link: prefer result.network, fall back to selected network
        let chainIdToUse = selectedNetwork.chainId;
        if (result.network && typeof result.network === 'string') {
          const m = result.network.match(/eip155:(\d+)/i);
          if (m) {
            chainIdToUse = parseInt(m[1], 10);
          } else if (/^\d+$/.test(result.network)) {
            chainIdToUse = parseInt(result.network, 10);
          } else {
            const found = availableNetworks.find(n => n.network.toLowerCase() === result.network.toLowerCase() || n.network.replace(/\s+/g, '-').toLowerCase() === result.network.toLowerCase());
            if (found) chainIdToUse = found.chainId;
          }
        }

        setPaymentChainId(chainIdToUse);
        // Update fees and merchant API key balance if provided
        if (result.fees) {
          setDemoFees(result.fees);
          if (result.fees.balanceAfter) setKeyBalance(result.fees.balanceAfter);
        } else {
          setDemoFees(null);
        }

        setDemoStep('success');
      } else {
        setDemoError(result.error || 'Settlement failed');
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Payment failed';
      if (errorMessage.includes('rejected') || errorMessage.includes('denied')) {
        setDemoError('Transaction was rejected');
      } else {
        setDemoError(errorMessage);
      }
    } finally {
      setDemoProcessing(false);
    }
  };

  const handleDemoReset = () => {
    setDemoStep('config');
    setRecipientAddress('');
    setPaymentAmount('0.01');
    setTransactionHash('');
    setPaymentChainId(null);
    setDemoError('');
    setDemoFees(null);
  };

  const handleChangeApiKey = () => {
    setApiKeyValidated(false);
    setKeyBalance(null);
    setDemoStep('apikey');
    setDemoError('');
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      {/* Navigation */}
      <nav className="border-b border-neutral-800">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <div className="site-logo rounded-lg flex items-center justify-center overflow-hidden">
                <img src="/logo.svg" alt="NetPay" />
              </div>
            </Link>
            <div className="flex items-center gap-4">
              <Link href="/docs" className="text-sm text-neutral-400 hover:text-white transition-colors">
                API Docs
              </Link>
              <WalletConnect />
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
            X402 USDC Payments<br/>
            <span className="text-amber-500">for Developers</span>
          </h1>
          <p className="text-lg text-neutral-400 max-w-xl mx-auto mb-8">
            x402 facilitator service for instant USDC payment settlements. 
            Non-custodial, sub-second confirmation on multiple chains.
          </p>
          
          {/* Two Action Options */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center max-w-md mx-auto">
            <button
              onClick={() => handleViewToggle('purchase')}
              className={`flex-1 px-6 py-4 font-medium rounded-lg transition-all text-center ${
                activeView === 'purchase'
                  ? 'bg-amber-500 text-black shadow-lg'
                  : 'bg-neutral-900 text-neutral-300 hover:bg-neutral-800 hover:text-white border border-neutral-800'
              }`}
            >
              Purchase Credits
            </button>
            <button
              onClick={() => handleViewToggle('demo')}
              className={`flex-1 px-6 py-4 font-medium rounded-lg transition-all text-center ${
                activeView === 'demo'
                  ? 'bg-amber-500 text-black shadow-lg'
                  : 'bg-neutral-900 text-neutral-300 hover:bg-neutral-800 hover:text-white border border-neutral-800'
              }`}
            >
              Try Demo
            </button>
          </div>
        </div>

        {/* Purchase Credits Section */}
        {activeView === 'purchase' && (
          <div className="max-w-xl mx-auto">
            {purchaseSuccess ? (
              // Success State
              <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 space-y-6">
                <div className="text-center">
                  <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h2 className="text-2xl font-bold mb-2">
                    {purchaseSuccess.apiKey ? 'Credits Purchased!' : 'Top-up Successful!'}
                  </h2>
                  <p className="text-neutral-400">
                    Your balance: <span className="text-amber-500 font-semibold">{purchaseSuccess.balance} USDC</span>
                  </p>
                </div>

                {purchaseSuccess.apiKey && (
                  <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                    <p className="text-amber-400 text-sm font-medium mb-2">⚠️ Save your API Key - shown only once!</p>
                    <div className="relative">
                      <input
                        type="text"
                        value={purchaseSuccess.apiKey}
                        readOnly
                        className="w-full px-4 py-3 pr-24 bg-neutral-950 border border-neutral-800 rounded-lg text-white font-mono text-sm"
                      />
                      <button
                        onClick={() => navigator.clipboard.writeText(purchaseSuccess.apiKey!)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black text-sm font-medium rounded transition-colors"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                )}

                {purchaseSuccess.transaction && selectedNetwork && (
                  <div className="p-4 bg-neutral-950 rounded-lg">
                    <p className="text-neutral-400 text-sm mb-2">Transaction</p>
                    <a 
                      href={getExplorerUrl(selectedNetwork.chainId, purchaseSuccess.transaction)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-mono text-amber-500 hover:text-amber-400 break-all flex items-center gap-1"
                    >
                      {purchaseSuccess.transaction.slice(0, 20)}...{purchaseSuccess.transaction.slice(-16)}
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={handlePurchaseReset}
                    className="flex-1 px-6 py-4 border border-neutral-700 text-neutral-300 rounded-lg font-semibold hover:border-neutral-600 transition-colors"
                  >
                    Purchase More
                  </button>
                  <button
                    onClick={() => handleViewToggle('demo')}
                    className="flex-1 px-6 py-4 bg-amber-500 hover:bg-amber-400 text-black rounded-lg font-semibold transition-colors"
                  >
                    Try Demo
                  </button>
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
                      onClick={() => handleNetworkTypeChange('mainnet')}
                      className={`flex-1 py-2.5 text-sm font-medium rounded-md transition-colors ${
                        networkType === 'mainnet'
                          ? 'bg-amber-500 text-black'
                          : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      Mainnet
                    </button>
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
                      className={`w-full px-4 py-3 bg-neutral-950 border rounded-lg text-white focus:outline-none ${
                        purchaseAmount && !isValidAmount(purchaseAmount, 1, 10000)
                          ? 'border-red-500/50 focus:border-red-500'
                          : 'border-neutral-800 focus:border-amber-500'
                      }`}
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500">
                      ≈ {Math.floor(parseFloat(purchaseAmount || '0') * 900)} settlements
                    </div>
                  </div>
                  {purchaseAmount && !isValidAmount(purchaseAmount, 1, 10000) && (
                    <p className="text-xs text-red-400 mt-1">
                      Amount must be between 1 and 10,000 USDC
                    </p>
                  )}
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
                      onChange={(e) => setExistingApiKey(e.target.value.replace(/[^A-Za-z0-9]/g, ''))}
                      placeholder="64 character alphanumeric key..."
                      maxLength={64}
                      className={`w-full px-4 py-3 bg-neutral-950 border rounded-lg text-white placeholder-neutral-600 focus:outline-none font-mono text-sm ${
                        existingApiKey && !isValidApiKey(existingApiKey)
                          ? 'border-red-500/50 focus:border-red-500'
                          : 'border-neutral-800 focus:border-amber-500'
                      }`}
                    />
                    {existingApiKey && !isValidApiKey(existingApiKey) && (
                      <p className="text-xs text-red-400 mt-1">
                        API key must be exactly 64 alphanumeric characters ({existingApiKey.length}/64)
                      </p>
                    )}
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
                {purchaseError && (
                  <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                    <p className="text-red-400 text-sm">{purchaseError}</p>
                  </div>
                )}

                {/* Action Button */}
                {!isConnected ? (
                  <div className="w-full">
                    <WalletConnect />
                  </div>
                ) : (
                  <button
                    onClick={handlePurchase}
                    disabled={
                      purchaseProcessing ||
                      !selectedNetwork ||
                      !isValidAmount(purchaseAmount, 1, 10000) ||
                      (isTopUp && !isValidApiKey(existingApiKey))
                    }
                    className="w-full px-6 py-4 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {purchaseProcessing ? (
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
        )}

        {/* Demo Section */}
        {activeView === 'demo' && (
          <div className="max-w-xl mx-auto">
            {/* API Key Step */}
            {demoStep === 'apikey' && (
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
                    onChange={(e) => setApiKey(e.target.value.replace(/[^A-Za-z0-9]/g, ''))}
                    placeholder="64 character alphanumeric key..."
                    maxLength={64}
                    className={`w-full px-4 py-3 bg-neutral-950 border rounded-lg text-white placeholder-neutral-600 focus:outline-none font-mono text-sm ${
                      apiKey && !isValidApiKey(apiKey)
                        ? 'border-red-500/50 focus:border-red-500'
                        : 'border-neutral-800 focus:border-amber-500'
                    }`}
                  />
                  {apiKey && !isValidApiKey(apiKey) && (
                    <p className="text-xs text-red-400 mt-1">
                      API key must be exactly 64 alphanumeric characters ({apiKey.length}/64)
                    </p>
                  )}
                  <p className="text-xs text-neutral-500 mt-2">
                    Don&apos;t have an API key? <button onClick={() => handleViewToggle('purchase')} className="text-amber-500 hover:text-amber-400">Purchase credits</button> to get one.
                  </p>
                </div>

                {demoError && (
                  <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                    <p className="text-red-400 text-sm">{demoError}</p>
                  </div>
                )}

                <button
                  onClick={validateApiKey}
                  disabled={!isValidApiKey(apiKey) || validatingKey}
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
            {demoStep === 'config' && (
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
                      onClick={() => handleNetworkTypeChange('mainnet')}
                      className={`flex-1 py-2.5 text-sm font-medium rounded-md transition-colors ${
                        networkType === 'mainnet'
                          ? 'bg-amber-500 text-black'
                          : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      Mainnet
                    </button>
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
                    maxLength={42}
                    className={`w-full px-4 py-3 bg-neutral-950 border rounded-lg text-white placeholder-neutral-600 focus:outline-none ${
                      recipientAddress && !isValidAddress(recipientAddress)
                        ? 'border-red-500/50 focus:border-red-500'
                        : 'border-neutral-800 focus:border-amber-500'
                    }`}
                  />
                  {recipientAddress && !isValidAddress(recipientAddress) ? (
                    <p className="text-xs text-red-400 mt-1">
                      Invalid address. Must be 0x followed by 40 hex characters.
                    </p>
                  ) : (
                    <p className="text-xs text-neutral-500 mt-1">
                      The wallet address that will receive the payment
                    </p>
                  )}
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
                    className={`w-full px-4 py-3 bg-neutral-950 border rounded-lg text-white focus:outline-none ${
                      paymentAmount && !isValidAmount(paymentAmount, 0.001, 10)
                        ? 'border-red-500/50 focus:border-red-500'
                        : 'border-neutral-800 focus:border-amber-500'
                    }`}
                  />
                  {paymentAmount && !isValidAmount(paymentAmount, 0.001, 10) && (
                    <p className="text-xs text-red-400 mt-1">
                      Amount must be between 0.001 and 10 USDC
                    </p>
                  )}
                </div>

                {demoError && (
                  <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                    <p className="text-red-400 text-sm">{demoError}</p>
                  </div>
                )}

                {!isConnected ? (
                  <div className="w-full">
                    <WalletConnect />
                  </div>
                ) : (
                  <button
                    onClick={handleProceedToPayment}
                    disabled={
                      !isValidAddress(recipientAddress) ||
                      !isValidAmount(paymentAmount, 0.001, 10)
                    }
                    className="w-full px-6 py-4 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Continue to Payment
                  </button>
                )}
              </div>
            )}

            {/* Payment Step */}
            {demoStep === 'payment' && (
              <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 space-y-6">
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

                {needsChainSwitch && (
                  <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                    <p className="text-yellow-400 text-sm">
                      Please switch to {selectedNetwork?.network} in your wallet to continue
                    </p>
                  </div>
                )}

                {demoError && (
                  <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                    <p className="text-red-400 text-sm">{demoError}</p>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => setDemoStep('config')}
                    disabled={demoProcessing}
                    className="flex-1 px-6 py-4 border border-neutral-700 text-neutral-300 rounded-lg font-semibold hover:border-neutral-600 disabled:opacity-50 transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleDemoPay}
                    disabled={demoProcessing}
                    className="flex-1 px-6 py-4 bg-amber-500 hover:bg-amber-400 text-black rounded-lg font-semibold disabled:opacity-50 transition-colors"
                  >
                    {demoProcessing ? (
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
            {demoStep === 'success' && (
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

                {transactionHash && (
                  <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                    <p className="text-green-400 text-sm font-medium mb-2">Transaction Hash</p>
                    <a 
                      href={getExplorerUrl(paymentChainId!, transactionHash)}
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

                {demoFees && (
                  <div className="p-4 bg-neutral-900/60 border border-neutral-800 rounded-lg">
                    <h3 className="text-sm font-semibold text-neutral-300 mb-2">Fees & Balance</h3>
                    <div className="grid grid-cols-2 gap-2 text-sm text-neutral-400">
                      <div>Service Fee</div>
                      <div className="text-right text-amber-500 font-mono">{demoFees.serviceFee}</div>
                      <div>Gas Cost</div>
                      <div className="text-right text-amber-500 font-mono">{demoFees.gasCost}</div>
                      <div>Total Fees</div>
                      <div className="text-right text-amber-500 font-mono">{demoFees.totalFees}</div>
                      <div>Balance After</div>
                      <div className="text-right text-emerald-400 font-mono">{demoFees.balanceAfter} ({demoFees.balanceType})</div>
                    </div>
                  </div>
                )}

                <button
                  onClick={handleDemoReset}
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
          </div>
        )}
      </section>

      {/* Info Cards */}
      <>
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
        </>

      {/* Footer */}
      <footer className="border-t border-neutral-800 bg-neutral-900/30">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="flex items-center justify-center">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-amber-500 rounded flex items-center justify-center">
                <span className="text-black font-bold text-xs">N</span>
              </div>
              <span className="text-neutral-400 text-sm">NetPay © 2026</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
