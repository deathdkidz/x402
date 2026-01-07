'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function DocsPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'verify' | 'settle' | 'networks' | 'health' | 'merchant' | 'responses'>('overview');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-2xl font-bold text-slate-100 mb-2">API Documentation</h1>
            <p className="text-slate-400 text-sm">Complete guide to the X-402 Facilitator API</p>
          </div>
          <Link
            href="/"
            className="px-4 py-2 bg-slate-800/40 border border-slate-700/40 rounded-lg text-slate-300 hover:bg-slate-700/60 transition-colors text-sm"
          >
            ← Back to Home
          </Link>
        </div>

        {/* Navigation Tabs */}
        <div className="bg-slate-800/40 border border-slate-700/40 rounded-lg p-2 mb-6">
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'responses', label: 'Response Guide' },
              { id: 'verify', label: '/verify' },
              { id: 'settle', label: '/settle' },
              { id: 'supported', label: '/supported' },
              { id: 'health', label: '/health' },
              { id: 'merchant', label: '/merchant' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-cyan-500 text-white'
                    : 'text-slate-400 hover:text-slate-300 hover:bg-slate-700/40'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content Area */}
        <div className="bg-slate-800/40 border border-slate-700/40 rounded-lg p-5">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-100 mb-4">Getting Started</h2>
                <p className="text-slate-300 mb-4">
                  The x402 Facilitator Service provides a secure, production-ready payment facilitator 
                  for gasless ERC-3009 token transfers with multi-layer verification.
                </p>
              </div>

              <div className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-6">
                <h3 className="text-lg font-bold text-slate-100 mb-3">Base URL</h3>
                <code className="text-cyan-400 font-mono bg-slate-800/60 px-3 py-1 rounded">
                  {process.env.NEXT_PUBLIC_FACILITATOR_URL || 'http://localhost:8080'}
                </code>
              </div>

              <div className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-6">
                <h3 className="text-lg font-bold text-slate-100 mb-3">Authentication</h3>
                <p className="text-slate-300 mb-3">
                  Most endpoints require API key authentication. Include your API key in the Authorization header:
                </p>
                <pre className="bg-slate-800/60 p-4 rounded-lg overflow-x-auto">
                  <code className="text-cyan-400 text-sm font-mono">
                    Authorization: Bearer YOUR_API_KEY
                  </code>
                </pre>
              </div>

              <div className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-6">
                <h3 className="text-lg font-bold text-slate-100 mb-3">Supported Networks</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-200 mb-2">Mainnet</h4>
                    <ul className="space-y-2">
                      <li className="flex items-center gap-2 text-slate-300">
                        <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                        base (Chain ID: 8453)
                      </li>
                      <li className="flex items-center gap-2 text-slate-300">
                        <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                        ethereum (Chain ID: 1)
                      </li>
                      <li className="flex items-center gap-2 text-slate-300">
                        <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                        optimism (Chain ID: 10)
                      </li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-200 mb-2">Testnet</h4>
                    <ul className="space-y-2">
                      <li className="flex items-center gap-2 text-slate-300">
                        <span className="w-2 h-2 bg-cyan-400 rounded-full"></span>
                        base-sepolia (Chain ID: 84532)
                      </li>
                      <li className="flex items-center gap-2 text-slate-300">
                        <span className="w-2 h-2 bg-cyan-400 rounded-full"></span>
                        sepolia (Chain ID: 11155111)
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-6">
                <h3 className="text-lg font-bold text-slate-100 mb-3">Rate Limits</h3>
                <div className="space-y-2 text-slate-300">
                  <p><strong className="text-slate-100">Default:</strong> 100 requests per minute</p>
                  <p><strong className="text-slate-100">Response Headers:</strong></p>
                  <ul className="ml-4 space-y-1 text-sm font-mono">
                    <li>X-RateLimit-Limit: Maximum requests allowed</li>
                    <li>X-RateLimit-Remaining: Remaining requests</li>
                    <li>X-RateLimit-Reset: Reset timestamp</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Verify Endpoint Tab */}
          {activeTab === 'verify' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-100 mb-2">POST /verify</h2>
                <p className="text-slate-300">
                  Verify a payment authorization with multi-layer security checks
                </p>
              </div>

              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
                <div className="flex gap-2">
                  <div>
                    <p className="text-amber-300 font-medium">Authentication Required</p>
                    <p className="text-amber-300/80 text-sm">Requires valid API key with active merchant</p>
                  </div>
                </div>
              </div>

              <div className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-6">
                <h3 className="text-lg font-bold text-slate-100 mb-3">Verification Layers</h3>
                <div className="space-y-2">
                  {[
                    'Network validation',
                    'EIP-712 signature verification',
                    'Token balance verification',
                    'Allowance verification',
                    'Amount validation',
                    'Time window validation'
                  ].map((layer, index) => (
                    <div key={index} className="flex items-center gap-3">
                      <span className="flex items-center justify-center w-6 h-6 bg-cyan-500/20 text-cyan-400 rounded-full text-xs font-bold">
                        {index + 1}
                      </span>
                      <span className="text-slate-300">{layer}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-6">
                <h3 className="text-lg font-bold text-slate-100 mb-3">Request Body</h3>
                <pre className="bg-slate-800/60 p-4 rounded-lg overflow-x-auto text-xs">
                  <code className="text-cyan-400 font-mono">{`{
  "x402Version": 1,
  "paymentPayload": {
    "authorization": {
      "from": "0x742d35Cc6634C0532925a3b844Bc9e7595f1dE21",
      "to": "0x8ba1f109551bD432803012645Ac136ddd64DBa72",
      "value": "1000000",
      "validAfter": "0",
      "validBefore": "1735776000",
      "nonce": "0x0000000000000000000000000000000000000000000000000000000000000001"
    },
    "signature": "0x1234567890abcdef..."
  },
  "paymentRequirements": {
    "scheme": "exact",
    "network": "base-sepolia",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "payTo": "0x8ba1f109551bD432803012645Ac136ddd64DBa72",
    "maxAmountRequired": "1000000",
    "resource": "https://api.example.com/premium/data",
    "description": "Premium API access",
    "mimeType": "application/json",
    "maxTimeoutSeconds": 60
  }
}`}</code>
                </pre>
              </div>

              <div className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-6">
                <h3 className="text-lg font-bold text-slate-100 mb-3">Success Response (200 OK)</h3>
                <pre className="bg-slate-800/60 p-4 rounded-lg overflow-x-auto text-xs">
                  <code className="text-green-400 font-mono">{`{
  "isValid": true,
  "payer": "0x1234...5678"
}`}</code>
                </pre>
              </div>

              <div className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-6">
                <h3 className="text-lg font-bold text-slate-100 mb-3">Invalid Response (200 OK)</h3>
                <pre className="bg-slate-800/60 p-4 rounded-lg overflow-x-auto text-xs">
                  <code className="text-red-400 font-mono">{`{
  "isValid": false,
  "invalidReason": "Insufficient balance: has 500000, needs 1000000"
}`}</code>
                </pre>
              </div>

              <div className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-6">
                <h3 className="text-lg font-bold text-slate-100 mb-3">Example cURL</h3>
                <pre className="bg-slate-800/60 p-4 rounded-lg overflow-x-auto text-xs">
                  <code className="text-slate-300 font-mono">{`curl -X POST ${process.env.NEXT_PUBLIC_FACILITATOR_URL || 'http://localhost:8080'}/verify \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{
    "x402Version": 1,
    "paymentPayload": { ... },
    "paymentRequirements": { ... }
  }'`}</code>
                </pre>
              </div>
            </div>
          )}

          {/* Settle Endpoint Tab */}
          {activeTab === 'settle' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-100 mb-2">POST /settle</h2>
                <p className="text-slate-300">
                  Execute an on-chain settlement of a verified payment authorization
                </p>
              </div>

              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
                <div className="flex gap-2">
                  <div>
                    <p className="text-amber-300 font-medium">Authentication Required</p>
                    <p className="text-amber-300/80 text-sm">Include your API key in the Authorization header</p>
                  </div>
                </div>
              </div>

              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
                <div className="flex gap-2">
                  <div>
                    <p className="text-blue-300 text-sm">
                      Settlement executes the receiveWithAuthorization function on-chain, 
                      transferring tokens from the payer to the merchant. Gas fees are paid by the facilitator.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-6">
                <h3 className="text-lg font-bold text-slate-100 mb-3">Request Body</h3>
                <p className="text-slate-400 text-sm mb-3">Same structure as /verify endpoint</p>
                <pre className="bg-slate-800/60 p-4 rounded-lg overflow-x-auto text-xs">
                  <code className="text-cyan-400 font-mono">{`{
  "x402Version": 1,
  "paymentPayload": {
    "authorization": {
      "from": "0x742d35Cc6634C0532925a3b844Bc9e7595f1dE21",
      "to": "0x8ba1f109551bD432803012645Ac136ddd64DBa72",
      "value": "1000000",
      "validAfter": "0",
      "validBefore": "1735776000",
      "nonce": "0x0000000000000000000000000000000000000000000000000000000000000001"
    },
    "signature": "0x1234567890abcdef..."
  },
  "paymentRequirements": {
    "scheme": "exact",
    "network": "base",
    "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "payTo": "0x8ba1f109551bD432803012645Ac136ddd64DBa72",
    "maxAmountRequired": "1000000",
    "resource": "https://api.example.com/premium/data",
    "description": "Premium API access",
    "mimeType": "application/json",
    "maxTimeoutSeconds": 60
  }
}`}</code>
                </pre>
              </div>

              <div className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-6">
                <h3 className="text-lg font-bold text-slate-100 mb-3">Success Response (200 OK)</h3>
                <pre className="bg-slate-800/60 p-4 rounded-lg overflow-x-auto text-xs">
                  <code className="text-green-400 font-mono">{`{
  "success": true,
  "transaction": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
  "network": "base",
  "payer": "0x742d35Cc6634C0532925a3b844Bc9e7595f1dE21",
  "status": "completed"
}`}</code>
                </pre>
                <p className="text-slate-400 text-sm mt-3">Transaction statuses: <code className="text-cyan-400">pending</code>, <code className="text-cyan-400">preconfirmed</code>, <code className="text-cyan-400">completed</code>, <code className="text-cyan-400">failed</code></p>
              </div>

              <div className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-6">
                <h3 className="text-lg font-bold text-slate-100 mb-3">Error Response (200 OK)</h3>
                <pre className="bg-slate-800/60 p-4 rounded-lg overflow-x-auto text-xs">
                  <code className="text-red-400 font-mono">{`{
  "success": false,
  "network": "base",
  "errorReason": "Insufficient credits",
  "status": "failed"
}`}</code>
                </pre>
              </div>

              <div className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-6">
                <h3 className="text-lg font-bold text-slate-100 mb-3">Preconfirmed Response (Flashblock Networks)</h3>
                <pre className="bg-slate-800/60 p-4 rounded-lg overflow-x-auto text-xs">
                  <code className="text-amber-400 font-mono">{`{
  "success": true,
  "transaction": "0xabcdef1234567890...",
  "network": "base",
  "payer": "0x742d35Cc6634C0532925a3b844Bc9e7595f1dE21",
  "status": "preconfirmed",
  "message": "Transaction preconfirmed via flashblock"
}`}</code>
                </pre>
              </div>

              <div className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-6">
                <h3 className="text-lg font-bold text-slate-100 mb-3">Example cURL</h3>
                <pre className="bg-slate-800/60 p-4 rounded-lg overflow-x-auto text-xs">
                  <code className="text-slate-300 font-mono">{`curl -X POST ${process.env.NEXT_PUBLIC_FACILITATOR_URL || 'http://localhost:8080'}/settle \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{
    "x402Version": 1,
    "paymentPayload": { ... },
    "paymentRequirements": { ... }
  }'`}</code>
                </pre>
              </div>
            </div>
          )}

          {/* Supported Networks Endpoint Tab */}
          {activeTab === 'supported' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-100 mb-2">GET /supported</h2>
                <p className="text-slate-300">
                  Get information about supported networks and their tokens
                </p>
              </div>

              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
                <div className="flex gap-2">
                  <div>
                    <p className="text-green-300 font-medium">Public Endpoint</p>
                    <p className="text-green-300/80 text-sm">No authentication required</p>
                  </div>
                </div>
              </div>

              <div className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-6">
                <h3 className="text-lg font-bold text-slate-100 mb-3">Success Response (200 OK)</h3>
                <pre className="bg-slate-800/60 p-4 rounded-lg overflow-x-auto text-xs">
                  <code className="text-green-400 font-mono">{`{
  "success": true,
  "mainnet": [
    {
      "network": "base",
      "chainId": 8453,
      "tokens": [
        {
          "symbol": "USDC",
          "name": "USD Coin",
          "address": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          "decimals": 6,
          "eip712": {
            "name": "USD Coin",
            "version": "2",
            "verifyingContract": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
          }
        }
      ]
    },
    {
      "network": "ethereum",
      "chainId": 1,
      "tokens": [...]
    },
    {
      "network": "optimism",
      "chainId": 10,
      "tokens": [...]
    }
  ],
  "testnet": [
    {
      "network": "base-sepolia",
      "chainId": 84532,
      "tokens": [
        {
          "symbol": "USDC",
          "name": "USD Coin",
          "address": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
          "decimals": 6,
          "eip712": {
            "name": "USD Coin",
            "version": "2",
            "verifyingContract": "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
          }
        }
      ]
    },
    {
      "network": "sepolia",
      "chainId": 11155111,
      "tokens": [...]
    }
  ]
}`}</code>
                </pre>
              </div>

              <div className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-6">
                <h3 className="text-lg font-bold text-slate-100 mb-3">Example cURL</h3>
                <pre className="bg-slate-800/60 p-4 rounded-lg overflow-x-auto text-xs">
                  <code className="text-slate-300 font-mono">{`curl ${process.env.NEXT_PUBLIC_FACILITATOR_URL || 'http://localhost:8080'}/supported`}</code>
                </pre>
              </div>

              <div className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-6">
                <h3 className="text-lg font-bold text-slate-100 mb-3">Use Cases</h3>
                <ul className="space-y-2">
                  <li className="flex items-start gap-2 text-slate-300">
                    <span className="text-cyan-400 mt-1">•</span>
                    <span>Dynamically populate network selection dropdowns</span>
                  </li>
                  <li className="flex items-start gap-2 text-slate-300">
                    <span className="text-cyan-400 mt-1">•</span>
                    <span>Get token contract addresses for each network</span>
                  </li>
                  <li className="flex items-start gap-2 text-slate-300">
                    <span className="text-cyan-400 mt-1">•</span>
                    <span>Retrieve EIP-712 domain information for signing</span>
                  </li>
                  <li className="flex items-start gap-2 text-slate-300">
                    <span className="text-cyan-400 mt-1">•</span>
                    <span>Check which networks are currently configured</span>
                  </li>
                </ul>
              </div>
            </div>
          )}

          {/* Health Endpoint Tab */}
          {activeTab === 'health' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-100 mb-2">GET /health</h2>
                <p className="text-slate-300">
                  Check the health and status of the facilitator service
                </p>
              </div>

              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
                <div className="flex gap-2">
                  <div>
                    <p className="text-green-300 font-medium">Public Endpoint</p>
                    <p className="text-green-300/80 text-sm">No authentication required</p>
                  </div>
                </div>
              </div>

              <div className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-6">
                <h3 className="text-lg font-bold text-slate-100 mb-3">Success Response (200 OK)</h3>
                <pre className="bg-slate-800/60 p-4 rounded-lg overflow-x-auto text-xs">
                  <code className="text-green-400 font-mono">{`{
  "status": "ok",
  "service": "x402-facilitator",
  "timestamp": 1767355984545,
  "uptime": 672595.523348902
}`}</code>
                </pre>
              </div>

              <div className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-6">
                <h3 className="text-lg font-bold text-slate-100 mb-3">Response Fields</h3>
                <div className="space-y-3 text-sm">
                  <div>
                    <span className="text-cyan-400 font-mono">status</span>
                    <span className="text-slate-400 ml-2">- Service health status</span>
                  </div>
                  <div>
                    <span className="text-cyan-400 font-mono">service</span>
                    <span className="text-slate-400 ml-2">- Service name identifier</span>
                  </div>
                  <div>
                    <span className="text-cyan-400 font-mono">timestamp</span>
                    <span className="text-slate-400 ml-2">- Current server timestamp (Unix ms)</span>
                  </div>
                  <div>
                    <span className="text-cyan-400 font-mono">uptime</span>
                    <span className="text-slate-400 ml-2">- Service uptime in seconds</span>
                  </div>
                  <div>
                    <span className="text-cyan-400 font-mono">supportedNetworks</span>
                    <span className="text-slate-400 ml-2">- List of all supported blockchain networks</span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-6">
                <h3 className="text-lg font-bold text-slate-100 mb-3">Example cURL</h3>
                <pre className="bg-slate-800/60 p-4 rounded-lg overflow-x-auto text-xs">
                  <code className="text-slate-300 font-mono">{`curl ${process.env.NEXT_PUBLIC_FACILITATOR_URL || 'http://localhost:8080'}/health`}</code>
                </pre>
              </div>

              <div className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-6">
                <h3 className="text-lg font-bold text-slate-100 mb-3">Use Cases</h3>
                <ul className="space-y-2">
                  <li className="flex items-start gap-2 text-slate-300">
                    <span className="text-cyan-400 mt-1">•</span>
                    <span>Monitoring and alerting systems</span>
                  </li>
                  <li className="flex items-start gap-2 text-slate-300">
                    <span className="text-cyan-400 mt-1">•</span>
                    <span>Load balancer health checks</span>
                  </li>
                  <li className="flex items-start gap-2 text-slate-300">
                    <span className="text-cyan-400 mt-1">•</span>
                    <span>Service discovery and orchestration</span>
                  </li>
                  <li className="flex items-start gap-2 text-slate-300">
                    <span className="text-cyan-400 mt-1">•</span>
                    <span>Client-side service availability checks</span>
                  </li>
                </ul>
              </div>
            </div>
          )}

          {/* Response Guide Tab */}
          {activeTab === 'responses' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-100 mb-4">Response Handling Guide</h2>
                <p className="text-slate-300 mb-4">
                  Critical information for correctly handling API responses from the X-402 facilitator.
                </p>
              </div>

              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-5">
                <div className="flex gap-3">
                  <div>
                    <h3 className="text-red-300 font-bold mb-2">CRITICAL: Don't Just Check HTTP Status!</h3>
                    <p className="text-red-300/80 text-sm">
                      The facilitator returns <code className="bg-red-900/30 px-2 py-0.5 rounded">200 OK</code> even when operations fail.
                      <strong className="block mt-2">Always check the response body fields!</strong>
                    </p>
                  </div>
                </div>
              </div>

              {/* Verify Response */}
              <div className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-6">
                <h3 className="text-xl font-bold text-slate-100 mb-4">/verify Response</h3>
                
                <div className="space-y-4">
                  <div className="bg-green-900/20 border border-green-500/30 rounded p-4">
                    <h4 className="text-green-300 font-semibold mb-2">Valid Payment</h4>
                    <pre className="text-xs overflow-x-auto"><code className="text-green-400">{`{
  "isValid": true,
  "payer": "0x67B662afAc6AE778134803aeB9a32d4fF0ECe84C"
}`}</code></pre>
                    <p className="text-sm text-green-300/70 mt-2">HTTP 200 + <code>isValid: true</code> = Payment signature is valid</p>
                  </div>

                  <div className="bg-red-900/20 border border-red-500/30 rounded p-4">
                    <h4 className="text-red-300 font-semibold mb-2">Invalid Payment</h4>
                    <pre className="text-xs overflow-x-auto"><code className="text-red-400">{`{
  "isValid": false,
  "invalidReason": "Insufficient balance: has 500000, needs 1000000"
}`}</code></pre>
                    <p className="text-sm text-red-300/70 mt-2">HTTP 200 + <code>isValid: false</code> = Check <code>invalidReason</code> for details</p>
                  </div>

                  <div className="bg-slate-800/60 border border-slate-600 rounded p-4 mt-4">
                    <h4 className="text-slate-300 font-semibold mb-2">Correct Handling:</h4>
                    <pre className="text-xs overflow-x-auto"><code className="text-cyan-400">{`if (response.ok && result.isValid) {
  // Payment is valid, proceed
} else if (response.ok && !result.isValid) {
  alert('Invalid: ' + result.invalidReason);
} else {
  // HTTP error (401, 500, etc)
  alert('API Error');
}`}</code></pre>
                  </div>
                </div>
              </div>

              {/* Settle Response */}
              <div className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-6">
                <h3 className="text-xl font-bold text-slate-100 mb-4">/settle Response</h3>
                
                <div className="space-y-4">
                  <div className="bg-amber-900/20 border border-amber-500/30 rounded p-4">
                    <h4 className="text-amber-300 font-semibold mb-2">Transaction Pending (IMPORTANT!)</h4>
                    <pre className="text-xs overflow-x-auto"><code className="text-amber-400">{`{
  "success": true,
  "transaction": "0x8f5e9c7b...",
  "network": "base-sepolia",
  "payer": "0x67B662...",
  "status": "pending",
  "message": "Transaction submitted and pending confirmation..."
}`}</code></pre>
                    <p className="text-sm text-amber-300/80 mt-2">
                      <strong>HTTP 200 + <code>success: true</code> + <code>status: "pending"</code></strong><br/>
                      Transaction submitted to blockchain but not yet confirmed (1-2 minutes).<br/>
                      <strong className="text-amber-200">You should still serve the content!</strong>
                    </p>
                  </div>

                  <div className="bg-green-900/20 border border-green-500/30 rounded p-4">
                    <h4 className="text-green-300 font-semibold mb-2">Transaction Completed</h4>
                    <pre className="text-xs overflow-x-auto"><code className="text-green-400">{`{
  "success": true,
  "transaction": "0x8f5e9c7b...",
  "network": "base-sepolia",
  "payer": "0x67B662...",
  "status": "completed"
}`}</code></pre>
                    <p className="text-sm text-green-300/70 mt-2">
                      HTTP 200 + <code>success: true</code> + <code>status: "completed"</code> = Fully confirmed on blockchain
                    </p>
                  </div>

                  <div className="bg-red-900/20 border border-red-500/30 rounded p-4">
                    <h4 className="text-red-300 font-semibold mb-2">Settlement Failed</h4>
                    <pre className="text-xs overflow-x-auto"><code className="text-red-400">{`{
  "success": false,
  "errorReason": "Transaction already settled with this nonce",
  "network": "base-sepolia",
  "status": "failed"
}`}</code></pre>
                    <p className="text-sm text-red-300/70 mt-2">
                      HTTP 200 + <code>success: false</code> = Settlement failed, check <code>errorReason</code>
                    </p>
                  </div>

                  <div className="bg-slate-800/60 border border-slate-600 rounded p-4 mt-4">
                    <h4 className="text-slate-300 font-semibold mb-2">Correct Handling:</h4>
                    <pre className="text-xs overflow-x-auto"><code className="text-cyan-400">{`if (response.ok && result.success) {
  if (result.status === 'pending') {
    console.log('Transaction pending confirmation...');
    // Still serve content! Transaction was submitted.
    serveProtectedContent();
  } else if (result.status === 'completed') {
    console.log('Transaction confirmed!');
    serveProtectedContent();
  }
} else if (response.ok && !result.success) {
  alert('Settlement failed: ' + result.errorReason);
} else {
  // HTTP error
  alert('API Error');
}`}</code></pre>
                  </div>
                </div>
              </div>

              {/* Common Error Reasons */}
              <div className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-6">
                <h3 className="text-xl font-bold text-slate-100 mb-4">Common Error Reasons</h3>
                
                <div className="space-y-3">
                  <div className="bg-slate-800/60 p-3 m-1 rounded">
                    <code className="text-red-400 text-sm">Network 'xxx' is not supported</code>
                    <p className="text-slate-400 text-xs mt-1">Use exact network names from /supported endpoint</p>
                  </div>

                  <div className="bg-slate-800/60 p-3 m-1 rounded">
                    <code className="text-red-400 text-sm">Invalid signature</code>
                    <p className="text-slate-400 text-xs mt-1">EIP-712 signature verification failed</p>
                  </div>

                  <div className="bg-slate-800/60 p-3 m-1 rounded">
                    <code className="text-red-400 text-sm">Insufficient balance</code>
                    <p className="text-slate-400 text-xs mt-1">Payer doesn't have enough tokens</p>
                  </div>

                  <div className="bg-slate-800/60 p-3 m-1 rounded">
                    <code className="text-red-400 text-sm">Payment expired</code>
                    <p className="text-slate-400 text-xs mt-1">Current time after validBefore timestamp</p>
                  </div>

                  <div className="bg-slate-800/60 p-3 m-1 rounded">
                    <code className="text-red-400 text-sm">Transaction already settled with this nonce</code>
                    <p className="text-slate-400 text-xs mt-1">Nonce was already used (replay attack prevention)</p>
                  </div>

                  <div className="bg-slate-800/60 p-3 m-1 rounded">
                    <code className="text-red-400 text-sm">Nonce already used</code>
                    <p className="text-slate-400 text-xs mt-1">Authorization already consumed on-chain</p>
                  </div>
                </div>
              </div>

              {/* Status Field Reference */}
              <div className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-6">
                <h3 className="text-xl font-bold text-slate-100 mb-4">Status Field Reference</h3>
                
                <table className="w-full text-sm">
                  <thead className="bg-slate-800/60">
                    <tr>
                      <th className="text-left p-3 text-slate-300">Status</th>
                      <th className="text-left p-3 text-slate-300">Meaning</th>
                      <th className="text-left p-3 text-slate-300">Action</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-400">
                    <tr className="border-t border-slate-700/40">
                      <td className="p-3"><code className="text-amber-400">pending</code></td>
                      <td className="p-3">Transaction submitted, awaiting confirmation</td>
                      <td className="p-3 text-green-400">[OK] Serve content</td>
                    </tr>
                    <tr className="border-t border-slate-700/40">
                      <td className="p-3"><code className="text-green-400">completed</code></td>
                      <td className="p-3">Transaction confirmed on blockchain</td>
                      <td className="p-3 text-green-400">[OK] Serve content</td>
                    </tr>
                    <tr className="border-t border-slate-700/40">
                      <td className="p-3"><code className="text-red-400">failed</code></td>
                      <td className="p-3">Transaction failed or was rejected</td>
                      <td className="p-3 text-red-400">[ERROR] Show error to user</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Best Practices */}
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-5">
                <h3 className="text-blue-300 font-bold mb-3">Best Practices</h3>
                <div className="space-y-2 text-sm text-blue-300/80">
                  <p>1. <strong>Always verify before settle</strong> - /verify is free, /settle costs gas</p>
                  <p>2. <strong>Check both HTTP status AND result fields</strong> - Don't rely on status code alone</p>
                  <p>3. <strong>Handle pending status gracefully</strong> - Show loading indicator but serve content</p>
                  <p>4. <strong>Provide user-friendly error messages</strong> - Map <code>errorReason</code> to readable text</p>
                  <p>5. <strong>Use lowercase network identifiers</strong> - "base-sepolia" not "Base Sepolia"</p>
                </div>
              </div>
            </div>
          )}

          {/* Merchant Endpoint Tab */}
          {activeTab === 'merchant' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-100 mb-2">GET /merchant</h2>
                <p className="text-slate-300">
                  Get the merchant information associated with your API key
                </p>
              </div>

              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
                <div className="flex gap-2">
                  <div>
                    <p className="text-amber-300 font-medium">Authentication Required</p>
                    <p className="text-amber-300/80 text-sm">Include your API key in the Authorization header</p>
                  </div>
                </div>
              </div>

              <div className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-6">
                <h3 className="text-lg font-bold text-slate-100 mb-3">Success Response (200 OK)</h3>
                <pre className="bg-slate-800/60 p-4 rounded-lg overflow-x-auto text-xs">
                  <code className="text-green-400 font-mono">{`{
  "success": true,
  "merchant": {
    "id": 1,
    "merchant_address": "0x1234...5678",
    "created_at": "2025-01-01T00:00:00.000Z",
    "updated_at": "2025-01-01T00:00:00.000Z",
    "is_active": true
  }
}`}</code>
                </pre>
              </div>

              <div className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-6">
                <h3 className="text-lg font-bold text-slate-100 mb-3">Error Response (401)</h3>
                <pre className="bg-slate-800/60 p-4 rounded-lg overflow-x-auto text-xs">
                  <code className="text-red-400 font-mono">{`{
  "error": "Unauthorized",
  "message": "Authentication required"
}`}</code>
                </pre>
              </div>

              <div className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-6">
                <h3 className="text-lg font-bold text-slate-100 mb-3">Example cURL</h3>
                <pre className="bg-slate-800/60 p-4 rounded-lg overflow-x-auto text-xs">
                  <code className="text-slate-300 font-mono">{`curl ${process.env.NEXT_PUBLIC_FACILITATOR_URL || 'http://localhost:8080'}/merchant \\
  -H "Authorization: Bearer YOUR_API_KEY"`}</code>
                </pre>
              </div>

              <div className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-6">
                <h3 className="text-lg font-bold text-slate-100 mb-3">Use Cases</h3>
                <ul className="space-y-2">
                  <li className="flex items-start gap-2 text-slate-300">
                    <span className="text-cyan-400 mt-1">•</span>
                    <span>Retrieve your merchant wallet address for payment requirements</span>
                  </li>
                  <li className="flex items-start gap-2 text-slate-300">
                    <span className="text-cyan-400 mt-1">•</span>
                    <span>Verify API key is valid and active</span>
                  </li>
                  <li className="flex items-start gap-2 text-slate-300">
                    <span className="text-cyan-400 mt-1">•</span>
                    <span>Get merchant account details including ID and timestamps</span>
                  </li>
                  <li className="flex items-start gap-2 text-slate-300">
                    <span className="text-cyan-400 mt-1">•</span>
                    <span>Display merchant information in admin dashboards</span>
                  </li>
                </ul>
              </div>

              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mt-6">
                <div className="flex gap-2">
                  <div>
                    <h4 className="text-blue-300 font-medium mb-2">Response Fields</h4>
                    <div className="text-blue-300/80 text-sm space-y-1">
                      <p><strong>id</strong> - Unique merchant identifier</p>
                      <p><strong>merchant_address</strong> - Wallet address for receiving payments</p>
                      <p><strong>created_at</strong> - Account creation timestamp</p>
                      <p><strong>updated_at</strong> - Last update timestamp</p>
                      <p><strong>is_active</strong> - Account active status</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
