'use client';

import { useState, useEffect } from 'react';
import { useAccount, useSignTypedData } from 'wagmi';
import Link from 'next/link';
import WalletConnect from '../components/WalletConnect';

interface NetworkConfig {
  network: string;
  chainId: number;
  tokens: {
    symbol: string;
    name: string;
    address: string;
    decimals: number;
    eip712?: {
      name: string;
      version: string;
      verifyingContract: string;
    };
  }[];
}

interface StepData {
  paymentRequirements?: any;
  authorization?: any;
  signature?: string;
  xPaymentHeader?: string;
  xPaymentPayload?: any;
  verifyResponse?: any;
  settleResponse?: any;
  x402PaymentRequired?: string;
}

const STEPS = [
  {
    id: 0,
    title: 'Introduction',
    description: 'Learn how the X-402 payment protocol works'
  },
  {
    id: 1,
    title: 'Step 1: Server Returns 402 Payment Required',
    description: 'Client requests premium content, server responds with 402 status and encoded payment requirements'
  },
  {
    id: 2,
    title: 'Step 2: Client Creates Authorization',
    description: 'Client creates ERC-3009 transfer authorization with payment details'
  },
  {
    id: 3,
    title: 'Step 3: Client Signs Authorization',
    description: 'User signs the authorization using EIP-712 typed data signature'
  },
  {
    id: 4,
    title: 'Step 4: Client Encodes X-PAYMENT',
    description: 'Protocol metadata, authorization, and signature are wrapped and base64 encoded for the HTTP header'
  },
  {
    id: 5,
    title: 'Step 5: Client Sends X-PAYMENT Header',
    description: 'Client retries the request with X-PAYMENT header containing payment'
  },
  {
    id: 6,
    title: 'Step 6: Server Verifies Payment',
    description: 'Server decodes header and verifies the signature with facilitator'
  },
  {
    id: 7,
    title: 'Step 7: Server Settles Payment',
    description: 'Server requests facilitator to settle payment on blockchain'
  },
  {
    id: 8,
    title: 'Step 8: Server Returns Content',
    description: 'Server returns 200 OK with premium content and X-PAYMENT-RESPONSE header'
  },
  {
    id: 9,
    title: 'Complete!',
    description: 'Payment flow successfully completed'
  }
];

