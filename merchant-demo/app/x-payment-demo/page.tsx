'use client';

import { useState, useEffect } from 'react';
import { useAccount, useSignTypedData } from 'wagmi';
import WalletConnect from '../components/WalletConnect';

/**
 * X-PAYMENT Header Protocol Demo
 * 
 * This demonstrates the complete X-402 payment flow using X-PAYMENT headers
 * Shows raw data at each step: Client → Server → Facilitator → Server → Client
 */

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

export default function XPaymentDemo() {
  const { address, isConnected } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  
  const [apiKey, setApiKey] = useState('');
  const [merchantAddress, setMerchantAddress] = useState('');
  const [networks, setNetworks] = useState<NetworkConfig[]>([]);
  const [selectedNetwork, setSelectedNetwork] = useState('base-sepolia');
  
  // Demo state
  const [step, setStep] = useState(0);
  const [rawDataLog, setRawDataLog] = useState<Array<{
    step: string;
    direction: string;
    data: any;
    decoded?: any;
  }>>([]);
  
  const [paymentPayload, setPaymentPayload] = useState<any>(null);
  const [xPaymentHeader, setXPaymentHeader] = useState('');
  const [serverResponse, setServerResponse] = useState<any>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  const facilitatorUrl = process.env.NEXT_PUBLIC_FACILITATOR_URL || 'http://localhost:8080';

  useEffect(() => {
    const stored = localStorage.getItem('x402_api_key');
    if (stored) setApiKey(stored);
  }, []);

  useEffect(() => {
    const fetchNetworks = async () => {
      try {
        const response = await fetch(`${facilitatorUrl}/networks`);
        if (response.ok) {
          const data = await response.json();
          setNetworks(data.networks);
        }
      } catch (error) {
        console.error('Failed to fetch networks:', error);
      }
    };
    fetchNetworks();
  }, []);

  useEffect(() => {
    const fetchMerchantAddress = async () => {
      if (!apiKey) return;
      try {
        const response = await fetch(`${facilitatorUrl}/merchant/wallet`, {
          headers: { 'Authorization': `Bearer ${apiKey}` }
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

  const addLog = (step: string, direction: string, data: any, decoded?: any) => {
    setRawDataLog(prev => [...prev, { step, direction, data, decoded }]);
  };

  const handleStep1_CreatePayment = async () => {
    if (!address || !merchantAddress) return;
    
    setProcessing(true);
    setError('');
    setStep(1);

    try {
      const network = networks.find(n => n.network === selectedNetwork);
      if (!network || !network.tokens[0]) throw new Error('Network not found');

      const token = network.tokens[0];
      const amount = '10000'; // 0.01 USDC
      const validAfter = Math.floor(Date.now() / 1000).toString();
      const validBefore = (Math.floor(Date.now() / 1000) + 3600).toString();
      const nonce = '0x' + Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map(b => b.toString(16).padStart(2, '0')).join('');

      const authorization = {
        from: address,
        to: merchantAddress,
        value: amount,
        validAfter,
        validBefore,
        nonce
      };

      addLog(
        'Step 1: Client Creates Authorization',
        'CLIENT',
        {
          description: 'User creates payment authorization object',
          authorization,
          notes: [
            `from: User's wallet address (${address})`,
            `to: Merchant address (${merchantAddress})`,
            `value: ${amount} (0.01 USDC with 6 decimals)`,
            `validAfter: ${new Date(parseInt(validAfter) * 1000).toISOString()}`,
            `validBefore: ${new Date(parseInt(validBefore) * 1000).toISOString()}`,
            `nonce: Random 32-byte hex for replay protection`
          ]
        }
      );

      // Step 2: Sign with EIP-712
      setStep(2);

      const domain = {
        name: token.eip712?.name || 'USD Coin',
        version: token.eip712?.version || '2',
        chainId: network.chainId,
        verifyingContract: token.address as `0x${string}`
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

      addLog(
        'Step 2a: EIP-712 Domain',
        'CLIENT',
        {
          description: 'EIP-712 domain separator for signature',
          domain,
          notes: [
            'Domain ensures signatures are network-specific',
            'Prevents cross-chain replay attacks',
            `chainId: ${network.chainId} (${selectedNetwork})`
          ]
        }
      );

      addLog(
        'Step 2b: EIP-712 Types',
        'CLIENT',
        {
          description: 'Typed data structure for TransferWithAuthorization',
          types,
          notes: [
            'ERC-3009 standard structure',
            'All fields must match exactly for valid signature'
          ]
        }
      );

      const signature = await signTypedDataAsync({
        domain,
        types,
        primaryType: 'TransferWithAuthorization',
        message: authorization as any
      });

      addLog(
        'Step 2c: Signature Created',
        'CLIENT',
        {
          description: 'User signs authorization with MetaMask',
          signature,
          length: signature.length,
          notes: [
            'ECDSA signature over keccak256 hash',
            '65 bytes: r (32) + s (32) + v (1)',
            'Proves user authorized this specific transfer'
          ]
        }
      );

      const payload = {
        authorization,
        signature
      };

      setPaymentPayload(payload);

      // Step 3: Encode to base64
      setStep(3);

      const jsonString = JSON.stringify(payload);
      const base64Encoded = Buffer.from(jsonString).toString('base64');
      setXPaymentHeader(base64Encoded);

      addLog(
        'Step 3a: JSON Stringification',
        'CLIENT',
        {
          description: 'Convert payment object to JSON',
          json: jsonString,
          size: `${jsonString.length} bytes`,
          notes: [
            'Contains authorization + signature',
            'Ready for base64 encoding'
          ]
        }
      );

      addLog(
        'Step 3b: Base64 Encoding',
        'CLIENT',
        {
          description: 'Encode JSON as base64 for X-PAYMENT header',
          base64: base64Encoded,
          size: `${base64Encoded.length} bytes`,
          decoded: payload,
          notes: [
            'HTTP headers must be ASCII-safe',
            'Base64 encoding ensures safe transmission',
            `Original: ${jsonString.length} bytes → Encoded: ${base64Encoded.length} bytes`
          ]
        }
      );

      setProcessing(false);

    } catch (err: any) {
      setError(err.message);
      setProcessing(false);
    }
  };

  const handleStep4_SendToServer = async () => {
    if (!xPaymentHeader) return;

    setProcessing(true);
    setError('');
    setStep(4);

    addLog(
      'Step 4: Client → Server (HTTP Request)',
      'CLIENT → SERVER',
      {
        description: 'Client sends GET request with X-PAYMENT header',
        method: 'GET',
        url: '/api/premium/cat',
        headers: {
          'X-PAYMENT': xPaymentHeader.substring(0, 50) + '...',
          'Content-Type': 'application/json'
        },
        fullHeader: xPaymentHeader,
        notes: [
          'X-PAYMENT header contains base64-encoded payment',
          'Server will decode, verify, and settle',
          'No request body needed for GET'
        ]
      },
      { authorization: paymentPayload.authorization, signature: paymentPayload.signature }
    );

    try {
      // Step 5: Server receives and decodes
      setStep(5);

      addLog(
        'Step 5: Server Decodes X-PAYMENT',
        'SERVER',
        {
          description: 'Server decodes base64 header back to JSON',
          received: xPaymentHeader.substring(0, 50) + '...',
          decoded: paymentPayload,
          notes: [
            'Buffer.from(header, "base64").toString("utf-8")',
            'JSON.parse() to get payment object',
            'Ready for facilitator verification'
          ]
        }
      );

      // Step 6: Server → Facilitator (Verify)
      setStep(6);

      const verifyPayload = {
        x402Version: 1,
        paymentPayload: {
          x402Version: 1,
          payload: paymentPayload
        },
        paymentRequirements: {
          scheme: 'erc3009',
          network: selectedNetwork,
          asset: 'USDC',
          payTo: merchantAddress,
          maxAmountRequired: '10000',
          resource: '/api/premium/cat',
          description: 'Premium Cat Image Access',
          mimeType: 'image/jpeg',
          maxTimeoutSeconds: 300
        }
      };

      addLog(
        'Step 6: Server → Facilitator (POST /verify)',
        'SERVER → FACILITATOR',
        {
          description: 'Server sends verification request to facilitator',
          method: 'POST',
          url: `${facilitatorUrl}/verify`,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer [API_KEY]'
          },
          body: verifyPayload,
          size: `${JSON.stringify(verifyPayload).length} bytes`,
          notes: [
            'Includes payment payload + requirements',
            'Facilitator will verify signature & balance',
            'API key authenticates merchant'
          ]
        }
      );

      const verifyResponse = await fetch(`${facilitatorUrl}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(verifyPayload)
      });

      const verifyResult = await verifyResponse.json();

      addLog(
        'Step 7: Facilitator → Server (Verification Result)',
        'FACILITATOR → SERVER',
        {
          description: 'Facilitator returns verification result',
          status: verifyResponse.status,
          result: verifyResult,
          notes: [
            `Valid: ${verifyResult.isValid || verifyResult.is_valid}`,
            verifyResult.payer ? `Payer: ${verifyResult.payer}` : '',
            verifyResult.invalidReason ? `Reason: ${verifyResult.invalidReason}` : '',
            'Verified: signature, recipient, amount, time, balance'
          ]
        }
      );

      if (!verifyResult.isValid && !verifyResult.is_valid) {
        throw new Error(verifyResult.invalidReason || 'Payment verification failed');
      }

      // Step 8: Server → Facilitator (Settle)
      setStep(7);

      addLog(
        'Step 8: Server → Facilitator (POST /settle)',
        'SERVER → FACILITATOR',
        {
          description: 'Server requests payment settlement',
          method: 'POST',
          url: `${facilitatorUrl}/settle`,
          body: verifyPayload,
          notes: [
            'Same payload as verify',
            'Facilitator will execute blockchain transaction',
            'Uses ERC-3009 transferWithAuthorization'
          ]
        }
      );

      const settleResponse = await fetch(`${facilitatorUrl}/settle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(verifyPayload)
      });

      const settleResult = await settleResponse.json();

      addLog(
        'Step 9: Facilitator → Server (Settlement Result)',
        'FACILITATOR → SERVER',
        {
          description: 'Facilitator returns settlement result',
          status: settleResponse.status,
          result: settleResult,
          notes: [
            `Success: ${settleResult.success}`,
            settleResult.transaction ? `TX Hash: ${settleResult.transaction}` : '',
            settleResult.status ? `Status: ${settleResult.status}` : '',
            'Transaction submitted to blockchain'
          ]
        }
      );

      if (!settleResult.success) {
        throw new Error(settleResult.errorReason || 'Settlement failed');
      }

      // Step 10: Server → Client (Success Response)
      setStep(8);

      const responsePayload = {
        success: true,
        resource: '/api/premium/cat',
        imageUrl: 'https://cataas.com/cat/cute',
        description: 'Exclusive premium cat image',
        payer: verifyResult.payer,
        transactionHash: settleResult.transaction
      };

      const xPaymentResponse = Buffer.from(JSON.stringify({
        status: 'completed',
        transactionHash: settleResult.transaction,
        payer: verifyResult.payer
      })).toString('base64');

      addLog(
        'Step 10: Server → Client (HTTP Response)',
        'SERVER → CLIENT',
        {
          description: 'Server returns content with payment confirmation',
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'X-PAYMENT-RESPONSE': xPaymentResponse
          },
          body: responsePayload,
          notes: [
            'X-PAYMENT-RESPONSE header confirms payment',
            'Body contains purchased content',
            'Client can now display premium content'
          ]
        },
        {
          status: 'completed',
          transactionHash: settleResult.transaction,
          payer: verifyResult.payer
        }
      );

      setServerResponse(responsePayload);
      setProcessing(false);
      setStep(9);

    } catch (err: any) {
      setError(err.message);
      setProcessing(false);
    }
  };

  const resetDemo = () => {
    setStep(0);
    setRawDataLog([]);
    setPaymentPayload(null);
    setXPaymentHeader('');
    setServerResponse(null);
    setError('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            X-PAYMENT Header Protocol Demo
          </h1>
          <p className="text-gray-600 mb-4">
            Complete X-402 payment flow with raw data inspection at each step
          </p>
          <WalletConnect />
        </div>

        {/* Configuration */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">Configuration</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                API Key
              </label>
              <input
                type="text"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  localStorage.setItem('x402_api_key', e.target.value);
                }}
                placeholder="Enter facilitator API key"
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Merchant Address: {merchantAddress || 'Not loaded'}
              </label>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Network
              </label>
              <select
                value={selectedNetwork}
                onChange={(e) => setSelectedNetwork(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                {networks.map(net => (
                  <option key={net.network} value={net.network}>
                    {net.network} (Chain ID: {net.chainId})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Progress Indicator */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">Progress</h2>
          <div className="flex items-center space-x-2 overflow-x-auto pb-2">
            {[
              'Start',
              'Create Auth',
              'Sign EIP-712',
              'Encode Base64',
              'Client→Server',
              'Server Decode',
              'Verify',
              'Settle',
              'Response',
              'Complete'
            ].map((label, idx) => (
              <div key={idx} className="flex items-center">
                <div className={`flex items-center justify-center w-10 h-10 rounded-full ${
                  step >= idx ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-500'
                } font-semibold text-sm`}>
                  {idx}
                </div>
                {idx < 9 && (
                  <div className={`h-1 w-8 ${step > idx ? 'bg-blue-500' : 'bg-gray-200'}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">Actions</h2>
          <div className="flex space-x-4">
            <button
              onClick={handleStep1_CreatePayment}
              disabled={!isConnected || !apiKey || !merchantAddress || processing || step >= 3}
              className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed font-semibold"
            >
              Step 1-3: Create & Sign Payment
            </button>
            <button
              onClick={handleStep4_SendToServer}
              disabled={!xPaymentHeader || processing || step >= 9}
              className="px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed font-semibold"
            >
              Step 4-10: Send to Server & Complete
            </button>
            <button
              onClick={resetDemo}
              className="px-6 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 font-semibold"
            >
              Reset Demo
            </button>
          </div>
          {processing && (
            <div className="mt-4 text-blue-600 font-medium">
              Processing... Step {step}
            </div>
          )}
          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
              Error: {error}
            </div>
          )}
        </div>

        {/* Raw Data Log */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">Raw Data Flow</h2>
          {rawDataLog.length === 0 ? (
            <p className="text-gray-500">No data yet. Start the demo to see raw data at each step.</p>
          ) : (
            <div className="space-y-6">
              {rawDataLog.map((log, idx) => (
                <div key={idx} className="border-l-4 border-blue-500 pl-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold text-lg text-gray-800">{log.step}</h3>
                    <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                      log.direction.includes('CLIENT') ? 'bg-blue-100 text-blue-800' :
                      log.direction.includes('SERVER') ? 'bg-green-100 text-green-800' :
                      'bg-purple-100 text-purple-800'
                    }`}>
                      {log.direction}
                    </span>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4 mb-2">
                    <pre className="text-xs overflow-x-auto whitespace-pre-wrap">
                      {JSON.stringify(log.data, null, 2)}
                    </pre>
                  </div>
                  {log.decoded && (
                    <details className="mb-2">
                      <summary className="cursor-pointer text-sm font-semibold text-blue-600 hover:text-blue-800">
                        View Decoded Data
                      </summary>
                      <div className="bg-blue-50 rounded-lg p-4 mt-2">
                        <pre className="text-xs overflow-x-auto whitespace-pre-wrap">
                          {JSON.stringify(log.decoded, null, 2)}
                        </pre>
                      </div>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Final Result */}
        {serverResponse && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-bold mb-4 text-green-600">✅ Payment Complete!</h2>
            <div className="space-y-4">
              <div>
                <p className="font-semibold">Transaction Hash:</p>
                <p className="font-mono text-sm text-blue-600 break-all">
                  {serverResponse.transactionHash}
                </p>
              </div>
              <div>
                <p className="font-semibold">Premium Content:</p>
                <img
                  src={serverResponse.imageUrl}
                  alt="Premium Cat"
                  className="rounded-lg shadow-md max-w-md"
                />
              </div>
              <div>
                <p className="text-gray-600">{serverResponse.description}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
