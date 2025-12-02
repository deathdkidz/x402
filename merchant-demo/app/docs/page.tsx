'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function DocsPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'verify' | 'settle' | 'networks' | 'health' | 'merchant'>('overview');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-100 mb-2">API Documentation</h1>
            <p className="text-slate-400">Complete guide to the x402 Facilitator API</p>
          </div>
          <Link
            href="/"
            className="px-4 py-2 bg-slate-800/60 border border-slate-700/40 rounded-lg text-slate-300 hover:bg-slate-700/60 transition-colors"
          >
            ← Back to Home
          </Link>
        </div>

        {/* Navigation Tabs */}
        <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/30 rounded-xl p-2 mb-6">
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'overview', label: 'Overview', icon: '📖' },
              { id: 'verify', label: '/verify', icon: '✓' },
              { id: 'settle', label: '/settle', icon: '💰' },
              { id: 'networks', label: '/networks', icon: '🌐' },
              { id: 'health', label: '/health', icon: '💚' },
              { id: 'merchant', label: '/merchant', icon: '👤' },
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
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content Area */}
        <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/30 rounded-xl p-6">
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
                <ul className="space-y-2">
                  <li className="flex items-center gap-2 text-slate-300">
                    <span className="w-2 h-2 bg-cyan-400 rounded-full"></span>
                    Base Sepolia (Testnet)
                  </li>
                  <li className="flex items-center gap-2 text-slate-300">
                    <span className="w-2 h-2 bg-cyan-400 rounded-full"></span>
                    Ethereum Sepolia (Testnet)
                  </li>
                  <li className="flex items-center gap-2 text-slate-300">
                    <span className="w-2 h-2 bg-cyan-400 rounded-full"></span>
                    Base (Mainnet)
                  </li>
                  <li className="flex items-center gap-2 text-slate-300">
                    <span className="w-2 h-2 bg-cyan-400 rounded-full"></span>
                    Ethereum (Mainnet)
                  </li>
                </ul>
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
                  <span className="text-amber-400">🔒</span>
                  <div>
                    <p className="text-amber-300 font-medium">Authentication Required</p>
                    <p className="text-amber-300/80 text-sm">Include your API key in the Authorization header</p>
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
    "x402Version": 1,
    "payload": {
      "authorization": {
        "from": "0x1234...5678",
        "to": "0xMERCHANT_ADDRESS",
        "value": "1000000",
        "validAfter": "0",
        "validBefore": "9999999999",
        "nonce": "0xNONCE_BYTES32"
      },
      "signature": "0xSIGNATURE_HEX"
    }
  },
  "paymentRequirements": {
    "scheme": "exact",
    "network": "Base Sepolia",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "payTo": "0xMERCHANT_ADDRESS",
    "maxAmountRequired": "1000000",
    "resource": "/api/service",
    "description": "Payment for service",
    "mimeType": "application/json",
    "maxTimeoutSeconds": 300
  }
}`}</code>
                </pre>
              </div>

              <div className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-6">
                <h3 className="text-lg font-bold text-slate-100 mb-3">Success Response (200 OK)</h3>
                <pre className="bg-slate-800/60 p-4 rounded-lg overflow-x-auto text-xs">
                  <code className="text-green-400 font-mono">{`{
  "isValid": true,
  "is_valid": true,
  "payer": "0x1234...5678"
}`}</code>
                </pre>
              </div>

              <div className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-6">
                <h3 className="text-lg font-bold text-slate-100 mb-3">Error Response (200/500)</h3>
                <pre className="bg-slate-800/60 p-4 rounded-lg overflow-x-auto text-xs">
                  <code className="text-red-400 font-mono">{`{
  "isValid": false,
  "is_valid": false,
  "invalidReason": "Error description",
  "invalid_reason": "Error description",
  "payer": "0x1234...5678"
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
                  <span className="text-amber-400">🔒</span>
                  <div>
                    <p className="text-amber-300 font-medium">Authentication Required</p>
                    <p className="text-amber-300/80 text-sm">Include your API key in the Authorization header</p>
                  </div>
                </div>
              </div>

              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
                <div className="flex gap-2">
                  <span className="text-blue-400">ℹ️</span>
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
    "x402Version": 1,
    "payload": {
      "authorization": {
        "from": "0x1234...5678",
        "to": "0xMERCHANT_ADDRESS",
        "value": "1000000",
        "validAfter": "0",
        "validBefore": "9999999999",
        "nonce": "0xNONCE_BYTES32"
      },
      "signature": "0xSIGNATURE_HEX"
    }
  },
  "paymentRequirements": {
    "scheme": "exact",
    "network": "Base Sepolia",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "payTo": "0xMERCHANT_ADDRESS",
    "maxAmountRequired": "1000000",
    "resource": "/api/service",
    "description": "Payment for service",
    "mimeType": "application/json",
    "maxTimeoutSeconds": 300
  }
}`}</code>
                </pre>
              </div>

              <div className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-6">
                <h3 className="text-lg font-bold text-slate-100 mb-3">Success Response (200 OK)</h3>
                <pre className="bg-slate-800/60 p-4 rounded-lg overflow-x-auto text-xs">
                  <code className="text-green-400 font-mono">{`{
  "success": true,
  "transaction": "0xTRANSACTION_HASH",
  "transactionHash": "0xTRANSACTION_HASH",
  "network": "Base Sepolia",
  "payer": "0x1234...5678",
  "status": "completed",
  "message": "Settlement successful"
}`}</code>
                </pre>
              </div>

              <div className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-6">
                <h3 className="text-lg font-bold text-slate-100 mb-3">Error Response (200/500)</h3>
                <pre className="bg-slate-800/60 p-4 rounded-lg overflow-x-auto text-xs">
                  <code className="text-red-400 font-mono">{`{
  "success": false,
  "errorReason": "Error description",
  "error_reason": "Error description",
  "network": "Base Sepolia",
  "payer": "0x1234...5678",
  "status": "failed"
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

          {/* Networks Endpoint Tab */}
          {activeTab === 'networks' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-100 mb-2">GET /networks</h2>
                <p className="text-slate-300">
                  Get information about supported networks and their tokens
                </p>
              </div>

              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
                <div className="flex gap-2">
                  <span className="text-green-400">🔓</span>
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
  "networks": [
    {
      "network": "Base Sepolia",
      "chainId": 84532,
      "tokens": [
        {
          "symbol": "USDC",
          "name": "USD Coin",
          "address": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
          "decimals": 6,
          "eip712": {
            "name": "USDC",
            "version": "2",
            "verifyingContract": "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
          }
        }
      ],
      "rpcConfigured": true
    }
  ],
  "defaultNetwork": "Base Sepolia"
}`}</code>
                </pre>
              </div>

              <div className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-6">
                <h3 className="text-lg font-bold text-slate-100 mb-3">Example cURL</h3>
                <pre className="bg-slate-800/60 p-4 rounded-lg overflow-x-auto text-xs">
                  <code className="text-slate-300 font-mono">{`curl ${process.env.NEXT_PUBLIC_FACILITATOR_URL || 'http://localhost:8080'}/networks`}</code>
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
                  <span className="text-green-400">🔓</span>
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
  "timestamp": 1701450000000,
  "uptime": 3600,
  "supportedNetworks": [
    "Base Sepolia",
    "Ethereum Sepolia",
    "Base",
    "Ethereum"
  ]
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
                  <span className="text-amber-400">🔒</span>
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
                  <span className="text-blue-400">ℹ️</span>
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

        {/* Quick Links */}
        <div className="mt-8 grid md:grid-cols-3 gap-4">
          <Link
            href="/demo"
            className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/30 rounded-xl p-6 hover:border-cyan-500/30 transition-colors group"
          >
            <div className="text-3xl mb-3">🛒</div>
            <h3 className="text-lg font-bold text-slate-100 mb-2 group-hover:text-cyan-400 transition-colors">
              Try Demo
            </h3>
            <p className="text-sm text-slate-400">
              Experience the payment flow with our demo store
            </p>
          </Link>

          <Link
            href="/test"
            className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/30 rounded-xl p-6 hover:border-cyan-500/30 transition-colors group"
          >
            <div className="text-3xl mb-3">🧪</div>
            <h3 className="text-lg font-bold text-slate-100 mb-2 group-hover:text-cyan-400 transition-colors">
              API Testing
            </h3>
            <p className="text-sm text-slate-400">
              Test all endpoints with an interactive interface
            </p>
          </Link>

          <a
            href="https://github.com/deathdkidz/x402"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/30 rounded-xl p-6 hover:border-cyan-500/30 transition-colors group"
          >
            <div className="text-3xl mb-3">📦</div>
            <h3 className="text-lg font-bold text-slate-100 mb-2 group-hover:text-cyan-400 transition-colors">
              GitHub
            </h3>
            <p className="text-sm text-slate-400">
              View source code and contribute
            </p>
          </a>
        </div>
      </div>
    </div>
  );
}