export default function TutorialPage() {
  const { address, isConnected } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  
  const [currentStep, setCurrentStep] = useState(0);
  const [stepData, setStepData] = useState<StepData>({});
  const [apiKey, setApiKey] = useState('');
  const [recipientAddress, setRecipientAddress] = useState('');
  const [configReady, setConfigReady] = useState(false);
  const [networks, setNetworks] = useState<NetworkConfig[]>([]);
  const [selectedNetwork, setSelectedNetwork] = useState('base-sepolia');
  const [selectedToken, setSelectedToken] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [loadingNetworks, setLoadingNetworks] = useState(true);
  const [highlightChange, setHighlightChange] = useState(false);
  const [showRawData, setShowRawData] = useState(true);
  const [showApiKey, setShowApiKey] = useState(false);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);

  const facilitatorUrl = process.env.NEXT_PUBLIC_FACILITATOR_URL || 'http://localhost:8080';

  useEffect(() => {
    const storedKey = localStorage.getItem('x402_api_key');
    const storedAddress = localStorage.getItem('x402_recipient_address');
    if (storedKey) setApiKey(storedKey);
    if (storedAddress) setRecipientAddress(storedAddress);
    // Only show tutorial if both values were loaded from storage
    if (storedKey && storedAddress) {
      setConfigReady(true);
    }
    setIsLoadingConfig(false);
  }, []);

  useEffect(() => {
    const fetchNetworks = async () => {
      setLoadingNetworks(true);
      try {
        const response = await fetch(`${facilitatorUrl}/networks`);
        if (response.ok) {
          const data = await response.json();
          // Combine mainnet and testnet networks
          const allNetworks = [...(data.mainnet || []), ...(data.testnet || [])];
          setNetworks(allNetworks);
          if (allNetworks.length > 0) {
            setSelectedNetwork(allNetworks[0].network);
            if (allNetworks[0].tokens.length > 0) {
              setSelectedToken(allNetworks[0].tokens[0].address);
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

  const handleApiKeyChange = (value: string) => {
    setApiKey(value);
    localStorage.setItem('x402_api_key', value);
  };

  const handleRecipientAddressChange = (value: string) => {
    setRecipientAddress(value);
    localStorage.setItem('x402_recipient_address', value);
  };

  const formatHttpRequest = (
    requestLine: string,
    headers: Record<string, string>,
    body?: string
  ) => {
    const headerLines = Object.entries(headers)
      .map(([key, value]) => `${key}: ${value}`);
    const lines = [requestLine, ...headerLines];
    if (body && body.trim().length > 0) {
      lines.push('', body);
    }
    return lines.join('\n');
  };

  const formatHttpResponse = (
    statusLine: string,
    headers: Record<string, string>,
    body?: string
  ) => {
    const headerLines = Object.entries(headers)
      .map(([key, value]) => `${key}: ${value}`);
    const lines = [statusLine, ...headerLines];
    if (body && body.trim().length > 0) {
      lines.push('', body);
    }
    return lines.join('\n');
  };

  const computeContentLength = (content: string) => new TextEncoder().encode(content).length.toString();

  const parseHostFromUrl = (url: string) => {
    try {
      const parsed = new URL(url);
      return parsed.host || url;
    } catch (error) {
      return url.replace(/^https?:\/\//, '');
    }
  };

  const facilitatorHost = parseHostFromUrl(facilitatorUrl);
  const verifyPath = (() => {
    try {
      return new URL('/verify', facilitatorUrl).pathname || '/verify';
    } catch (error) {
      return '/verify';
    }
  })();

  const settlePath = (() => {
    try {
      return new URL('/settle', facilitatorUrl).pathname || '/settle';
    } catch (error) {
      return '/settle';
    }
  })();

  const getXPaymentPayload = () => {
    if (!stepData.authorization || !stepData.signature) {
      return null;
    }
    return {
      x402Version: 1,
      scheme: 'exact',
      network: stepData.paymentRequirements?.network || selectedNetwork,
      payload: {
        authorization: stepData.authorization,
        signature: stepData.signature
      }
    };
  };

  const xPaymentPayload = stepData.xPaymentPayload || getXPaymentPayload();

  const deriveSettlementStatus = (settlement?: any) => {
    if (!settlement) return undefined;
    if (typeof settlement.status === 'string' && settlement.status.trim()) {
      return settlement.status.toLowerCase();
    }
    if (typeof settlement.state === 'string' && settlement.state.trim()) {
      return settlement.state.toLowerCase();
    }
    if (settlement.success === true) return 'completed';
    if (settlement.success === false) return 'failed';
    return undefined;
  };

  const isFinalSettlementStatus = (status?: string) => {
    if (!status) return false;
    return ['completed', 'settled', 'confirmed', 'success'].includes(status);
  };

  const getSettlementStatusDisplay = (status?: string) => {
    switch (status) {
      case 'preconfirmed':
        return {
          heading: 'Flashblock Preconfirmation',
          description: 'Facilitator locked funds using Flashblock. Poll the settlement endpoint or wait for webhooks until the status advances to completed/settled.',
          containerClass: 'bg-amber-500/10 border border-amber-500/20',
          iconColor: 'text-amber-400',
          textColor: 'text-amber-200'
        };
      case 'completed':
      case 'settled':
      case 'confirmed':
      case 'success':
        return {
          heading: 'Payment Settled',
          description: 'Facilitator confirmed the on-chain settlement. You can treat the payment as complete.',
          containerClass: 'bg-emerald-500/10 border border-emerald-500/20',
          iconColor: 'text-emerald-400',
          textColor: 'text-emerald-200'
        };
      case 'failed':
      case 'error':
        return {
          heading: 'Settlement Failed',
          description: 'Facilitator could not settle this payment. Inspect the error reason returned in the response.',
          containerClass: 'bg-red-500/10 border border-red-500/20',
          iconColor: 'text-red-400',
          textColor: 'text-red-200'
        };
      default:
        return {
          heading: 'Settlement Pending',
          description: 'Facilitator is still processing this payment. Continue polling or listen for a webhook to obtain the final status.',
          containerClass: 'bg-blue-500/10 border border-blue-500/20',
          iconColor: 'text-blue-400',
          textColor: 'text-blue-200'
        };
    }
  };

  const settlementStatus = deriveSettlementStatus(stepData.settleResponse);
  const settlementIsFinal = isFinalSettlementStatus(settlementStatus);

  // Auto-generate data when entering certain steps
  useEffect(() => {
    const autoGenerateData = async () => {
      if (processing) return;

      try {
        // Step 1: Generate 402 response (regenerate when network/token changes)
        if (currentStep === 1 && recipientAddress && networks.length > 0) {
          const network = networks.find(n => n.network === selectedNetwork);
          if (!network?.tokens?.length) return;

          const token = network.tokens.find(t => t.address === selectedToken) || network.tokens[0];
          const paymentRequirements = {
            scheme: 'exact',
            network: selectedNetwork,
            asset: token.address,
            payTo: recipientAddress,
            maxAmountRequired: '10000',
            resource: '/premium/content',
            description: 'Premium cat image access',
            mimeType: 'image/jpeg',
            maxTimeoutSeconds: 3600
          };
          const x402Header = `X-402 version=1 scheme=exact network=${selectedNetwork} asset=${token.address} payto=${recipientAddress} amount=10000 resource=/premium/content`;
          setStepData(prev => ({ ...prev, paymentRequirements, x402PaymentRequired: x402Header }));
        }

        // Step 2: Generate authorization
        if (currentStep === 2 && !stepData.authorization && address && recipientAddress) {
          const validAfter = Math.floor(Date.now() / 1000);
          const validBefore = validAfter + 3600;
          const nonce = '0x' + Array.from(crypto.getRandomValues(new Uint8Array(32)))
            .map(b => b.toString(16).padStart(2, '0')).join('');
          const authorization = {
            from: address,
            to: recipientAddress,
            value: '10000',
            validAfter: validAfter.toString(),
            validBefore: validBefore.toString(),
            nonce
          };
          setStepData(prev => ({ ...prev, authorization }));
        }

        // Step 4+: Generate base64 encoding with protocol metadata
        if (currentStep >= 4 && stepData.authorization && stepData.signature) {
          const payload = getXPaymentPayload();
          if (payload) {
            const base64Encoded = Buffer.from(JSON.stringify(payload)).toString('base64');
            if (stepData.xPaymentHeader !== base64Encoded || !stepData.xPaymentPayload) {
              setStepData(prev => ({ ...prev, xPaymentHeader: base64Encoded, xPaymentPayload: payload }));
            }
          }
        }
      } catch (err) {
        console.error('Auto-generate error:', err);
      }
    };

    autoGenerateData();
  }, [currentStep, recipientAddress, networks, address, selectedNetwork, selectedToken, stepData, processing]);

  const handleNext = async () => {
    setError('');
    setProcessing(true);

    try {
      switch (currentStep) {
        case 0:
        case 1:
        case 2:
          // Just advance - data is auto-generated
          setCurrentStep(currentStep + 1);
          break;

        case 3:
          // Sign authorization or advance if already signed
          if (stepData.signature) {
            // Already signed, move to next step
            setCurrentStep(4);
          } else {
            // Need to sign
            if (!stepData.authorization) {
              throw new Error('Authorization not created');
            }

            const net = networks.find(n => n.network === selectedNetwork);
            const tokenConfig = net?.tokens.find(t => t.address === selectedToken) || net?.tokens[0];
            if (!net || !tokenConfig || !tokenConfig.eip712) {
              throw new Error('Network or token configuration missing');
            }

            const signature = await signTypedDataAsync({
              domain: {
                name: tokenConfig.eip712.name,
                version: tokenConfig.eip712.version,
                chainId: net.chainId,
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
              message: stepData.authorization as any
            });

            setStepData(prev => ({ ...prev, signature }));
            // Stay on step 2 to show the signature data
          }
          break;

        case 4:
        case 5:
          // Just advance - encoding is auto-generated for step 4
          setCurrentStep(currentStep + 1);
          break;

        case 6:
          // Server verifies payment
          if (stepData.verifyResponse) {
            // Already verified, move to next step
            setCurrentStep(7);
          } else {
            // Need to verify
            if (!stepData.authorization || !stepData.signature || !stepData.paymentRequirements) {
              throw new Error('Missing payment data');
            }

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
                    authorization: stepData.authorization,
                    signature: stepData.signature
                  }
                },
                paymentRequirements: stepData.paymentRequirements
              })
            });

            const verifyData = await verifyResponse.json();
            if (!verifyResponse.ok || (!verifyData.isValid && !verifyData.is_valid)) {
              throw new Error(verifyData.invalidReason || 'Verification failed');
            }

            setStepData(prev => ({ ...prev, verifyResponse: verifyData }));
            // Stay on step 6 to show the response
          }
          break;

        case 7:
          // Server settles payment
          if (!stepData.authorization || !stepData.signature || !stepData.paymentRequirements) {
            throw new Error('Missing payment data');
          }

          if (stepData.settleResponse && settlementIsFinal) {
            setCurrentStep(8);
            break;
          }

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
                  authorization: stepData.authorization,
                  signature: stepData.signature
                }
              },
              paymentRequirements: stepData.paymentRequirements
            })
          });

          const settleData = await settleResponse.json();
          const newSettlementStatus = deriveSettlementStatus(settleData);
          const newIsPreconfirmed = newSettlementStatus === 'preconfirmed';
          const newIsFinal = isFinalSettlementStatus(newSettlementStatus);
          const didSucceed = settleData.success || newIsFinal || newIsPreconfirmed;

          if (!settleResponse.ok || !didSucceed) {
            throw new Error(
              settleData.errorReason ||
              settleData.error_reason ||
              `Settlement failed (status: ${newSettlementStatus || 'unknown'})`
            );
          }

          setStepData(prev => ({ ...prev, settleResponse: settleData }));

          if (newIsFinal) {
            setCurrentStep(8);
          }
          break;

        case 8:
          // Complete
          setCurrentStep(9);
          break;

        default:
          break;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setProcessing(false);
    }
  };

  const handleReset = () => {
    setCurrentStep(0);
    setStepData({});
    setError('');
  };

  const canProceed = () => {
    if (processing || loadingNetworks) return false;
    
    switch (currentStep) {
      case 0:
        return true;
      case 1:
        return !!recipientAddress && networks.length > 0;
      case 2:
        return !!recipientAddress;
      case 3:
        return isConnected && !!recipientAddress;
      case 4:
      case 5:
      case 6:
      case 7:
      case 8:
        return true;
      default:
        return false;
    }
  };

  // Show loading screen while initializing
  if (isLoadingConfig) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block relative">
            <div className="w-16 h-16 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <svg className="w-8 h-8 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
          </div>
          <p className="mt-6 text-slate-300 font-semibold">Loading Tutorial...</p>
          <p className="mt-2 text-slate-500 text-sm">Initializing configuration</p>
        </div>
      </div>
    );
  }

  // Show configuration input screen if not ready
  if (!configReady) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <Link href="/" className="text-cyan-400 hover:text-cyan-300 text-sm mb-4 inline-flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Home
            </Link>
            <h1 className="text-2xl font-bold text-slate-100 mb-2">Interactive Tutorial</h1>
            <p className="text-slate-400 text-sm">Enter your configuration to continue</p>
          </div>

          <div className="bg-slate-800/40 border border-slate-700/40 rounded-lg p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-cyan-500/10 rounded-lg">
                <svg className="w-6 h-6 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-100">Configuration Required</h3>
                <p className="text-sm text-slate-400">This will be saved to your browser</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Merchant API Key
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your merchant API key..."
                  className="w-full px-4 py-3 bg-slate-900/60 border border-slate-700/40 rounded-lg text-slate-100 text-sm focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Recipient Wallet Address
                </label>
                <input
                  type="text"
                  value={recipientAddress}
                  onChange={(e) => setRecipientAddress(e.target.value)}
                  placeholder="0x..."
                  className="w-full px-4 py-3 bg-slate-900/60 border border-slate-700/40 rounded-lg text-slate-100 text-sm font-mono focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition-all"
                />
              </div>

              <button
                onClick={() => {
                  if (apiKey.trim() && recipientAddress.trim()) {
                    localStorage.setItem('x402_api_key', apiKey.trim());
                    localStorage.setItem('x402_recipient_address', recipientAddress.trim());
                    window.location.reload();
                  }
                }}
                disabled={!apiKey.trim() || !recipientAddress.trim()}
                className="w-full px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg hover:from-cyan-600 hover:to-blue-700 disabled:from-slate-600 disabled:to-slate-700 disabled:cursor-not-allowed font-semibold transition-all shadow-lg shadow-cyan-900/50"
              >
                Continue to Tutorial
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8 sm:mb-10">
          <div>
            <Link href="/" className="text-cyan-400 hover:text-cyan-300 text-sm mb-2 inline-flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Home
            </Link>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-100">Interactive Tutorial</h1>
            <p className="text-slate-400 text-xs sm:text-sm">Step-by-step walkthrough of the X-402 payment flow</p>
          </div>
          <WalletConnect />
        </div>

        {/* Merchant Configuration */}
        <div className="bg-slate-800/40 border border-slate-700/40 rounded-lg p-5 mb-6">
          <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
            <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Merchant Configuration
          </h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">
                API Key
              </label>
              <div className="relative">
                <input
                  type={showApiKey ? "text" : "password"}
                  value={isLoadingConfig ? '' : apiKey}
                  onChange={(e) => handleApiKeyChange(e.target.value)}
                  placeholder="Enter your facilitator API key"
                  className="w-full px-4 py-2.5 pr-12 bg-slate-900/60 border border-slate-700/40 rounded-lg text-slate-100 text-sm focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition-all placeholder-slate-500 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-300 transition-colors"
                >
                  {showApiKey ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">
                Recipient Wallet Address
              </label>
              <input
                type="text"
                value={isLoadingConfig ? '' : recipientAddress}
                onChange={(e) => handleRecipientAddressChange(e.target.value)}
                placeholder="0x..."
                className="w-full px-4 py-2.5 bg-slate-900/60 border border-slate-700/40 rounded-lg text-slate-100 text-sm focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition-all placeholder-slate-500 font-mono"
              />
            </div>
          </div>
          <div className="mt-3 flex items-start gap-2 text-xs text-slate-400">
            <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p>These values are stored locally in your browser. The recipient address is where payments will be sent.</p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="bg-slate-800/40 border border-slate-700/40 rounded-lg p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-slate-300">Progress</span>
            <span className="text-sm text-slate-400">{currentStep} / {STEPS.length - 1}</span>
          </div>
          <div className="h-2 bg-slate-700/50 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-cyan-500 to-blue-600 transition-all duration-500"
              style={{ width: `${(currentStep / (STEPS.length - 1)) * 100}%` }}
            />
          </div>
          
          {/* Status Indicators */}
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
              loadingNetworks ? 'bg-yellow-500/10 border border-yellow-500/20' :
              networks.length > 0 ? 'bg-emerald-500/10 border border-emerald-500/20' :
              'bg-red-500/10 border border-red-500/20'
            }`}>
              {loadingNetworks ? (
                <>
                  <svg className="w-4 h-4 text-yellow-400 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span className="text-yellow-300">Loading Networks...</span>
                </>
              ) : networks.length > 0 ? (
                <>
                  <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-emerald-300">Networks Ready ({networks.length})</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  <span className="text-red-300">Networks Failed</span>
                </>
              )}
            </div>
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
              recipientAddress ? 'bg-emerald-500/10 border border-emerald-500/20' :
              'bg-slate-700/30 border border-slate-600/30'
            }`}>
              {recipientAddress ? (
                <>
                  <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-emerald-300">API Key Set</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <span className="text-slate-400">No API Key</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Network and Token Selection */}
        <div className="bg-slate-800/40 border border-slate-700/40 rounded-lg p-5 mb-6">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">Payment Configuration</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2 flex items-center gap-2">
                <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                </svg>
                Network
              </label>
              <select
                value={selectedNetwork}
                onChange={(e) => {
                  setSelectedNetwork(e.target.value);
                  const network = networks.find(n => n.network === e.target.value);
                  if (network?.tokens.length) {
                    setSelectedToken(network.tokens[0].address);
                  }
                  if (currentStep === 1) {
                    setHighlightChange(true);
                    setTimeout(() => setHighlightChange(false), 1000);
                  }
                }}
                disabled={loadingNetworks || currentStep > 1}
                className="w-full px-4 py-2.5 bg-slate-900/60 border border-slate-700/40 rounded-lg text-slate-100 text-sm focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {networks.map((net) => (
                  <option key={net.network} value={net.network}>
                    {net.network} (Chain ID: {net.chainId})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2 flex items-center gap-2">
                <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Token
              </label>
              <select
                value={selectedToken}
                onChange={(e) => {
                  setSelectedToken(e.target.value);
                  if (currentStep === 1) {
                    setHighlightChange(true);
                    setTimeout(() => setHighlightChange(false), 1000);
                  }
                }}
                disabled={loadingNetworks || currentStep > 1 || !selectedNetwork}
                className="w-full px-4 py-2.5 bg-slate-900/60 border border-slate-700/40 rounded-lg text-slate-100 text-sm focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {(networks.find(n => n.network === selectedNetwork)?.tokens || []).map((token) => (
                  <option key={token.address} value={token.address}>
                    {token.symbol} - {token.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {currentStep > 1 && (
            <div className="mt-3 text-xs text-slate-500 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Network and token locked once tutorial starts
            </div>
          )}
        </div>

        {/* Current Step */}
        <div className="bg-slate-800/40 border border-slate-700/40 rounded-lg p-6 mb-6">
          <div className="mb-6">
            <div className="inline-block bg-cyan-500/20 border border-cyan-500/30 px-3 py-1 rounded-full text-cyan-400 text-xs font-semibold mb-3">
              {STEPS[currentStep].id === 0 ? 'START' : `STEP ${STEPS[currentStep].id}`}
            </div>
            <h2 className="text-2xl font-bold text-slate-100 mb-2">{STEPS[currentStep].title}</h2>
            <p className="text-slate-400">{STEPS[currentStep].description}</p>
          </div>

          {/* Step Content */}
          <div className="space-y-6">
            {currentStep === 0 && (
              <div className="prose prose-invert max-w-none">
                <div className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-6 space-y-4">
                  <p className="text-slate-300">
                    The <strong className="text-cyan-400">X-402 protocol</strong> enables HTTP-based micropayments using blockchain signatures. Here's how it works:
                  </p>
                  <ol className="list-decimal list-inside space-y-2 text-slate-300">
                    <li>Client requests premium content</li>
                    <li>Server returns <code className="text-cyan-400 bg-slate-800 px-2 py-0.5 rounded">402 Payment Required</code> with payment details</li>
                    <li>Client creates and signs payment authorization</li>
                    <li>Client retries request with <code className="text-cyan-400 bg-slate-800 px-2 py-0.5 rounded">X-PAYMENT</code> header</li>
                    <li>Server verifies and settles payment via facilitator</li>
                    <li>Server returns content with <code className="text-cyan-400 bg-slate-800 px-2 py-0.5 rounded">200 OK</code></li>
                  </ol>
                  <p className="text-slate-400 text-sm mt-4">
                    Click <strong>Next</strong> to walk through each step interactively.
                  </p>
                </div>
              </div>
            )}

            {currentStep === 1 && (
              <div>
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-slate-300 mb-2">HTTP Request</h3>
                  <div className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-4">
                    <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap break-words">
{formatHttpRequest('GET /premium/content HTTP/1.1', {
  Host: 'merchant.example.com',
  Accept: '*/*',
  'User-Agent': 'X402-Tutorial/1.0'
})}
                    </pre>
                  </div>
                </div>

                {stepData.paymentRequirements && stepData.x402PaymentRequired && (
                  <>
                    <div className="mb-4">
                      <h3 className="text-sm font-semibold text-slate-300 mb-2">HTTP Response (402 Payment Required)</h3>
                      <div className={`bg-red-500/10 border border-red-500/20 rounded-lg p-4 transition-all duration-500 ${
                        highlightChange ? 'ring-2 ring-cyan-500/50 bg-cyan-500/5' : ''
                      }`}>
                        <pre className="text-xs text-red-200 font-mono whitespace-pre-wrap break-words">
{(() => {
  const paymentRequirementsJson = JSON.stringify(stepData.paymentRequirements, null, 2);
  const encodedHeader = Buffer.from(JSON.stringify(stepData.paymentRequirements)).toString('base64');
  return formatHttpResponse(
    'HTTP/1.1 402 Payment Required',
    {
      'Content-Type': 'application/json',
      'Content-Length': computeContentLength(paymentRequirementsJson),
      'X-402': encodedHeader
    },
    paymentRequirementsJson
  );
})()}
                        </pre>
                      </div>
                    </div>
                    <div className="mb-4">
                      <h3 className="text-sm font-semibold text-slate-300 mb-2">X-402 Header (Decoded)</h3>
                      <div className={`bg-slate-900/60 border border-slate-700/40 rounded-lg p-4 transition-all duration-500 ${
                        highlightChange ? 'ring-2 ring-cyan-500/50 bg-cyan-500/5' : ''
                      }`}>
                        <pre className="text-xs text-slate-300 overflow-x-auto">
                          {JSON.stringify(stepData.paymentRequirements, null, 2)}
                        </pre>
                      </div>
                    </div>
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <svg className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div className="text-sm text-blue-300">
                          The <strong>X-402 header</strong> contains base64-encoded payment requirements. The server encodes the payment details as JSON, then base64-encodes it for transmission in the HTTP header.
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {currentStep === 2 && stepData.authorization && (
              <div>
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-slate-300 mb-2">Payment Authorization Structure</h3>
                  <div className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-4">
                    <pre className="text-xs text-slate-300 overflow-x-auto font-mono leading-relaxed">
{`{
  "from": "${stepData.authorization.from}",
  "to": "${stepData.authorization.to}",
  "value": "${stepData.authorization.value}",
  "validAfter": "${stepData.authorization.validAfter}",
  "validBefore": "${stepData.authorization.validBefore}",
  "nonce": "${stepData.authorization.nonce}"
}`}
                    </pre>
                  </div>
                </div>
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="text-sm text-blue-300">
                      <strong>from:</strong> Buyer wallet address<br />
                      <strong>to:</strong> Recipient's wallet<br />
                      <strong>value:</strong> 10000 = 0.01 USDC (6 decimals)<br />
                      <strong>validAfter/validBefore:</strong> Time window for authorization<br />
                      <strong>nonce:</strong> Random value for replay protection
                    </div>
                  </div>
                </div>
              </div>
            )}

            {currentStep === 3 && stepData.authorization && (
              <div>
                {!stepData.signature ? (
                  <>
                    <div className="mb-4">
                      <h3 className="text-sm font-semibold text-slate-300 mb-2">EIP-712 Typed Data Format</h3>
                      <div className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-4">
                        <pre className="text-xs text-purple-300 overflow-x-auto font-mono leading-relaxed">
{(() => {
  const net = networks.find(n => n.network === selectedNetwork);
  const token = net?.tokens.find(t => t.address === selectedToken) || net?.tokens[0];
  if (!net || !token?.eip712) return 'Loading...';
  return JSON.stringify({
    domain: {
      name: token.eip712.name,
      version: token.eip712.version,
      chainId: net.chainId,
      verifyingContract: token.eip712.verifyingContract
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
    message: stepData.authorization
  }, null, 2);
})()}
                        </pre>
                      </div>
                    </div>
                    <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <svg className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div className="text-sm text-purple-300">
                          <strong>EIP-712</strong> provides a structured, human-readable format for signing data. Click "Sign Authorization" to sign this payment with your wallet.
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="mb-4">
                      <h3 className="text-sm font-semibold text-slate-300 mb-2">Authorization + Signature</h3>
                      <div className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-4">
                        <pre className="text-xs overflow-x-auto font-mono leading-relaxed whitespace-pre">
{JSON.stringify(xPaymentPayload || {
  x402Version: 1,
  scheme: 'exact',
  network: stepData.paymentRequirements?.network || selectedNetwork,
  payload: {
    authorization: stepData.authorization,
    signature: stepData.signature
  }
}, null, 2)}
                        </pre>
                      </div>
                    </div>
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <svg className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-sm text-emerald-300">
                          <strong>Signature added!</strong> The signature (highlighted) proves you authorized the payment without revealing your private key. This 65-byte signature is generated using EIP-712 typed data signing.
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {currentStep === 4 && stepData.xPaymentHeader && (
              <div>
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-slate-300 mb-2">Before Encoding (JSON)</h3>
                  <div className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-4">
                    <pre className="text-xs text-slate-300 overflow-x-auto font-mono whitespace-pre">
{JSON.stringify(xPaymentPayload || {
  x402Version: 1,
  scheme: 'exact',
  network: stepData.paymentRequirements?.network || selectedNetwork,
  payload: {
    authorization: stepData.authorization,
    signature: stepData.signature
  }
}, null, 2)}
                    </pre>
                  </div>
                </div>
                <div className="flex items-center justify-center my-4">
                  <div className="flex items-center gap-2 text-cyan-400">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                    </svg>
                    <span className="text-sm font-semibold">Base64 Encode</span>
                  </div>
                </div>
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-slate-300 mb-2">After Encoding (Base64)</h3>
                  <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-4">
                    <div className="text-xs text-cyan-300 font-mono break-all">
{stepData.xPaymentHeader}
                    </div>
                  </div>
                </div>
                <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm text-cyan-300">
                      The header wraps protocol metadata plus the authorization and signature into a single JSON object, then base64 encodes it for safe transmission in HTTP headers.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {currentStep === 5 && stepData.xPaymentHeader && (
              <div>
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-slate-300 mb-2">HTTP Request with X-PAYMENT Header</h3>
                  <div className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-4">
                    <pre className="text-xs text-emerald-300 font-mono whitespace-pre-wrap break-all">
{formatHttpRequest('GET /premium/content HTTP/1.1', {
  Host: 'merchant.example.com',
  Accept: '*/*',
  'User-Agent': 'X402-Tutorial/1.0',
  'X-PAYMENT': stepData.xPaymentHeader
})}
                    </pre>
                  </div>
                </div>
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-slate-300 mb-2">X-PAYMENT Header Content (Decoded)</h3>
                  <div className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-4">
                    <pre className="text-xs text-slate-300 overflow-x-auto font-mono whitespace-pre">
{JSON.stringify(xPaymentPayload || {
  x402Version: 1,
  scheme: 'exact',
  network: stepData.paymentRequirements?.network || selectedNetwork,
  payload: {
    authorization: stepData.authorization,
    signature: stepData.signature
  }
}, null, 2)}
                    </pre>
                  </div>
                </div>
                <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <p className="text-sm text-purple-300">
                      Client retries the same request, now including the <strong>X-PAYMENT</strong> header with protocol metadata and the signed authorization payload. The server will decode this header to extract the payment details.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {currentStep === 6 && stepData.verifyResponse && (
              <div>
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-slate-300 mb-2">HTTP Request to Facilitator</h3>
                  <div className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-4">
                    <pre className="text-xs text-yellow-200 font-mono whitespace-pre-wrap break-words">
{(() => {
  const requestBody = JSON.stringify({
    x402Version: 1,
    paymentPayload: {
      x402Version: 1,
      payload: {
        authorization: stepData.authorization,
        signature: stepData.signature
      }
    },
    paymentRequirements: stepData.paymentRequirements
  }, null, 2);
  return formatHttpRequest(
    `POST ${verifyPath} HTTP/1.1`,
    {
      Host: facilitatorHost,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: 'Bearer [API_KEY]',
      'Content-Length': computeContentLength(requestBody)
    },
    requestBody
  );
})()}
                    </pre>
                  </div>
                </div>
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-slate-300 mb-2">Facilitator Response</h3>
                  <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4">
                    <pre className="text-xs text-emerald-300 overflow-x-auto font-mono">
                      {JSON.stringify(stepData.verifyResponse, null, 2)}
                    </pre>
                  </div>
                </div>
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm text-emerald-300">
                      <strong>Payment Verified!</strong> The facilitator confirmed the signature is valid, amount is correct, and payer has sufficient balance.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {currentStep === 7 && stepData.settleResponse && (
              <div>
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-slate-300 mb-2">HTTP Request to Facilitator</h3>
                  <div className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-4">
                    <pre className="text-xs text-yellow-200 font-mono whitespace-pre-wrap break-words">
{(() => {
  const requestBody = JSON.stringify({
    x402Version: 1,
    paymentPayload: {
      x402Version: 1,
      payload: {
        authorization: stepData.authorization,
        signature: stepData.signature
      }
    },
    paymentRequirements: stepData.paymentRequirements
  }, null, 2);
  return formatHttpRequest(
    `POST ${settlePath} HTTP/1.1`,
    {
      Host: facilitatorHost,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: 'Bearer [API_KEY]',
      'Content-Length': computeContentLength(requestBody)
    },
    requestBody
  );
})()}
                    </pre>
                  </div>
                </div>
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-slate-300 mb-2">Facilitator Response</h3>
                  <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4">
                    <pre className="text-xs text-emerald-300 overflow-x-auto font-mono">
                      {JSON.stringify(stepData.settleResponse, null, 2)}
                    </pre>
                  </div>
                </div>
                {(() => {
                  const settlementStatus = deriveSettlementStatus(stepData.settleResponse);
                  const statusInfo = getSettlementStatusDisplay(settlementStatus);
                  const transactionHash = stepData.settleResponse.transaction || stepData.settleResponse.transactionHash || stepData.settleResponse.txHash;
                  const flashblockHash = stepData.settleResponse.flashblockHash || stepData.settleResponse.flashblock_id || stepData.settleResponse.flashblockId;
                  const displayStatus = settlementStatus ? settlementStatus.toUpperCase() : 'UNKNOWN';
                  const isPreconfirmed = settlementStatus === 'preconfirmed';
                  const isFinal = isFinalSettlementStatus(settlementStatus);
                  return (
                    <div className={`${statusInfo.containerClass} rounded-lg p-4`}>
                      <div className="flex items-start gap-3">
                        <svg className={`w-5 h-5 ${statusInfo.iconColor} flex-shrink-0 mt-0.5`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div className={`text-sm ${statusInfo.textColor}`}>
                          <p className="font-semibold">{statusInfo.heading}</p>
                          <p className="mt-1 leading-relaxed">{statusInfo.description}</p>
                          <div className="mt-3 inline-flex items-center gap-2 bg-slate-900/40 border border-slate-700/40 px-3 py-1 rounded-full font-mono text-xs tracking-wide uppercase text-slate-200">
                            Status: {displayStatus}
                          </div>
                          {isPreconfirmed && (
                            <p className="mt-2 text-xs text-slate-200/80">
                              Flashblock preconfirmation means the payment is reserved but not yet finalized. Keep polling the facilitator or wait for the webhook update until the status becomes completed.
                            </p>
                          )}
                          {isFinal && (
                            <p className="mt-2 text-xs text-slate-200/80">
                              Finalized status received. You can safely fulfill the request and proceed to the response step.
                            </p>
                          )}
                          {transactionHash && (
                            <p className="mt-2 font-mono text-xs break-all text-slate-100/80">
                              Transaction: {transactionHash}
                            </p>
                          )}
                          {isPreconfirmed && flashblockHash && (
                            <p className="mt-1 font-mono text-xs break-all text-slate-100/80">
                              Flashblock: {flashblockHash}
                            </p>
                          )}
                          {stepData.settleResponse.errorReason && (
                            <p className="mt-2 text-xs text-red-200">
                              Error: {stepData.settleResponse.errorReason}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {currentStep === 8 && (
              <div>
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-slate-300 mb-2">HTTP Response</h3>
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4">
                    <pre className="text-xs text-emerald-200 font-mono whitespace-pre-wrap break-words">
{(() => {
  const settlementStatus = deriveSettlementStatus(stepData.settleResponse);
  const resolvedStatus = settlementStatus || (stepData.settleResponse?.success ? 'completed' : 'pending');
  const paymentResponse = {
    status: resolvedStatus,
    transactionHash: stepData.settleResponse?.transaction || stepData.settleResponse?.transactionHash || '0xtransactionhash',
    payer: stepData.verifyResponse?.payer || stepData.authorization?.from || '0xpayer'
  };
  const encodedHeader = Buffer.from(JSON.stringify(paymentResponse)).toString('base64');
  return formatHttpResponse(
    'HTTP/1.1 200 OK',
    {
      'Content-Type': 'image/jpeg',
      'X-PAYMENT-RESPONSE': encodedHeader
    },
    '[binary image data omitted]'
  );
})()}
                    </pre>
                  </div>
                </div>
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-slate-300 mb-2">X-PAYMENT-RESPONSE (Decoded)</h3>
                  <div className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-4">
                    <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap break-words">
{JSON.stringify({
  status: deriveSettlementStatus(stepData.settleResponse) || (stepData.settleResponse?.success ? 'completed' : 'pending'),
  transactionHash: stepData.settleResponse?.transaction || stepData.settleResponse?.transactionHash || '0xtransactionhash',
  payer: stepData.verifyResponse?.payer || stepData.authorization?.from || '0xpayer'
}, null, 2)}
                    </pre>
                  </div>
                </div>
                <div className="bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 border border-emerald-500/20 rounded-lg p-6 text-center">
                  <div className="text-4xl mb-3">🎉</div>
                  <p className="text-emerald-300 font-semibold">
{(() => {
  const settlementStatus = deriveSettlementStatus(stepData.settleResponse);
  if (settlementStatus === 'preconfirmed') {
    return 'Server acknowledges Flashblock preconfirmation. Deliver content once the settlement status advances to completed.';
  }
  if (isFinalSettlementStatus(settlementStatus)) {
    return 'Server returns the premium content along with payment confirmation!';
  }
  return 'Server reports the current settlement status. Hold delivery until the facilitator confirms completion.';
})()}
                  </p>
                </div>
              </div>
            )}

            {currentStep === 9 && (
              <div className="text-center py-8">
                <div className="inline-block bg-gradient-to-br from-cyan-500 to-blue-600 p-4 rounded-xl shadow-lg shadow-cyan-900/50 mb-6">
                  <svg className="w-16 h-16 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold text-slate-100 mb-3">Tutorial Complete!</h3>
                <p className="text-slate-400 mb-6">
                  You've successfully walked through the entire X-402 payment protocol flow.
                </p>
                <div className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-6 max-w-2xl mx-auto text-left">
                  <h4 className="font-semibold text-slate-200 mb-3">What you learned:</h4>
                  <ul className="space-y-2 text-sm text-slate-300">
                    <li className="flex items-start gap-2">
                      <span className="text-cyan-400 mt-1">✓</span>
                      <span>How servers indicate payment required with 402 status</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-cyan-400 mt-1">✓</span>
                      <span>Creating ERC-3009 transfer authorizations</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-cyan-400 mt-1">✓</span>
                      <span>Signing with EIP-712 typed data</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-cyan-400 mt-1">✓</span>
                      <span>Encoding payment data for HTTP headers</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-cyan-400 mt-1">✓</span>
                      <span>Payment verification and settlement flow</span>
                    </li>
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* Error Display */}
          {error && (
            <div className="mt-6 bg-red-500/10 border border-red-500/20 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <div className="font-semibold text-red-300 mb-1">Error</div>
                  <div className="text-sm text-red-200">{error}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <button
              onClick={handleReset}
              disabled={currentStep === 0}
              className="px-4 sm:px-6 py-2.5 sm:py-3 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition-all text-sm sm:text-base"
            >
              Reset Tutorial
            </button>
            <button
              onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
              disabled={currentStep === 0}
              className="px-4 sm:px-6 py-2.5 sm:py-3 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition-all flex items-center justify-center gap-2 text-sm sm:text-base"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back
            </button>
          </div>

          {currentStep < STEPS.length - 1 ? (
            currentStep === 2 && !isConnected ? (
              <div className="w-full sm:w-auto">
                <WalletConnect />
              </div>
            ) : (
            <button
              onClick={handleNext}
              disabled={!canProceed()}
              className="px-4 sm:px-8 py-2.5 sm:py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg hover:from-cyan-600 hover:to-blue-700 disabled:from-slate-600 disabled:to-slate-700 disabled:cursor-not-allowed font-semibold shadow-lg shadow-cyan-900/50 transition-all flex items-center justify-center gap-2 text-sm sm:text-base w-full sm:w-auto"
            >
              {processing ? (
                <>
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processing...
                </>
              ) : currentStep === 3 && !stepData.signature ? (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                  Sign Authorization
                </>
              ) : currentStep === 6 && !stepData.verifyResponse ? (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Verify Payment
                </>
              ) : currentStep === 7 && !stepData.settleResponse ? (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Settle Payment
                </>
              ) : currentStep === 7 && stepData.settleResponse && !settlementIsFinal ? (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 016.364 0L12 7.636l1.318-1.318a4.5 4.5 0 116.364 6.364L12 21.364l-7.682-7.682a4.5 4.5 0 010-6.364z" />
                  </svg>
                  Refresh Settlement Status
                </>
              ) : (
                <>
                  Next Step
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </>
              )}
            </button>
            )
          ) : (
            <Link
              href="/demo"
              className="px-4 sm:px-8 py-2.5 sm:py-3 bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded-lg hover:from-emerald-600 hover:to-green-700 font-semibold shadow-lg shadow-emerald-900/50 transition-all inline-flex items-center justify-center gap-2 text-sm sm:text-base w-full sm:w-auto"
            >
              Try Full Demo
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
