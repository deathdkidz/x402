'use client';

import { useState, useEffect } from 'react';
import { useAccount, useSignTypedData, useDisconnect } from 'wagmi';
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

export default function TestPage() {
  const { address, isConnected } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const { disconnect } = useDisconnect();
  
  const [apiKey, setApiKey] = useState('');
  const [merchantAddress, setMerchantAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [networks, setNetworks] = useState<NetworkConfig[]>([]);
  const [results, setResults] = useState<{
    health?: any;
    networks?: any;
    payload?: any;
    verify?: any;
    settle?: any;
  }>({});

  const [facilitatorUrl, setFacilitatorUrl] = useState(process.env.NEXT_PUBLIC_FACILITATOR_URL || 'http://localhost:8080');
  const [network, setNetwork] = useState('');
  const [selectedToken, setSelectedToken] = useState('');
  const [amount, setAmount] = useState('1');
  const [batchCount, setBatchCount] = useState(10);
  const [batchResults, setBatchResults] = useState<any>(null);

  useEffect(() => {
    const stored = localStorage.getItem('x402_api_key');
    if (stored) setApiKey(stored);
  }, []);

  // Fetch supported networks
  useEffect(() => {
    const fetchNetworks = async () => {
      try {
        const response = await fetch(`${facilitatorUrl}/networks`);
        if (response.ok) {
          const data = await response.json();
          setNetworks(data.networks);
          setResults(prev => ({ ...prev, networks: { success: true, data } }));
          if (data.networks.length > 0) {
            setNetwork(data.networks[0].network);
            if (data.networks[0].tokens.length > 0) {
              setSelectedToken(data.networks[0].tokens[0].address);
            }
          }
        }
      } catch (error) {
        setResults(prev => ({ ...prev, networks: { success: false, error: error instanceof Error ? error.message : 'Failed' } }));
      }
    };

    fetchNetworks();
  }, [facilitatorUrl]);

  // Fetch merchant address when API key is available
  useEffect(() => {
    const fetchMerchantAddress = async () => {
      if (!apiKey) return;
      
      try {
        const response = await fetch(`${facilitatorUrl}/merchant`, {
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
  }, [apiKey, facilitatorUrl]);

  const testHealthCheck = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${facilitatorUrl}/health`);
      const data = await response.json();
      setResults(prev => ({ ...prev, health: { success: true, data } }));
    } catch (error) {
      setResults(prev => ({ ...prev, health: { success: false, error: error instanceof Error ? error.message : 'Failed' } }));
    }
    setLoading(false);
  };

  const testGeneratePayload = async () => {
    if (!address || !merchantAddress || !selectedToken) return;
    
    setLoading(true);
    try {
      const networkConfig = networks.find(n => n.network === network);
      const tokenConfig = networkConfig?.tokens.find(t => t.address.toLowerCase() === selectedToken.toLowerCase());
      if (!networkConfig || !tokenConfig) throw new Error('Network or token not found');
      
      // Create payment request payload using EIP-712 format
      const validAfter = Math.floor(Date.now() / 1000);
      const validBefore = validAfter + 3600; // 1 hour validity
      const nonce = `0x${Array.from({length: 64}, () => Math.floor(Math.random() * 16).toString(16)).join('')}`;
      
      const payload = {
        from: address,
        to: merchantAddress,
        value: (parseFloat(amount) * Math.pow(10, tokenConfig.decimals)).toString(),
        validAfter: validAfter.toString(),
        validBefore: validBefore.toString(),
        nonce: nonce
      };

      // Sign with EIP-712 typed data for better wallet UX
      const signature = await signTypedDataAsync({
        domain: {
          name: tokenConfig.eip712?.name || tokenConfig.name,
          version: tokenConfig.eip712?.version || '2',
          chainId: networkConfig.chainId,
          verifyingContract: tokenConfig.address as `0x${string}`
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

      setResults(prev => ({ 
        ...prev, 
        payload: { 
          success: true, 
          data: { payload, signature } 
        } 
      }));
    } catch (error) {
      setResults(prev => ({ ...prev, payload: { success: false, error: error instanceof Error ? error.message : 'Failed' } }));
    }
    setLoading(false);
  };

  const testVerify = async () => {
    if (!address || !results.payload?.data?.signature || !selectedToken) return;
    
    setLoading(true);
    try {
      const networkConfig = networks.find(n => n.network === network);
      const tokenConfig = networkConfig?.tokens.find(t => t.address.toLowerCase() === selectedToken.toLowerCase());
      if (!tokenConfig) throw new Error('Token not found');
      
      const response = await fetch(`${facilitatorUrl}/verify`, {
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
              authorization: results.payload.data.payload,
              signature: results.payload.data.signature
            }
          },
          paymentRequirements: {
            scheme: 'erc3009',
            network: network,
            asset: selectedToken,
            payTo: merchantAddress,
            maxAmountRequired: (parseFloat(amount) * Math.pow(10, tokenConfig.decimals)).toString(),
            resource: '/test',
            description: 'Test payment',
            mimeType: 'application/json',
            maxTimeoutSeconds: 3600
          }
        })
      });
      const data = await response.json();
      setResults(prev => ({ ...prev, verify: { success: response.ok, data } }));
    } catch (error) {
      setResults(prev => ({ ...prev, verify: { success: false, error: error instanceof Error ? error.message : 'Failed' } }));
    }
    setLoading(false);
  };

  const testSettle = async () => {
    if (!results.payload?.data || !selectedToken) return;
    
    setLoading(true);
    try {
      const networkConfig = networks.find(n => n.network === network);
      const tokenConfig = networkConfig?.tokens.find(t => t.address.toLowerCase() === selectedToken.toLowerCase());
      if (!tokenConfig) throw new Error('Token not found');
      
      const response = await fetch(`${facilitatorUrl}/settle`, {
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
              authorization: results.payload.data.payload,
              signature: results.payload.data.signature
            }
          },
          paymentRequirements: {
            scheme: 'erc3009',
            network: network,
            asset: selectedToken,
            payTo: merchantAddress,
            maxAmountRequired: (parseFloat(amount) * Math.pow(10, tokenConfig.decimals)).toString(),
            resource: '/test',
            description: 'Test payment',
            mimeType: 'application/json',
            maxTimeoutSeconds: 3600
          }
        })
      });
      const data = await response.json();
      setResults(prev => ({ ...prev, settle: { success: response.ok, data } }));
    } catch (error) {
      setResults(prev => ({ ...prev, settle: { success: false, error: error instanceof Error ? error.message : 'Failed' } }));
    }
    setLoading(false);
  };

  const testBatchGenerate = async () => {
    if (!address || !merchantAddress || !selectedToken) return;
    
    setLoading(true);
    setBatchResults(null);
    
    try {
      const networkConfig = networks.find(n => n.network === network);
      const tokenConfig = networkConfig?.tokens.find(t => t.address.toLowerCase() === selectedToken.toLowerCase());
      if (!networkConfig || !tokenConfig) throw new Error('Network or token not found');
      
      const startTime = Date.now();
      const payloads = [];
      
      console.log(`🚀 Generating ${batchCount} payment payloads...`);
      
      for (let i = 0; i < batchCount; i++) {
        const validAfter = Math.floor(Date.now() / 1000);
        const validBefore = validAfter + 3600;
        const nonce = `0x${Array.from({length: 64}, () => Math.floor(Math.random() * 16).toString(16)).join('')}`;
        
        const payload = {
          from: address,
          to: merchantAddress,
          value: (parseFloat(amount) * Math.pow(10, tokenConfig.decimals)).toString(),
          validAfter: validAfter.toString(),
          validBefore: validBefore.toString(),
          nonce: nonce
        };

        const signature = await signTypedDataAsync({
          domain: {
            name: tokenConfig.eip712?.name || tokenConfig.name,
            version: tokenConfig.eip712?.version || '2',
            chainId: networkConfig.chainId,
            verifyingContract: tokenConfig.address as `0x${string}`
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

        payloads.push({ payload, signature });
        console.log(`✓ Generated payload ${i + 1}/${batchCount}`);
      }
      
      const generationTime = Date.now() - startTime;
      
      setBatchResults({
        success: true,
        count: batchCount,
        generationTime,
        avgPerPayload: (generationTime / batchCount).toFixed(2),
        payloads
      });
      
      setResults(prev => ({ ...prev, payload: { success: true, data: payloads[0] } }));
    } catch (error) {
      setBatchResults({ success: false, error: error instanceof Error ? error.message : 'Failed' });
    }
    setLoading(false);
  };

  const testBatchSettle = async () => {
    if (!batchResults?.payloads || !selectedToken) return;
    
    setLoading(true);
    
    try {
      const networkConfig = networks.find(n => n.network === network);
      const tokenConfig = networkConfig?.tokens.find(t => t.address.toLowerCase() === selectedToken.toLowerCase());
      if (!tokenConfig) throw new Error('Token not found');
      
      const startTime = Date.now();
      const results = [];
      
      console.log(`🚀 Settling ${batchResults.payloads.length} payments in parallel...`);
      
      // Send all requests in parallel
      const promises = batchResults.payloads.map(async (item: any, index: number) => {
        const requestStart = Date.now();
        
        try {
          const response = await fetch(`${facilitatorUrl}/settle`, {
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
                  authorization: item.payload,
                  signature: item.signature
                }
              },
              paymentRequirements: {
                scheme: 'erc3009',
                network: network,
                asset: selectedToken,
                payTo: merchantAddress,
                maxAmountRequired: (parseFloat(amount) * Math.pow(10, tokenConfig.decimals)).toString(),
                resource: '/test',
                description: `Load test payment ${index + 1}`,
                mimeType: 'application/json',
                maxTimeoutSeconds: 3600
              }
            })
          });
          
          const data = await response.json();
          const duration = Date.now() - requestStart;
          
          console.log(`${response.ok ? '✓' : '✗'} Payment ${index + 1} settled in ${duration}ms`);
          
          return {
            index: index + 1,
            success: response.ok && data.success,
            duration,
            status: data.status,
            txHash: data.transaction,
            error: data.errorReason
          };
        } catch (error) {
          const duration = Date.now() - requestStart;
          return {
            index: index + 1,
            success: false,
            duration,
            error: error instanceof Error ? error.message : 'Request failed'
          };
        }
      });
      
      const settled = await Promise.all(promises);
      const totalTime = Date.now() - startTime;
      
      const successful = settled.filter(r => r.success).length;
      const failed = settled.filter(r => !r.success).length;
      const avgDuration = settled.reduce((sum, r) => sum + r.duration, 0) / settled.length;
      const maxDuration = Math.max(...settled.map(r => r.duration));
      const minDuration = Math.min(...settled.map(r => r.duration));
      
      setBatchResults((prev: any) => ({
        ...prev,
        settleResults: {
          total: settled.length,
          successful,
          failed,
          totalTime,
          avgDuration: avgDuration.toFixed(2),
          minDuration,
          maxDuration,
          throughput: ((settled.length / totalTime) * 1000).toFixed(2),
          details: settled
        }
      }));
      
      setResults(prev => ({ ...prev, settle: { success: true, data: settled } }));
    } catch (error) {
      setBatchResults((prev: any) => ({
        ...prev,
        settleResults: { success: false, error: error instanceof Error ? error.message : 'Failed' }
      }));
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link href="/" className="text-cyan-400 hover:text-cyan-300 text-sm mb-2 inline-flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Home
            </Link>
            <h1 className="text-3xl font-bold text-slate-100">API Testing</h1>
            <p className="text-slate-400 text-sm">Test all x402 facilitator endpoints</p>
          </div>
          {isConnected && (
            <div className="flex items-center gap-3">
              <div className="bg-slate-800/60 px-3 py-2 rounded-lg border border-slate-700/40">
                <div className="text-xs text-slate-400 mb-0.5">Connected</div>
                <div className="text-slate-100 font-mono text-sm">
                  {address?.substring(0, 6)}...{address?.substring(38)}
                </div>
              </div>
              <button
                onClick={() => disconnect()}
                className="text-xs text-red-400 hover:text-red-300 transition-colors px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg"
              >
                Disconnect
              </button>
            </div>
          )}
        </div>

        {/* Test Sections */}
        <div className="space-y-6">
          {/* Configuration */}
          <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/30 rounded-xl p-6">
            <h2 className="text-lg font-bold text-slate-100 mb-4">Configuration</h2>
            <div className="grid md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs text-slate-400 mb-2">Facilitator URL</label>
                <input
                  type="text"
                  value={facilitatorUrl}
                  onChange={(e) => setFacilitatorUrl(e.target.value)}
                  disabled
                  className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700/40 rounded-lg text-slate-100 text-sm font-mono disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-2">Network/Chain</label>
                <select
                  value={network}
                  onChange={(e) => {
                    const newNetwork = e.target.value;
                    setNetwork(newNetwork);
                    const networkConfig = networks.find(n => n.network === newNetwork);
                    if (networkConfig?.tokens.length) {
                      setSelectedToken(networkConfig.tokens[0].address);
                    }
                  }}
                  disabled={networks.length === 0}
                  className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700/40 rounded-lg text-slate-100 text-sm focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/20 disabled:opacity-50"
                >
                  {networks.map((net) => (
                    <option key={net.network} value={net.network}>
                      {net.network} (Chain ID: {net.chainId})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-2">Token</label>
                <select
                  value={selectedToken}
                  onChange={(e) => setSelectedToken(e.target.value)}
                  disabled={!network || networks.length === 0}
                  className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700/40 rounded-lg text-slate-100 text-sm focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/20 disabled:opacity-50"
                >
                  {(networks.find(n => n.network === network)?.tokens || []).map((token) => (
                    <option key={token.address} value={token.address}>
                      {token.symbol} - {token.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-2">
                  Amount ({networks.find(n => n.network === network)?.tokens.find(t => t.address === selectedToken)?.symbol || 'Token'})
                </label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  step="0.01"
                  min="0"
                  className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700/40 rounded-lg text-slate-100 text-sm focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/20"
                />
              </div>
            </div>
          </div>

          {/* 1. Health Check */}
          <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/30 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-100">1. Health Check</h2>
                <p className="text-sm text-slate-400">Verify facilitator is running</p>
              </div>
              <button
                onClick={testHealthCheck}
                disabled={loading}
                className="btn-primary px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
              >
                {loading ? 'Testing...' : 'Test'}
              </button>
            </div>
            
            {results.health && (
              <div className={`mt-4 p-3 rounded-lg text-sm font-mono ${
                results.health.success 
                  ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
                  : 'bg-red-500/10 border border-red-500/20 text-red-300'
              }`}>
                <pre className="whitespace-pre-wrap break-all">
                  {JSON.stringify(results.health.data || results.health.error, null, 2)}
                </pre>
              </div>
            )}
          </div>

          {/* 2. Generate Payload */}
          <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/30 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-100">2. Generate Payment Payload</h2>
                <p className="text-sm text-slate-400">Request {amount} USDC payment to your wallet</p>
              </div>
              {!isConnected ? (
                <WalletConnect />
              ) : (
                <button
                  onClick={testGeneratePayload}
                  disabled={loading || !merchantAddress}
                  className="btn-primary px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
                >
                  {loading ? 'Generating...' : 'Generate'}
                </button>
              )}
            </div>
            
            {results.payload && (
              <div className={`mt-4 p-3 rounded-lg text-sm font-mono ${
                results.payload.success 
                  ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
                  : 'bg-red-500/10 border border-red-500/20 text-red-300'
              }`}>
                <pre className="whitespace-pre-wrap break-all">
                  {JSON.stringify(results.payload.data || results.payload.error, null, 2)}
                </pre>
              </div>
            )}
          </div>

          {/* 3. Verify Signature */}
          <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/30 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-100">3. Verify Signature</h2>
                <p className="text-sm text-slate-400">Sign payload and verify signature</p>
              </div>
              <button
                onClick={testVerify}
                disabled={loading || !isConnected || !results.payload?.data}
                className="btn-primary px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
              >
                {loading ? 'Verifying...' : 'Verify'}
              </button>
            </div>
            
            {results.verify && (
              <div className={`mt-4 p-3 rounded-lg text-sm font-mono ${
                results.verify.success 
                  ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
                  : 'bg-red-500/10 border border-red-500/20 text-red-300'
              }`}>
                <pre className="whitespace-pre-wrap break-all">
                  {JSON.stringify(results.verify.data || results.verify.error, null, 2)}
                </pre>
              </div>
            )}
          </div>

          {/* 4. Settle Payment */}
          <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/30 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-100">4. Settle Payment</h2>
                <p className="text-sm text-slate-400">Execute payment on blockchain</p>
              </div>
              <button
                onClick={testSettle}
                disabled={loading || !results.payload?.data}
                className="btn-primary px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
              >
                {loading ? 'Settling...' : 'Settle'}
              </button>
            </div>
            
            {results.settle && (
              <div className={`mt-4 p-3 rounded-lg text-sm font-mono ${
                results.settle.success 
                  ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
                  : 'bg-red-500/10 border border-red-500/20 text-red-300'
              }`}>
                <pre className="whitespace-pre-wrap break-all">
                  {JSON.stringify(results.settle.data || results.settle.error, null, 2)}
                </pre>
              </div>
            )}
          </div>

          {/* 5. Batch Load Testing */}
          <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/30 rounded-xl p-6">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-slate-100 mb-2">⚡ Batch Load Testing</h2>
              <p className="text-sm text-slate-400">Generate and settle multiple payments to test throughput</p>
            </div>

            <div className="grid md:grid-cols-3 gap-4 mb-6">
              <div>
                <label className="block text-xs text-slate-400 mb-2">Batch Count</label>
                <input
                  type="number"
                  value={batchCount}
                  onChange={(e) => setBatchCount(parseInt(e.target.value) || 1)}
                  min="1"
                  max="100"
                  className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700/40 rounded-lg text-slate-100 text-sm focus:outline-none focus:border-purple-500/60 focus:ring-1 focus:ring-purple-500/20"
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={testBatchGenerate}
                  disabled={loading || !address || !merchantAddress}
                  className="w-full px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 disabled:from-slate-600 disabled:to-slate-700 text-white rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
                >
                  {loading ? 'Generating...' : `Generate ${batchCount} Payloads`}
                </button>
              </div>
              <div className="flex items-end">
                <button
                  onClick={testBatchSettle}
                  disabled={loading || !batchResults?.payloads}
                  className="w-full px-4 py-2 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 disabled:from-slate-600 disabled:to-slate-700 text-white rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
                >
                  {loading ? 'Settling...' : 'Settle All'}
                </button>
              </div>
            </div>

            {batchResults && (
              <div className="space-y-4">
                {/* Generation Stats */}
                {batchResults.generationTime && (
                  <div className="bg-slate-900/40 border border-slate-700/40 rounded-lg p-4">
                    <h3 className="text-sm font-semibold text-purple-400 mb-3">📝 Payload Generation</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <div className="text-slate-400 text-xs">Total Count</div>
                        <div className="text-slate-100 font-mono font-bold">{batchResults.count}</div>
                      </div>
                      <div>
                        <div className="text-slate-400 text-xs">Total Time</div>
                        <div className="text-slate-100 font-mono font-bold">{batchResults.generationTime}ms</div>
                      </div>
                      <div>
                        <div className="text-slate-400 text-xs">Avg Per Payload</div>
                        <div className="text-slate-100 font-mono font-bold">{batchResults.avgPerPayload}ms</div>
                      </div>
                      <div>
                        <div className="text-slate-400 text-xs">Status</div>
                        <div className="text-emerald-400 font-semibold">✓ Ready</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Settlement Stats */}
                {batchResults.settleResults && (
                  <div className="bg-slate-900/40 border border-slate-700/40 rounded-lg p-4">
                    <h3 className="text-sm font-semibold text-emerald-400 mb-3">🚀 Settlement Performance</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
                      <div>
                        <div className="text-slate-400 text-xs">Total Requests</div>
                        <div className="text-slate-100 font-mono font-bold">{batchResults.settleResults.total}</div>
                      </div>
                      <div>
                        <div className="text-slate-400 text-xs">Successful</div>
                        <div className="text-emerald-400 font-mono font-bold">{batchResults.settleResults.successful}</div>
                      </div>
                      <div>
                        <div className="text-slate-400 text-xs">Failed</div>
                        <div className="text-red-400 font-mono font-bold">{batchResults.settleResults.failed}</div>
                      </div>
                      <div>
                        <div className="text-slate-400 text-xs">Total Time</div>
                        <div className="text-slate-100 font-mono font-bold">{batchResults.settleResults.totalTime}ms</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <div className="text-slate-400 text-xs">Avg Response</div>
                        <div className="text-cyan-400 font-mono font-bold">{batchResults.settleResults.avgDuration}ms</div>
                      </div>
                      <div>
                        <div className="text-slate-400 text-xs">Min Response</div>
                        <div className="text-slate-100 font-mono font-bold">{batchResults.settleResults.minDuration}ms</div>
                      </div>
                      <div>
                        <div className="text-slate-400 text-xs">Max Response</div>
                        <div className="text-slate-100 font-mono font-bold">{batchResults.settleResults.maxDuration}ms</div>
                      </div>
                      <div>
                        <div className="text-slate-400 text-xs">Throughput</div>
                        <div className="text-purple-400 font-mono font-bold">{batchResults.settleResults.throughput} req/s</div>
                      </div>
                    </div>

                    {/* Detailed Results */}
                    <details className="mt-4">
                      <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-300">View Detailed Results ({batchResults.settleResults.details.length} transactions)</summary>
                      <div className="mt-2 max-h-64 overflow-y-auto">
                        <pre className="text-xs font-mono text-slate-300 whitespace-pre-wrap break-all">
                          {JSON.stringify(batchResults.settleResults.details, null, 2)}
                        </pre>
                      </div>
                    </details>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
